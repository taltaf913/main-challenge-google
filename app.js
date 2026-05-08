/**
 * Dynamic Travel Engine PoC - Core Logic
 * Designed for efficiency and security (XSS prevention via DOM APIs).
 */

// User Context
const UserState = {
    budgetRemaining: 150,
    updateBudget(amount) {
        this.budgetRemaining -= amount;
        const badge = document.getElementById('budget-badge');
        badge.textContent = `Budget: $${this.budgetRemaining}`;
        if (this.budgetRemaining < 50) {
            badge.classList.add('alert');
        } else {
            badge.classList.remove('alert');
        }
    }
};

// Initial state of the itinerary
const initialItinerary = [
    { id: '1', time: '09:00 AM', timeMins: 540, duration: 60, title: 'Breakfast at The Local Cafe', desc: 'Highly rated pastries.', icon: 'fa-coffee', type: 'indoor', cost: 20 },
    { id: '2', time: '10:30 AM', timeMins: 630, duration: 120, title: 'Botanical Gardens Walk', desc: 'Outdoor activity. Weather dependent.', icon: 'fa-leaf', type: 'outdoor', cost: 15 },
    { id: '3', time: '01:00 PM', timeMins: 780, duration: 60, title: 'Lunch at Seaside Grill', desc: 'Premium seafood reservation.', icon: 'fa-utensils', type: 'indoor', cost: 60 },
    { id: '4', time: '02:30 PM', timeMins: 870, duration: 120, title: 'Historical Guided Tour', desc: 'Walking tour of old town.', icon: 'fa-map', type: 'outdoor', cost: 30 },
    { id: '5', time: '05:00 PM', timeMins: 1020, duration: 0, title: 'Flight Departure (AB123)', desc: 'Terminal 1. Be at gate by 04:30 PM.', icon: 'fa-plane', type: 'transit', cost: 0 }
];

let currentItinerary = JSON.parse(JSON.stringify(initialItinerary));

// ----------------------------------------------------------------------
// Secure Rendering Engine
// ----------------------------------------------------------------------
const itineraryEl = document.getElementById('itinerary');

function renderItinerary(items, animateNew = false) {
    itineraryEl.innerHTML = ''; // Clear container securely
    
    items.forEach((item, index) => {
        if (item.dropped) return; // Skip dropped items

        const div = document.createElement('div');
        div.className = `timeline-item ${item.replaced ? 'replaced' : ''} ${item.isNew && animateNew ? 'new-item' : ''}`;
        div.style.animationDelay = `${index * 0.1}s`;
        
        // Icon container
        const timeDot = document.createElement('div');
        timeDot.className = 'time-dot';
        const icon = document.createElement('i');
        icon.className = `fa-solid ${item.icon}`;
        timeDot.appendChild(icon);
        
        // Content container
        const content = document.createElement('div');
        content.className = 'item-content';
        
        // Meta (Time & Cost)
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        const time = document.createElement('span');
        time.className = 'item-time';
        time.textContent = item.time;
        const cost = document.createElement('span');
        cost.className = 'item-cost';
        cost.textContent = item.cost > 0 ? `$${item.cost}` : 'Free';
        meta.appendChild(time);
        meta.appendChild(cost);
        
        // Title & Desc
        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = item.title; // Secure from XSS
        
        const desc = document.createElement('div');
        desc.className = 'item-desc';
        desc.textContent = item.desc;   // Secure from XSS
        
        content.appendChild(meta);
        content.appendChild(title);
        content.appendChild(desc);
        
        div.appendChild(timeDot);
        div.appendChild(content);
        
        itineraryEl.appendChild(div);
    });
}

function showToast(titleText, messageText) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-title').textContent = titleText;
    document.getElementById('toast-message').textContent = messageText;
    
    toast.classList.remove('hidden');
    void toast.offsetWidth; // Reflow
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 6000);
}

// Format minutes from midnight to AM/PM string
function formatTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ----------------------------------------------------------------------
// Re-Routing Engine Logic
// ----------------------------------------------------------------------

