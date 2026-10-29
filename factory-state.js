import { initialSensors, SCENARIOS } from "./scenarios.js";
import { assessFactory, riskSummary, actionForIncident } from "./decision-engine.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const time = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const nextId = (prefix) => prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);

export function createFactoryState() {
  return {
    mode: "hitl", activeView: "dashboard", scenarioId: "normal",
    sensors: initialSensors(), running: false, paused: false, step: 0, manual: false,
    production: { total: 12840, accepted: 12786, defective: 54, rate: 100, downtime: 0, waiting: 0, plan: "Baseline schedule" },
    equipment: { machine: "running", conveyor: "running", vision: "running", qc: "ready", packaging: "running" },
    pending: [], incidents: [], events: [], notification: null, lastAction: null, comparisonApproved: false
  };
}

export function addEvent(state, event) {
  state.events.unshift({ id: nextId("evt"), time: time(), mode: state.mode, ...event });
}
function notify(state, message, tone) { state.notification = { message, tone: tone || "info", id: Date.now() }; }
function updateOutput(state) {
  state.production.rate = state.sensors.productionSpeed;
  if (state.running && !state.paused && state.equipment.machine === "running") state.production.total += Math.max(1, Math.round(state.production.rate / 8));
}

export function loadScenario(state, scenarioId) {
  const scenario = SCENARIOS[scenarioId];
  state.scenarioId = scenarioId; state.sensors = clone(scenario.sensors);
  state.manual = false; state.step = 0; state.pending = []; state.incidents = []; state.lastAction = null;
  state.equipment = { machine: "running", conveyor: "running", vision: "running", qc: "ready", packaging: "running" };
  state.production.rate = state.sensors.productionSpeed; state.production.waiting = scenarioId === "bottleneck" ? 28 : 0; state.production.plan = "Baseline schedule";
  addEvent(state, { type: "Scenario", severity: "info", category: "Simulation", title: scenario.label + " loaded", detail: scenario.description });
  notify(state, scenario.label + " is ready. Select Run Scenario to start the simulation.", "info");
}

export function startScenario(state) {
  state.running = true; state.paused = false;
  addEvent(state, { type: "Sensor event", severity: "info", category: "Simulation", title: "Simulation started", detail: SCENARIOS[state.scenarioId].label + " is feeding simulated sensor data." });
  notify(state, "Simulation is running with illustrative sensor data.", "info");
  evaluate(state);
}

export function simulationTick(state) {
  if (!state.running || state.paused) return;
  const scenario = SCENARIOS[state.scenarioId];
  if (scenario.ramp && state.step < scenario.ramp.temperature.length) {
    state.sensors.temperature = scenario.ramp.temperature[state.step];
    state.sensors.vibration = scenario.ramp.vibration[state.step];
    state.sensors.machineHealth = Math.max(52, 84 - state.step * 9);
    state.step += 1;
    addEvent(state, { type: "Sensor event", severity: state.sensors.temperature >= 90 ? "critical" : "warning", category: "Sensor", title: "M-01 thermal reading changed", detail: "Temperature: " + state.sensors.temperature + "°C. Vibration: " + state.sensors.vibration + " mm/s." });
  }
  updateOutput(state); evaluate(state);
}

export function evaluate(state) {
  const found = assessFactory(state.sensors);
  const prior = new Set(state.incidents.map((x) => x.code + x.evidence));
  const newItems = found.filter((x) => !prior.has(x.code + x.evidence));
  state.incidents = found;
  newItems.forEach((incident) => {
    addEvent(state, { type: "Incident detected", severity: incident.severity, category: incident.category, title: incident.condition, detail: incident.evidence, incidentId: incident.id });
    addEvent(state, { type: "Risk assessment", severity: incident.severity, category: "AI analysis", title: "Risk score " + incident.risk + "/100", detail: incident.confidence + ". " + incident.reason, incidentId: incident.id });
    const policy = actionForIncident(incident, state.mode);
    if (incident.safetyInterlock) executeAction(state, incident, "safety");
    else if (state.mode === "autonomous") executeAction(state, incident, "autonomous");
    else if (!state.pending.some((request) => request.code === incident.code)) {
      state.pending.push({ ...incident, status: "pending" });
      addEvent(state, { type: "Approval requested", severity: incident.severity, category: "HITL", title: incident.recommendation, detail: policy.message, incidentId: incident.id });
      notify(state, "Operator approval required: " + incident.recommendation, "pending");
    }
  });
  updateOutput(state);
}

