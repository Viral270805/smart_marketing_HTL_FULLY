import test from "node:test";
import assert from "node:assert/strict";
import { assessFactory, actionForIncident } from "../src/core/decision-engine.js";
import { createFactoryState, loadScenario, startScenario, simulationTick, approveRequest } from "../src/core/factory-state.js";
import { SCENARIOS } from "../src/core/scenarios.js";

test("normal conditions create no incidents", () => {
  assert.equal(assessFactory(SCENARIOS.normal.sensors).length, 0);
});

test("critical temperature raises a non-bypassable safety incident", () => {
  const incidents = assessFactory({ ...SCENARIOS.heat.sensors, temperature: 96, vibration: 7.1 });
  const critical = incidents.find((incident) => incident.code === "THERMAL-CRITICAL");
  assert.ok(critical);
  assert.equal(critical.safetyInterlock, true);
  assert.equal(critical.requiresApproval, false);
  assert.equal(actionForIncident(critical, "hitl").execution, "automatic");
});

test("quality and conveyor conditions create independent actions", () => {
  const incidents = assessFactory(SCENARIOS.multiple.sensors);
  assert.ok(incidents.some((incident) => incident.action === "quarantine-batch"));
  assert.ok(incidents.some((incident) => incident.action === "balance-conveyor"));
});

test("HITL keeps a routine warning action pending until the operator approves it", () => {
  const state = createFactoryState();
  loadScenario(state, "heat");
  startScenario(state);
  simulationTick(state);
  assert.ok(state.pending.some((request) => request.code === "THERMAL-WARNING"));
  const request = state.pending.find((item) => item.code === "THERMAL-WARNING");
  approveRequest(state, request.id);
  assert.equal(state.equipment.machine, "maintenance");
  assert.equal(state.pending.some((item) => item.id === request.id), false);
});

test("autonomous mode applies a permitted quality action without a pending request", () => {
  const state = createFactoryState();
  state.mode = "autonomous";
  loadScenario(state, "defects");
  startScenario(state);
  assert.equal(state.pending.length, 0);
  assert.ok(state.events.some((event) => event.title.includes("diverted to quarantine")));
});

test("critical thermal state stops the machine before recovery plan approval", () => {
  const state = createFactoryState();
  loadScenario(state, "multiple");
  startScenario(state);
  assert.equal(state.equipment.machine, "stopped");
  assert.equal(state.sensors.productionSpeed, 0);
  assert.ok(state.pending.some((item) => item.code === "PRODUCTION-REPLAN"));
});