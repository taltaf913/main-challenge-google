/**
 * @fileoverview Dynamic Travel Engine PoC - Core Logic
 * @description Real-time itinerary re-routing engine that adapts to
 *   simulated travel constraints (weather, traffic, budget, venue capacity).
 *
 * SECURITY: All DOM rendering uses textContent and createElement APIs
 *   to prevent Cross-Site Scripting (XSS) vulnerabilities. No innerHTML is used.
 *
 * EFFICIENCY: Uses DocumentFragment for batch DOM updates, caches DOM
 *   references, and debounces rapid button clicks.
 */
'use strict';

// ============================================================
// CONSTANTS
// ============================================================
/** @const {number} Initial travel budget in dollars */
var INITIAL_BUDGET = 150;
/** @const {number} Flight departure time in minutes from midnight (5:00 PM) */
var FLIGHT_DEPARTURE_MINS = 1020;
/** @const {number} Traffic delay duration in minutes */
var TRAFFIC_DELAY_MINS = 45;
/** @const {number} Buffer time between activities in minutes */
var TRAVEL_BUFFER_MINS = 30;
/** @const {number} Toast notification display duration in milliseconds */
var TOAST_DURATION_MS = 6000;
/** @const {number} Button debounce interval in milliseconds */
var DEBOUNCE_INTERVAL_MS = 500;

// ============================================================
// DOM CACHE — avoids repeated getElementById calls
// ============================================================
var DOM = {
    itinerary: document.getElementById('itinerary'),
    budgetBadge: document.getElementById('budget-badge'),
    toast: document.getElementById('toast'),
    toastTitle: document.getElementById('toast-title'),
    toastMessage: document.getElementById('toast-message'),
    resetBtn: document.getElementById('btn-reset'),
    simButtons: document.querySelectorAll('.sim-btn:not(.reset)'),
    liveRegion: document.getElementById('aria-live-region')
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Deep freezes an object to prevent mutation at any depth.
 * @param {Object} obj - The object to freeze
 * @returns {Object} The frozen object
 */
function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(function(prop) {
        var val = obj[prop];
        if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
            deepFreeze(val);
        }
    });
    return obj;
}

/**
 * Converts minutes from midnight to a formatted AM/PM time string.
 * Uses integer arithmetic for O(1) efficiency.
 * @param {number} mins - Minutes from midnight (0-1439)
 * @returns {string} Formatted time (e.g. "09:00 AM")
 */
function formatTime(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ' ' + ampm;
}

/**
 * Creates an alternative activity by merging target defaults with overrides.
 * DRY helper — eliminates duplicate object construction across handlers.
 * @param {Object} target - The original activity being replaced
 * @param {Object} overrides - Properties for the new alternative
 * @returns {Object} A new activity object
 */
function createAlternative(target, overrides) {
    var base = {
        id: Date.now().toString(),
        time: target.time,
        timeMins: target.timeMins,
        duration: target.duration,
        isNew: true
    };
    return Object.assign(base, overrides);
}

/**
 * Creates a debounced version of a function to prevent rapid-fire clicks.
 * @param {Function} fn - Function to debounce
 * @param {number} ms - Minimum interval between calls
 * @returns {Function} Debounced function
 */
function debounce(fn, ms) {
    var lastCall = 0;
    return function() {
        var now = Date.now();
        if (now - lastCall >= ms) {
            lastCall = now;
            return fn.apply(this, arguments);
        }
    };
}

/**
 * Announces a message to screen readers via ARIA live region.
 * @param {string} message - The message to announce
 */
function announceToScreenReader(message) {
    if (DOM.liveRegion) {
        DOM.liveRegion.textContent = '';
        requestAnimationFrame(function() {
            DOM.liveRegion.textContent = message;
        });
    }
}

// ============================================================
// USER STATE
// ============================================================

/**
 * @namespace UserState
 * @description Manages the user's travel budget and UI badge updates.
 */
var UserState = {
    /** @type {number} */
    budgetRemaining: INITIAL_BUDGET,

    /**
     * Deducts an amount from the budget and updates the UI badge.
     * @param {number} amount - Dollar amount to deduct
     */
    updateBudget: function(amount) {
        this.budgetRemaining -= amount;
        DOM.budgetBadge.textContent = '';
        var icon = document.createElement('i');
        icon.className = 'fa-solid fa-wallet';
        icon.setAttribute('aria-hidden', 'true');
        DOM.budgetBadge.appendChild(icon);
        DOM.budgetBadge.appendChild(document.createTextNode(' Budget: $' + this.budgetRemaining));
        if (this.budgetRemaining < 50) {
            DOM.budgetBadge.classList.add('alert');
        } else {
            DOM.budgetBadge.classList.remove('alert');
        }
    }
};