function createReplanRequest(state) {
  return {
    id: nextId("PLAN"), code: "PRODUCTION-REPLAN", asset: "Production Planner", category: "Planning", severity: "warning", risk: 71,
    time: time(), condition: "Production requires a recovery plan",
    evidence: state.production.waiting + " boards are waiting after M-01 stopped.",
    recommendation: "Approve the controlled buffer and Line B recovery plan.",
    reason: "The rule keeps work traceable while limiting throughput loss.",
    expected: "Eligible work resumes at an estimated 58% rate; other boards wait for M-01.",
    action: "approve-replan", requiresApproval: true, safetyInterlock: false, confidence: "Deterministic planning rule", status: "pending"
  };
}

function replan(state, source) {
  state.production.waiting = Math.max(state.production.waiting, 36);
  if (source === "autonomous") {
    state.production.plan = "Auto plan: buffer WIP and switch qualifying work to Line B";
    state.sensors.productionSpeed = 58;
    addEvent(state, { type: "Production plan", severity: "warning", category: "Planning", title: "Autonomous production replan applied", detail: "Queued boards moved to the controlled buffer. Eligible work routes to Line B at 58% of nominal throughput." });
  } else {
    state.production.plan = "Recovery plan awaiting operator approval";
    const request = createReplanRequest(state);
    if (!state.pending.some((item) => item.code === request.code)) {
      state.pending.push(request);
      addEvent(state, { type: "Approval requested", severity: "warning", category: "Planning", title: request.recommendation, detail: request.evidence, incidentId: request.id });
    }
  }
}