const ReRoutEngine = {
    // Helper to find index
    findIndex(id) {
        return currentItinerary.findIndex(i => i.id === id && !i.replaced && !i.dropped);
    },

    // Scenario 1: Rain Event (Outdoor to Indoor)
    handleRain() {
        const outdoorItems = currentItinerary.filter(i => i.type === 'outdoor' && !i.replaced && !i.dropped);
        if (outdoorItems.length > 0) {
            const target = outdoorItems[0];
            const idx = this.findIndex(target.id);
            
            currentItinerary[idx].replaced = true;
            const alternative = {
                id: Date.now().toString(), time: target.time, timeMins: target.timeMins, duration: target.duration,
                title: 'City Art Museum', desc: 'Indoor alternative avoiding the rain.', icon: 'fa-building-columns', type: 'indoor', cost: 18, isNew: true
            };
            currentItinerary.splice(idx + 1, 0, alternative);
            
            renderItinerary(currentItinerary, true);
            showToast("Weather Alert: Rain Detected", `Replaced '${target.title}' with an indoor activity.`);
        }
    },

    // Scenario 2: Venue at Capacity (Proximity reroute)
    handleVenueFull() {
        const idx = this.findIndex('3'); // Target lunch
        if (idx > -1) {
            const target = currentItinerary[idx];
            currentItinerary[idx].replaced = true;
            
            const alternative = {
                id: Date.now().toString(), time: target.time, timeMins: target.timeMins, duration: target.duration,
                title: 'Harbor Street Bistro', desc: 'Seaside Grill is full. Secured a table nearby.', icon: 'fa-utensils', type: 'indoor', cost: 45, isNew: true
            };
            currentItinerary.splice(idx + 1, 0, alternative);
            
            renderItinerary(currentItinerary, true);
            showToast("Venue Alert: Capacity Reached", `Seaside Grill is fully booked. Rerouted to nearby Harbor Street Bistro.`);
        }
    },

    // Scenario 3: Budget Exhaustion (High cost to low cost)
    handleOverBudget() {
        // Simulate overspending at previous activity
        UserState.updateBudget(120); 
        
        // Find next highest cost activity
        let highestCostIdx = -1;
        let maxCost = 0;
        currentItinerary.forEach((item, index) => {
            if (!item.replaced && !item.dropped && item.cost > maxCost && item.type !== 'transit') {
                maxCost = item.cost;
                highestCostIdx = index;
            }
        });

        if (highestCostIdx > -1) {
            const target = currentItinerary[highestCostIdx];
            currentItinerary[highestCostIdx].replaced = true;
            
            const alternative = {
                id: Date.now().toString(), time: target.time, timeMins: target.timeMins, duration: target.duration,
                title: 'Public City Viewpoint', desc: 'Free activity to stay within remaining budget.', icon: 'fa-camera', type: 'outdoor', cost: 0, isNew: true
            };
            currentItinerary.splice(highestCostIdx + 1, 0, alternative);
            
            renderItinerary(currentItinerary, true);
            showToast("Budget Alert: Low Funds", `You are running low on budget. Replaced '${target.title}' with a free activity.`);
        }
    },

    // Scenario 4: Cascading Delay (Traffic Jam)
    handleTraffic() {
        const delayMins = 45;
        const startIdx = this.findIndex('2'); // Traffic hits before Botanical gardens
        
        if (startIdx > -1) {
            let currentMins = currentItinerary[startIdx].timeMins + delayMins;
            let droppedCount = 0;

            for (let i = startIdx; i < currentItinerary.length; i++) {
                const item = currentItinerary[i];
                if (item.replaced || item.dropped) continue;

                // Update time for the activity
                const oldItem = { ...item };
                item.replaced = true; // Mark old as replaced for visual effect
                
                // If the new time pushes into the flight departure, drop it
                if (item.type !== 'transit' && (currentMins + item.duration) > 1020) { 
                    item.dropped = true; 
                    droppedCount++;
                    continue; 
                }

                const newItem = {
                    ...oldItem, id: Date.now().toString() + i, time: formatTime(currentMins), timeMins: currentMins, isNew: true, replaced: false,
                    desc: oldItem.type === 'transit' ? 'Flight remains on time.' : 'Rescheduled due to traffic.'
                };
                
                currentItinerary.splice(i + 1, 0, newItem);
                currentMins += newItem.duration + 30; // 30 mins travel buffer
                i++; // Skip the newly inserted item in the loop
            }
            
            renderItinerary(currentItinerary, true);
            showToast("Transit Alert: Heavy Traffic", `Schedule delayed by 45 mins. ${droppedCount > 0 ? 'Some activities were dropped to ensure you make your flight.' : 'Subsequent events shifted.'}`);
        }
    },

    // Scenario 5: Flight Delay (Adding filler)
    handleFlightDelay() {
        const idx = currentItinerary.findIndex(i => i.type === 'transit' && !i.replaced);
        if (idx > -1) {
            const target = currentItinerary[idx];
            currentItinerary[idx].replaced = true;
            
            const newFlight = { ...target, time: '07:00 PM', timeMins: 1140, desc: 'Delayed by 2 hours. Terminal 1.', isNew: true, id: Date.now().toString(), replaced: false };
            
            const fillerActivity = {
                id: Date.now().toString() + 'f', time: formatTime(target.timeMins), timeMins: target.timeMins, duration: 120,
                title: 'Premium Airport Lounge', desc: 'Using 2 extra hours. Matches Foodie profile.', icon: 'fa-martini-glass-citrus', type: 'indoor', cost: 0, isNew: true
            };
            
            currentItinerary.splice(idx + 1, 0, fillerActivity, newFlight);
            
            renderItinerary(currentItinerary, true);
            showToast("Transit Alert: Flight Delayed", "Flight delayed by 2 hours. Added Airport Lounge access to your plan.");
        }
    }
};

// ----------------------------------------------------------------------
// Event Listeners (Event Bus Simulation)
// ----------------------------------------------------------------------

document.querySelectorAll('.sim-btn:not(.reset)').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const eventType = e.currentTarget.dataset.event;
        
        switch(eventType) {
            case 'rain': ReRoutEngine.handleRain(); break;
            case 'venue_full': ReRoutEngine.handleVenueFull(); break;
            case 'over_budget': ReRoutEngine.handleOverBudget(); break;
            case 'traffic': ReRoutEngine.handleTraffic(); break;
            case 'delay': ReRoutEngine.handleFlightDelay(); break;
        }
    });
});

document.getElementById('btn-reset').addEventListener('click', () => {
    currentItinerary = JSON.parse(JSON.stringify(initialItinerary));
    UserState.budgetRemaining = 150;
    UserState.updateBudget(0); // reset UI
    renderItinerary(currentItinerary);
});

// Initial Load
UserState.updateBudget(0);
renderItinerary(currentItinerary);