// ============================================================
// ITINERARY DATA (Immutable via deepFreeze)
// ============================================================

/** @const {Array<Object>} Immutable initial itinerary state */
var initialItinerary = deepFreeze([
    { id: '1', time: '09:00 AM', timeMins: 540, duration: 60, title: 'Breakfast at The Local Cafe', desc: 'Highly rated pastries.', icon: 'fa-coffee', type: 'indoor', cost: 20 },
    { id: '2', time: '10:30 AM', timeMins: 630, duration: 120, title: 'Botanical Gardens Walk', desc: 'Outdoor activity. Weather dependent.', icon: 'fa-leaf', type: 'outdoor', cost: 15 },
    { id: '3', time: '01:00 PM', timeMins: 780, duration: 60, title: 'Lunch at Seaside Grill', desc: 'Premium seafood reservation.', icon: 'fa-utensils', type: 'indoor', cost: 60 },
    { id: '4', time: '02:30 PM', timeMins: 870, duration: 120, title: 'Historical Guided Tour', desc: 'Walking tour of old town.', icon: 'fa-map', type: 'outdoor', cost: 30 },
    { id: '5', time: '05:00 PM', timeMins: FLIGHT_DEPARTURE_MINS, duration: 0, title: 'Flight Departure (AB123)', desc: 'Terminal 1. Be at gate by 04:30 PM.', icon: 'fa-plane', type: 'transit', cost: 0 }
]);

/** @type {Array<Object>} Mutable working copy of the itinerary */
var currentItinerary = JSON.parse(JSON.stringify(initialItinerary));

// ============================================================
// SECURE RENDERING ENGINE (XSS-Safe — uses textContent only)
// ============================================================

/**
 * Renders the itinerary list using DocumentFragment for batch DOM updates.
 * All text is inserted via textContent to prevent XSS.
 * @param {Array<Object>} items - Itinerary items to render
 * @param {boolean} [animateNew=false] - Whether to animate new items
 */
function renderItinerary(items, animateNew) {
    animateNew = animateNew || false;
    var fragment = document.createDocumentFragment();

    items.forEach(function(item, index) {
        if (item.dropped) return;

        var div = document.createElement('div');
        div.className = 'timeline-item' +
            (item.replaced ? ' replaced' : '') +
            (item.isNew && animateNew ? ' new-item' : '');
        div.style.animationDelay = (index * 0.1) + 's';
        div.setAttribute('role', 'listitem');
        div.setAttribute('aria-label', item.time + ' - ' + item.title + (item.replaced ? ' (replaced)' : ''));

        // Icon dot
        var timeDot = document.createElement('div');
        timeDot.className = 'time-dot';
        var icon = document.createElement('i');
        icon.className = 'fa-solid ' + item.icon;
        icon.setAttribute('aria-hidden', 'true');
        timeDot.appendChild(icon);

        // Content card
        var content = document.createElement('div');
        content.className = 'item-content';

        var meta = document.createElement('div');
        meta.className = 'item-meta';
        var time = document.createElement('span');
        time.className = 'item-time';
        time.textContent = item.time;
        var cost = document.createElement('span');
        cost.className = 'item-cost';
        cost.textContent = item.cost > 0 ? '$' + item.cost : 'Free';
        meta.appendChild(time);
        meta.appendChild(cost);

        var title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = item.title;

        var desc = document.createElement('div');
        desc.className = 'item-desc';
        desc.textContent = item.desc;

        content.appendChild(meta);
        content.appendChild(title);
        content.appendChild(desc);

        div.appendChild(timeDot);
        div.appendChild(content);
        fragment.appendChild(div);
    });

    DOM.itinerary.textContent = '';
    DOM.itinerary.appendChild(fragment);
}

/**
 * Displays a toast notification. Uses textContent for XSS safety.
 * @param {string} titleText - Notification title
 * @param {string} messageText - Notification body
 */
