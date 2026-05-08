# Dynamic Travel Experience Engine PoC

## Chosen Vertical
**Travel Planning & Experience**

The travel sector is highly dynamic, where plans are frequently disrupted by unpredictable real-world events (weather, traffic, transit delays, capacity issues). This Proof of Concept (PoC) focuses on the "in-destination" experience. It moves beyond static, pre-planned booking engines to create a dynamic, real-time itinerary manager that acts as an autonomous digital concierge, adapting to constraints on the fly.

---

## Approach and Logic
The system is built on an **Event-Driven Constraint Satisfaction** logic model.

1. **Event Ingestion**: The system acts as a listener for environmental or user-driven changes (e.g., weather updates, transit delays, budget changes).
2. **Impact Assessment**: When an event occurs, the engine evaluates the current active itinerary to check if it violates any established constraints. For example, sudden rain violates the constraint of an "outdoor" activity; overspending early in the day violates the overall "budget" constraint.
3. **Resolution & Rerouting**: If a constraint is violated, the system queries its venue/activity data store to find the best-fit alternative. This alternative must satisfy both the new environmental constraints and the user's baseline preferences (e.g., finding an *indoor* activity that fits a *foodie* profile).
4. **Cascading Updates**: For time-based disruptions (like traffic), the system recursively calculates the downstream schedule. If a hard constraint (like a flight departure) is threatened, the logic dictates that it autonomously drops non-essential activities to ensure the critical path is maintained.

---

## How the Solution Works
The solution is a lightweight, highly efficient simulator built with HTML, CSS, and Vanilla JavaScript. 

* **State Management**: JavaScript variables (`UserState` and `currentItinerary`) act as the mock in-memory database.
* **Re-routing Engine**: A central JavaScript controller (`ReRoutEngine`) houses the logic. It contains specific handlers (`handleRain`, `handleTraffic`, `handleOverBudget`) that are triggered via the Simulator Console.
* **Efficient Processing**: Time is tracked and calculated using a "minutes from midnight" integer system. This allows the engine to perform O(n) recalculations of the entire itinerary array instantly, without the overhead of heavy `Date` object parsing.
* **Secure Rendering**: The UI is updated dynamically using native DOM APIs (`document.createElement` and `textContent`). This ensures the application is completely secure against Cross-Site Scripting (XSS) vulnerabilities, avoiding the use of dangerous `.innerHTML` injections.
* **No Third-Party APIs**: To maintain the pure logic demonstration, all external triggers (weather, flights) are simulated internally.

---

## Assumptions Made
To scope the Proof of Concept effectively, the following assumptions were made:

1. **Data Availability**: It is assumed that in a production environment, the system has access to a highly structured "Venue Data Store" containing rich metadata for every activity (cost, indoor/outdoor flags, duration, real-time capacity).
2. **Mocked Events**: Real-world sensors or third-party webhooks (e.g., OpenWeatherMap, FlightAware) are replaced by manual "Simulator" button clicks.
3. **Static Transit Buffers**: Travel times between venues are currently calculated using static time buffers (e.g., 30 minutes) rather than real-time geospatial routing APIs (like Google Distance Matrix).
4. **Static User Persona**: The user's preferences (Starting Budget of $150, Relaxed Pace, Foodie Interest) are pre-set for this demo to bypass a user-onboarding flow and focus directly on the rerouting logic.
