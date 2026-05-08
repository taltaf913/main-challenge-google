/**
 * @fileoverview Lightweight test suite for the TravelEngine PoC.
 * Runs automatically when loaded. No external test framework required.
 */
'use strict';

var TestRunner = {
    passed: 0,
    failed: 0,
    results: [],

    /**
     * Asserts a condition is truthy.
     * @param {boolean} condition
     * @param {string} name - Test name
     */
    assert: function(condition, name) {
        if (condition) {
            this.passed++;
            this.results.push({ name: name, status: 'pass' });
        } else {
            this.failed++;
            this.results.push({ name: name, status: 'fail' });
            console.error('FAIL: ' + name);
        }
    },

    /**
     * Asserts two values are strictly equal.
     * @param {*} actual
     * @param {*} expected
     * @param {string} name
     */
    assertEqual: function(actual, expected, name) {
        this.assert(actual === expected, name + ' (got: ' + actual + ', expected: ' + expected + ')');
    },

    /** Resets the engine state before each test */
    setup: function() {
        window.TravelEngine.resetItinerary();
    },

    // ---- Individual Tests ----

    testFormatTime: function() {
        var fmt = window.TravelEngine.formatTime;
        this.assertEqual(fmt(0), '12:00 AM', 'formatTime: midnight');
        this.assertEqual(fmt(540), '09:00 AM', 'formatTime: 9 AM');
        this.assertEqual(fmt(780), '01:00 PM', 'formatTime: 1 PM');
        this.assertEqual(fmt(1020), '05:00 PM', 'formatTime: 5 PM');
        this.assertEqual(fmt(720), '12:00 PM', 'formatTime: noon');
    },

    testCreateAlternative: function() {
        var create = window.TravelEngine.createAlternative;
        var target = { time: '09:00 AM', timeMins: 540, duration: 60 };
        var alt = create(target, { title: 'Test', cost: 10 });

        this.assertEqual(alt.time, '09:00 AM', 'createAlternative: inherits time');
        this.assertEqual(alt.timeMins, 540, 'createAlternative: inherits timeMins');
        this.assertEqual(alt.duration, 60, 'createAlternative: inherits duration');
        this.assertEqual(alt.title, 'Test', 'createAlternative: applies override title');
        this.assertEqual(alt.cost, 10, 'createAlternative: applies override cost');
        this.assertEqual(alt.isNew, true, 'createAlternative: sets isNew');
        this.assert(typeof alt.id === 'string', 'createAlternative: generates string id');
    },

    testHandleRain: function() {
        this.setup();
        var engine = window.TravelEngine.ReRoutEngine;
        engine.handleRain();
        var items = window.TravelEngine.getItinerary();

        var replaced = items.filter(function(i) { return i.replaced && !i.dropped; });
        var newItems = items.filter(function(i) { return i.isNew; });

        this.assert(replaced.length >= 1, 'handleRain: marks outdoor item as replaced');
        this.assert(newItems.length >= 1, 'handleRain: adds indoor alternative');
        this.assertEqual(newItems[0].type, 'indoor', 'handleRain: alternative is indoor');
    },

    testHandleVenueFull: function() {
        this.setup();
        var engine = window.TravelEngine.ReRoutEngine;
        engine.handleVenueFull();
        var items = window.TravelEngine.getItinerary();

        var newItems = items.filter(function(i) { return i.isNew; });
        this.assert(newItems.length >= 1, 'handleVenueFull: adds alternative venue');
        this.assertEqual(newItems[0].title, 'Harbor Street Bistro', 'handleVenueFull: correct alternative');
    },

    testHandleOverBudget: function() {
        this.setup();
        var engine = window.TravelEngine.ReRoutEngine;
        engine.handleOverBudget();

        var budget = window.TravelEngine.UserState.budgetRemaining;
        this.assert(budget < window.TravelEngine.CONSTANTS.INITIAL_BUDGET, 'handleOverBudget: budget decreased');

        var items = window.TravelEngine.getItinerary();
        var freeItems = items.filter(function(i) { return i.isNew && i.cost === 0; });
        this.assert(freeItems.length >= 1, 'handleOverBudget: adds free alternative');
    },

    testHandleTraffic: function() {
        this.setup();
        var engine = window.TravelEngine.ReRoutEngine;
        engine.handleTraffic();
        var items = window.TravelEngine.getItinerary();

        var rescheduled = items.filter(function(i) { return i.isNew; });
        this.assert(rescheduled.length >= 1, 'handleTraffic: reschedules items');

        // Verify flight is not dropped
        var flight = items.filter(function(i) { return i.type === 'transit' && !i.dropped; });
        this.assert(flight.length >= 1, 'handleTraffic: preserves flight');
    },

    testHandleFlightDelay: function() {
        this.setup();
        var engine = window.TravelEngine.ReRoutEngine;
        engine.handleFlightDelay();
        var items = window.TravelEngine.getItinerary();

        var lounge = items.filter(function(i) { return i.title === 'Premium Airport Lounge'; });
        this.assert(lounge.length >= 1, 'handleFlightDelay: adds lounge filler');

        var newFlight = items.filter(function(i) { return i.type === 'transit' && i.isNew; });
        this.assert(newFlight.length >= 1, 'handleFlightDelay: reschedules flight');
        this.assertEqual(newFlight[0].timeMins, 1140, 'handleFlightDelay: new time is 7 PM');
    },

    testReset: function() {
        window.TravelEngine.ReRoutEngine.handleRain();
        window.TravelEngine.resetItinerary();
        var items = window.TravelEngine.getItinerary();

        this.assertEqual(items.length, 5, 'reset: restores 5 items');
        var anyNew = items.some(function(i) { return i.isNew || i.replaced || i.dropped; });
        this.assert(!anyNew, 'reset: no items are marked as new/replaced/dropped');
        this.assertEqual(window.TravelEngine.UserState.budgetRemaining,
            window.TravelEngine.CONSTANTS.INITIAL_BUDGET, 'reset: budget restored');
    },

    testImmutableInitialData: function() {
        var threw = false;
        try {
            window.TravelEngine.CONSTANTS.INITIAL_BUDGET = 999;
        } catch (e) {
            threw = true;
        }
        // In strict mode, assigning to frozen object throws; in non-strict it silently fails
        this.assert(
            window.TravelEngine.CONSTANTS.INITIAL_BUDGET === 150 || threw,
            'immutability: CONSTANTS cannot be mutated'
        );
    },

    // ---- Runner ----

    run: function() {
        console.log('Running TravelEngine Test Suite...');

        this.testFormatTime();
        this.testCreateAlternative();
        this.testHandleRain();
        this.testHandleVenueFull();
        this.testHandleOverBudget();
        this.testHandleTraffic();
        this.testHandleFlightDelay();
        this.testReset();
        this.testImmutableInitialData();

        this.report();
    },

    /** Outputs results to DOM and console */
    report: function() {
        var total = this.passed + this.failed;
        var summaryEl = document.getElementById('summary');
        var resultsEl = document.getElementById('results');

        summaryEl.textContent = this.passed + '/' + total + ' tests passed';
        summaryEl.className = this.failed === 0 ? 'pass' : 'fail';

        this.results.forEach(function(r) {
            var div = document.createElement('div');
            div.className = 'test-result ' + r.status;
            div.textContent = (r.status === 'pass' ? '✓ ' : '✗ ') + r.name;
            resultsEl.appendChild(div);
        });

        console.log('Results: ' + this.passed + ' passed, ' + this.failed + ' failed out of ' + total);
    }
};

// Auto-run tests
TestRunner.run();