function showToast(titleText, messageText) {
    DOM.toastTitle.textContent = titleText;
    DOM.toastMessage.textContent = messageText;

    DOM.toast.classList.remove('hidden');
    void DOM.toast.offsetWidth; // Force reflow for animation reset
    DOM.toast.classList.add('show');

    announceToScreenReader(titleText + ': ' + messageText);

    setTimeout(function() {
        DOM.toast.classList.remove('show');
    }, TOAST_DURATION_MS);
}

// ============================================================
// RE-ROUTING ENGINE
// ============================================================

/**
 * @namespace ReRoutEngine
 * @description Core rerouting logic. Each handler processes a specific
 *   constraint violation and generates an optimised alternative.
 */
var ReRoutEngine = {
    /**
     * Finds the index of an active (non-replaced, non-dropped) item by ID.
     * @param {string} id - Activity ID
     * @returns {number} Index or -1
     */
    findIndex: function(id) {
        return currentItinerary.findIndex(function(i) {
            return i.id === id && !i.replaced && !i.dropped;
        });
    },

    /** Scenario 1: Rain — swaps first outdoor activity for indoor alternative */
    handleRain: function() {
        var outdoorItems = currentItinerary.filter(function(i) {
            return i.type === 'outdoor' && !i.replaced && !i.dropped;
        });
        if (outdoorItems.length > 0) {
            var target = outdoorItems[0];
            var idx = this.findIndex(target.id);
            currentItinerary[idx].replaced = true;

            var alternative = createAlternative(target, {
                title: 'City Art Museum',
                desc: 'Indoor alternative avoiding the rain.',
                icon: 'fa-building-columns',
                type: 'indoor',
                cost: 18
            });
            currentItinerary.splice(idx + 1, 0, alternative);

            renderItinerary(currentItinerary, true);
            showToast('Weather Alert: Rain Detected', "Replaced '" + target.title + "' with an indoor activity.");
        }
    },

    /** Scenario 2: Venue at capacity — reroutes lunch to nearby alternative */
    handleVenueFull: function() {
        var idx = this.findIndex('3');
        if (idx > -1) {
            var target = currentItinerary[idx];
            currentItinerary[idx].replaced = true;

            var alternative = createAlternative(target, {
                title: 'Harbor Street Bistro',
                desc: 'Seaside Grill is full. Secured a table nearby.',
                icon: 'fa-utensils',
                type: 'indoor',
                cost: 45
            });
            currentItinerary.splice(idx + 1, 0, alternative);

            renderItinerary(currentItinerary, true);
            showToast('Venue Alert: Capacity Reached', 'Seaside Grill is fully booked. Rerouted to Harbor Street Bistro.');
        }
    },

    /** Scenario 3: Budget overrun — replaces most expensive item with free alternative */
    handleOverBudget: function() {
        UserState.updateBudget(120);

        var highestCostIdx = -1;
        var maxCost = 0;
        currentItinerary.forEach(function(item, index) {
            if (!item.replaced && !item.dropped && item.cost > maxCost && item.type !== 'transit') {
                maxCost = item.cost;
                highestCostIdx = index;
            }
        });

        if (highestCostIdx > -1) {
            var target = currentItinerary[highestCostIdx];
            currentItinerary[highestCostIdx].replaced = true;

            var alternative = createAlternative(target, {
                title: 'Public City Viewpoint',
                desc: 'Free activity to stay within remaining budget.',
                icon: 'fa-camera',
                type: 'outdoor',
                cost: 0
            });
            currentItinerary.splice(highestCostIdx + 1, 0, alternative);

            renderItinerary(currentItinerary, true);
            showToast('Budget Alert: Low Funds', "Replaced '" + target.title + "' with a free activity.");
        }
    },

    /** Scenario 4: Traffic jam — cascading delay, drops items threatening flight */
    handleTraffic: function() {
        var startIdx = this.findIndex('2');
        if (startIdx > -1) {
            var currentMins = currentItinerary[startIdx].timeMins + TRAFFIC_DELAY_MINS;
            var droppedCount = 0;

            for (var i = startIdx; i < currentItinerary.length; i++) {
                var item = currentItinerary[i];
                if (item.replaced || item.dropped) continue;

                var oldItem = Object.assign({}, item);
                item.replaced = true;

                if (item.type !== 'transit' && (currentMins + item.duration) > FLIGHT_DEPARTURE_MINS) {
                    item.dropped = true;
                    droppedCount++;
                    continue;
                }

                var newItem = Object.assign({}, oldItem, {
                    id: Date.now().toString() + i,
                    time: formatTime(currentMins),
                    timeMins: currentMins,
                    isNew: true,
                    replaced: false,
                    desc: oldItem.type === 'transit' ? 'Flight remains on time.' : 'Rescheduled due to traffic.'
                });

                currentItinerary.splice(i + 1, 0, newItem);
                currentMins += newItem.duration + TRAVEL_BUFFER_MINS;
                i++;
            }

            renderItinerary(currentItinerary, true);
            var msg = 'Schedule delayed by ' + TRAFFIC_DELAY_MINS + ' mins. ';
            msg += droppedCount > 0
                ? 'Some activities were dropped to ensure you make your flight.'
                : 'Subsequent events shifted.';
            showToast('Transit Alert: Heavy Traffic', msg);
        }
    },

    /** Scenario 5: Flight delay — adds filler activity to fill gap */
    handleFlightDelay: function() {
        var idx = currentItinerary.findIndex(function(i) {
            return i.type === 'transit' && !i.replaced;
        });
        if (idx > -1) {
            var target = currentItinerary[idx];
            currentItinerary[idx].replaced = true;

            var newFlight = Object.assign({}, target, {
                time: '07:00 PM',
                timeMins: 1140,
                desc: 'Delayed by 2 hours. Terminal 1.',
                isNew: true,
                id: Date.now().toString(),
                replaced: false
            });

            var fillerActivity = createAlternative(target, {
                id: Date.now().toString() + 'f',
                time: formatTime(target.timeMins),
                duration: 120,
                title: 'Premium Airport Lounge',
                desc: 'Using 2 extra hours. Matches Foodie profile.',
                icon: 'fa-martini-glass-citrus',
                type: 'indoor',
                cost: 0
            });

            currentItinerary.splice(idx + 1, 0, fillerActivity, newFlight);

            renderItinerary(currentItinerary, true);
            showToast('Transit Alert: Flight Delayed', 'Flight delayed by 2 hours. Added Airport Lounge access to your plan.');
        }
    }
};