export function executeAction(state, incident, source) {
  const origin = source === "safety" ? "Safety interlock" : source === "autonomous" ? "Autonomous controller" : "Operator-approved action";
  if (incident.action === "emergency-stop") {
    if (state.equipment.machine !== "stopped") {
      state.equipment.machine = "stopped"; state.equipment.conveyor = "warning"; state.sensors.productionSpeed = 0; state.production.downtime += 45;
      addEvent(state, { type: "Action executed", severity: "critical", category: "Safety", title: "Emergency interlock stopped M-01", detail: origin + ": motion command blocked because the critical limit was exceeded.", incidentId: incident.id });
      addEvent(state, { type: "Verification", severity: "healthy", category: "Safety", title: "Machine state verified: stopped", detail: "M-01 reports zero production speed. The interlock remains latched until maintenance release.", incidentId: incident.id });
      replan(state, state.mode === "autonomous" ? "autonomous" : "hitl");
    }
  } else if (incident.action === "cooling-inspection") {
    state.equipment.machine = "maintenance"; state.sensors.productionSpeed = 0; state.sensors.temperature = Math.max(70, state.sensors.temperature - 8); state.production.downtime += 20;
    addEvent(state, { type: "Action executed", severity: "warning", category: "Maintenance", title: "Cooling inspection started for M-01", detail: origin + ": machine placed in a controlled hold and cooling inspection opened.", incidentId: incident.id });
    addEvent(state, { type: "Verification", severity: "healthy", category: "Maintenance", title: "Cooling response verified", detail: "Temperature now reads " + state.sensors.temperature + "°C. Maintenance release remains simulated.", incidentId: incident.id });
  } else if (incident.action === "quarantine-batch") {
    const batch = SCENARIOS[state.scenarioId].defectiveBatch || Math.max(6, Math.round(state.sensors.defectRate * 2));
    state.equipment.vision = "warning"; state.equipment.qc = "warning"; state.production.defective += batch; state.production.accepted = Math.max(0, state.production.accepted - batch); state.sensors.defectRate = Math.min(state.sensors.defectRate, 1.8);
    addEvent(state, { type: "Action executed", severity: "warning", category: "Quality", title: batch + " boards diverted to quarantine", detail: origin + ": V-02 routed the affected batch to the rejected lane.", incidentId: incident.id });
    addEvent(state, { type: "Verification", severity: "healthy", category: "Quality", title: "Quarantine route verified", detail: "No affected board can enter packaging in this simulation.", incidentId: incident.id });
  } else if (incident.action === "balance-conveyor") {
    state.equipment.conveyor = "warning"; state.sensors.conveyorLoad = 61; state.sensors.productionSpeed = Math.min(state.sensors.productionSpeed, 76); state.production.waiting = Math.max(4, state.production.waiting - 18);
    addEvent(state, { type: "Action executed", severity: "warning", category: "Flow", title: "Conveyor speed reduced and buffer enabled", detail: origin + ": C-01 load reduced toward the controlled operating range.", incidentId: incident.id });
    addEvent(state, { type: "Verification", severity: "healthy", category: "Flow", title: "Conveyor load verified", detail: "C-01 now reports " + state.sensors.conveyorLoad + "% load at " + state.sensors.productionSpeed + "% speed.", incidentId: incident.id });
  } else if (incident.action === "approve-replan") {
    state.production.plan = "Operator-approved plan: controlled buffer and Line B recovery"; state.sensors.productionSpeed = 58; state.production.waiting = Math.max(0, state.production.waiting - 18);
    addEvent(state, { type: "Action executed", severity: "warning", category: "Planning", title: "Recovery plan approved", detail: "Eligible boards route to Line B; work requiring M-01 stays in the tracked buffer.", incidentId: incident.id });
    addEvent(state, { type: "Verification", severity: "healthy", category: "Planning", title: "Replan verified", detail: "Simulated recovery throughput is 58% of nominal with traceability preserved.", incidentId: incident.id });
  }
  state.lastAction = { ...incident, source, at: time() };
  notify(state, origin + ": " + incident.recommendation, source === "safety" ? "critical" : "success");
}

export function approveRequest(state, requestId) {
  const item = state.pending.find((request) => request.id === requestId);
  if (!item) return;
  executeAction(state, item, "operator");
  state.pending = state.pending.filter((request) => request.id !== requestId);
}
export function rejectRequest(state, requestId) {
  const item = state.pending.find((request) => request.id === requestId);
  if (!item) return;
  state.pending = state.pending.filter((request) => request.id !== requestId);
  addEvent(state, { type: "Recommendation rejected", severity: "warning", category: "HITL", title: item.recommendation, detail: "Operator rejected the routine action. The system keeps monitoring the condition.", incidentId: item.id });
  notify(state, "Routine recommendation rejected. No action was executed.", "warning");
}
export function inspectRequest(state, requestId) {
  const item = state.pending.find((request) => request.id === requestId);
  if (!item) return;
  addEvent(state, { type: "Inspection requested", severity: "info", category: "HITL", title: "Inspection repeated for " + item.asset, detail: "Evidence confirmed: " + item.evidence, incidentId: item.id });
  notify(state, "Inspection completed. The approval request remains open.", "info");
}
export function setManualSensor(state, key, value) {
  state.sensors[key] = Number(value); state.manual = true; state.running = false;
  addEvent(state, { type: "Manual sensor change", severity: "info", category: "Simulation", title: key + " adjusted", detail: "Operator set " + key + " to " + value + " in the simulation." });
  evaluate(state);
}
export function resetFactory(state) {
  const fresh = createFactoryState();
  Object.keys(state).forEach((key) => delete state[key]); Object.assign(state, fresh);
  addEvent(state, { type: "Simulation", severity: "info", category: "System", title: "Factory reset", detail: "All simulated readings, actions, approvals, and history returned to the initial state." });
  notify(state, "Factory reset complete. Ready for a new demonstration.", "success");
}
export const getRisk = (state) => riskSummary(state.incidents);