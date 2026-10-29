# Smart Manufacturing — AI Factory Manager

A local, interactive classroom simulation that compares Human-in-the-Loop (HITL) and Fully Autonomous AI decision policies in a printed-circuit-board factory.

## What is included

- Interactive factory control-room dashboard with a dark industrial UI.
- Five ready-to-run scenarios: normal production, overheating machine, defective batch, conveyor bottleneck, and multiple incidents.
- Simulated sensor controls for temperature, vibration, conveyor load, defect rate, production speed, and machine health.
- A deterministic decision engine with understandable evidence, risk, recommendation, policy, execution, and verification stages.
- HITL approval centre with Approve, Reject, and Inspect Again actions.
- Autonomous control centre with immediate execution inside a permitted operating envelope.
- A non-bypassable thermal/vibration safety interlock.
- Production replanning after an emergency stop.
- Complete, filterable audit history.
- Comparison and Presentation modes for the live classroom demo.
- Unit tests for decision rules, safety behaviour, HITL, and autonomous behaviour.

## Technology choice

The project uses dependency-free browser JavaScript, CSS, and ES modules. This makes the classroom demo reliable offline: no account, key, network fetch, package installation, or server-side database is required. The code is split into the same logical modules a React version would use, so components can be migrated later without changing the safety rules.

## Run the project

1. Install Node.js 18 or later.
2. Open a terminal in this folder.
3. Run: npm start
4. Open http://localhost:4173 in a browser.

To run the decision-engine tests, run: npm test

## Suggested four-minute demo

1. Start on Operations with Normal Production selected. Click Run Scenario.
2. Select Overheating Machine in HITL mode and click Run Scenario. At the warning stage, show the pending cooling-inspection approval.
3. Click Approve. Point out the verified state change.
4. Reset. Run the same scenario without approving. At 90°C, explain that the interlock stops M-01 even though HITL normally controls routine actions.
5. Switch to Fully Autonomous. Select Defective Product Batch or Conveyor Bottleneck, then run it. Show the automatic action and audit trail.
6. Open Compare Modes and use the approval button to explain the distinction between emergency protection and a routine recovery decision.

See docs/LIVE_DEMO_GUIDE.md for full instructions.

## Safety rules

| Condition | Deterministic rule | Human can override? |
|---|---|---|
| Temperature ≥ 90°C | Stop M-01 immediately, create maintenance task, initiate recovery planning | No |
| Vibration ≥ 8 mm/s | Stop M-01 immediately | No |
| Temperature ≥ 82°C or vibration ≥ 6 mm/s | Recommend or execute controlled cooling inspection | Yes, in HITL |
| Defect rate ≥ 2.5% | Quarantine affected boards | Yes, in HITL |
| Conveyor load ≥ 75% | Reduce speed and enable controlled buffer | Yes, in HITL |

The displayed risk scores are illustrative values calculated from distance above a configured threshold. This project does not claim to run a trained machine-learning model.

## Project structure

    src/
      core/
        scenarios.js          Scenario and threshold definitions
        decision-engine.js    Deterministic assessment and policy selection
        factory-state.js      State transitions, safety interlock, actions, event log
      app.js                  User interface and interaction bindings
      styles.css              Responsive industrial control-room styling
    tests/
      decision-engine.test.mjs
    docs/
      ARCHITECTURE.md
      DECISION_ENGINE.md
      TEST_CHECKLIST.md
      LIVE_DEMO_GUIDE.md
      SPEAKING_SCRIPT.md
      VIVA_QA.md
      INDUSTRY_CONTEXT.md

## Important presentation note

This is an educational simulation. Values, production estimates, sensor readings, and maintenance outcomes are simulated and should not be used to control real industrial equipment.