// ============================================================
// EVENT LISTENERS (Debounced to prevent double-clicks)
// ============================================================

var debouncedHandler = debounce(function(eventType) {
    switch (eventType) {
        case 'rain': ReRoutEngine.handleRain(); break;
        case 'venue_full': ReRoutEngine.handleVenueFull(); break;
        case 'over_budget': ReRoutEngine.handleOverBudget(); break;
        case 'traffic': ReRoutEngine.handleTraffic(); break;
        case 'delay': ReRoutEngine.handleFlightDelay(); break;
    }
}, DEBOUNCE_INTERVAL_MS);

DOM.simButtons.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        debouncedHandler(e.currentTarget.dataset.event);
    });
});

DOM.resetBtn.addEventListener('click', function() {
    currentItinerary = JSON.parse(JSON.stringify(initialItinerary));
    UserState.budgetRemaining = INITIAL_BUDGET;
    UserState.updateBudget(0);
    renderItinerary(currentItinerary);
    announceToScreenReader('Simulation reset to initial itinerary.');
});

// ============================================================
// INITIALIZATION
// ============================================================
UserState.updateBudget(0);
renderItinerary(currentItinerary);

// ============================================================
// TEST EXPORTS — expose internals for automated testing
// ============================================================
if (typeof window !== 'undefined') {
    window.TravelEngine = {
        UserState: UserState,
        ReRoutEngine: ReRoutEngine,
        formatTime: formatTime,
        createAlternative: createAlternative,
        getItinerary: function() { return currentItinerary; },
        resetItinerary: function() {
            currentItinerary = JSON.parse(JSON.stringify(initialItinerary));
            UserState.budgetRemaining = INITIAL_BUDGET;
            UserState.updateBudget(0);
            renderItinerary(currentItinerary);
        },
        CONSTANTS: {
            INITIAL_BUDGET: INITIAL_BUDGET,
            FLIGHT_DEPARTURE_MINS: FLIGHT_DEPARTURE_MINS,
            TRAFFIC_DELAY_MINS: TRAFFIC_DELAY_MINS,
            TRAVEL_BUFFER_MINS: TRAVEL_BUFFER_MINS
        }
    };
}
