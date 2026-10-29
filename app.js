import { SCENARIOS, SENSOR_LIMITS } from "./core/scenarios.js";
import {
  createFactoryState, loadScenario, startScenario, simulationTick, resetFactory,
  approveRequest, rejectRequest, inspectRequest, setManualSensor, getRisk, evaluate, addEvent
} from "./core/factory-state.js";
import { actionForIncident } from "./core/decision-engine.js";

const app = document.querySelector("#app");
const state = createFactoryState();
const historyFilter = { mode: "all", category: "all", severity: "all" };
let ticker = null;

const label = (value) => String(value).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const number = (value) => new Intl.NumberFormat("en-IN").format(Math.round(value));
const severityText = (severity) => severity === "healthy" ? "Normal" : severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Info";
const statusClass = (status) => status === "stopped" ? "critical" : status === "maintenance" || status === "warning" ? "warning" : status === "ready" ? "info" : "healthy";
const findIncident = (code) => state.incidents.find((item) => item.code === code);

function icon(name) {
  const icons = { dashboard: "⌂", compare: "⇄", presentation: "▣", history: "☷", settings: "◌", factory: "▦", sensor: "⌁", safety: "✦", play: "▶", pause: "Ⅱ", reset: "↻", check: "✓", close: "×", inspect: "◎" };
  return icons[name] || "•";
}

function metric(title, value, unit, tone, foot) {
  return '<article class="metric-card ' + (tone || "") + '"><span class="metric-label">' + title + '</span><strong>' + value + '</strong><span class="metric-unit">' + (unit || "") + '</span><small>' + (foot || "") + '</small></article>';
}

function statusPill(text, tone) { return '<span class="status-pill ' + (tone || "info") + '"><i></i>' + text + "</span>"; }

function navItem(view, labelText, glyph) {
  return '<button class="nav-item ' + (state.activeView === view ? "active" : "") + '" data-view="' + view + '"><span>' + icon(glyph) + '</span>' + labelText + "</button>";
}

function scenarioCards() {
  return '<section class="panel scenarios"><div class="panel-heading"><div><span class="eyebrow">Scenario simulator</span><h2>Choose a factory condition</h2></div><span class="simulated">SIMULATED DATA</span></div><div class="scenario-grid">' +
    Object.values(SCENARIOS).map((scenario) => '<button class="scenario-card ' + (state.scenarioId === scenario.id ? "selected " : "") + scenario.tone + '" data-scenario="' + scenario.id + '"><span class="scenario-index">' + (Object.keys(SCENARIOS).indexOf(scenario.id) + 1).toString().padStart(2, "0") + '</span><strong>' + scenario.label + '</strong><small>' + scenario.short + "</small></button>").join("") +
    '</div><div class="scenario-actions"><button class="button primary" data-action="run">' + icon("play") + ' Run Scenario</button><button class="button" data-action="pause">' + (state.paused ? icon("play") + " Resume" : icon("pause") + " Pause") + '</button><button class="button" data-action="reset">' + icon("reset") + ' Reset Factory</button><p>' + SCENARIOS[state.scenarioId].description + "</p></div></section>";
}

function factoryFloor() {
  const stations = [
    ["Input", "raw", "running"], ["C-01 Conveyor", "conveyor", state.equipment.conveyor], ["M-01 Assembly", "machine", state.equipment.machine],
    ["V-02 Vision", "vision", state.equipment.vision], ["QC Gate", "qc", state.equipment.qc], ["Accepted", "accepted", "running"],
    ["Rejected", "rejected", state.equipment.vision === "warning" ? "warning" : "ready"], ["Packaging", "packing", state.equipment.packaging]
  ];
  return '<section class="panel factory-floor"><div class="panel-heading"><div><span class="eyebrow">Factory floor</span><h2>PCB production line</h2></div><div class="legend"><span><i class="dot healthy"></i>Running</span><span><i class="dot warning"></i>Attention</span><span><i class="dot critical"></i>Stopped</span></div></div><div class="line-map"><div class="flow-line"></div>' +
    stations.map((station, index) => '<div class="station s' + index + " " + statusClass(station[2]) + '"><span class="station-icon">' + (station[1] === "machine" ? "⚙" : station[1] === "vision" ? "◉" : station[1] === "rejected" ? "↯" : station[1] === "accepted" ? "✓" : station[1] === "packing" ? "□" : "▤") + '</span><strong>' + station[0] + '</strong><small>' + (station[2] === "stopped" ? "Safety stop" : station[2] === "maintenance" ? "Maintenance" : station[2] === "warning" ? "Monitoring" : station[2] === "ready" ? "Standby" : "Running") + "</small></div>").join("") +
    '<div class="pcb pcb-a"></div><div class="pcb pcb-b"></div><div class="pcb pcb-c"></div></div><div class="floor-note"><span>' + statusPill(state.equipment.machine === "stopped" ? "M-01 SAFE STOP" : state.equipment.machine === "maintenance" ? "M-01 INSPECTION" : "LINE RUNNING", statusClass(state.equipment.machine)) + '</span><p>Product flow is a local visual simulation. Current plan: <b>' + state.production.plan + "</b></p></div></section>";
}

function sensorRow(key, name, unit, min, max) {
  const value = state.sensors[key];
  const limits = SENSOR_LIMITS[key];
  let tone = "healthy";
  if (limits && value >= limits.critical) tone = "critical";
  else if (limits && value >= limits.warning) tone = "warning";
  return '<div class="sensor-row"><div><span>' + name + '</span><strong>' + value + unit + '</strong></div><div class="sensor-track"><span class="' + tone + '" style="width:' + Math.min(100, ((value - min) / (max - min)) * 100) + '%"></span></div><input aria-label="' + name + '" data-sensor="' + key + '" type="range" min="' + min + '" max="' + max + '" step="' + (key === "vibration" || key === "defectRate" ? ".1" : "1") + '" value="' + value + '" /><small>' + (limits ? "Warn " + limits.warning + unit + " / Critical " + limits.critical + unit : "Illustrative sensor") + "</small></div>";
}

function sensorPanel() {
  return '<section class="panel sensor-panel"><div class="panel-heading"><div><span class="eyebrow">Sensor monitoring</span><h2>Live readings</h2></div><span class="simulated">LOCAL SIMULATION</span></div><p class="panel-copy">Move a slider to test the deterministic safety rules. Manual adjustments pause the running scenario.</p>' +
    sensorRow("temperature", "Machine temperature", "°C", 45, 110) + sensorRow("vibration", "Vibration level", " mm/s", 0, 10) +
    sensorRow("conveyorLoad", "Conveyor load", "%", 0, 100) + sensorRow("defectRate", "Defect rate", "%", 0, 12) +
    '<div class="sensor-mini"><span><b>' + state.sensors.productionSpeed + '%</b> production speed</span><span><b>' + state.sensors.machineHealth + '%</b> machine health</span></div></section>';
}

function stage(title, value, tone) { return '<div class="stage ' + (tone || "") + '"><small>' + title + '</small><strong>' + value + "</strong></div>"; }

function decisionEngine() {
  const incidents = state.incidents;
  const risk = getRisk(state);
  const active = incidents[0];
  const policy = active ? actionForIncident(active, state.mode) : null;
  return '<section class="panel decision-panel"><div class="panel-heading"><div><span class="eyebrow">AI decision engine</span><h2>Rule-based decision trace</h2></div>' + statusPill(risk.label + " risk", risk.severity) + '</div><p class="rule-disclosure">Educational simulation using deterministic thresholds, not a trained ML model. Scores show illustrative distance from a safety limit.</p>' +
    (active ? '<div class="trace">' + stage("1. Sensor data", active.evidence, active.severity) + stage("2. AI analysis", active.condition, active.severity) + stage("3. Risk assessment", active.risk + "/100 · " + severityText(active.severity), active.severity) + stage("4. Decision", active.recommendation, active.severity) + stage("5. Policy", policy.approval, policy.execution === "pending" ? "warning" : "healthy") + "</div>" +
    '<div class="reasoning"><span class="reason-label">WHY THIS ACTION</span><p>' + active.reason + '</p><div><span>Expected outcome</span><b>' + active.expected + "</b></div><div><span>Execution</span><b>" + policy.message + "</b></div></div>" :
    '<div class="empty-state"><span>✓</span><h3>No active incidents</h3><p>Sensor values are within normal operating limits. The AI remains in monitoring mode.</p></div>') +
    "</section>";
}

function approvalPanel() {
  if (state.mode === "autonomous") {
    const action = state.lastAction;
    return '<section class="panel control-panel"><div class="panel-heading"><div><span class="eyebrow">Autonomous control centre</span><h2>Permitted actions</h2></div>' + statusPill("Routine autonomy enabled", "healthy") + '</div><p class="panel-copy">Actions run only inside approved limits. Critical safety rules always take priority.</p>' +
      (action ? '<div class="action-summary"><span class="big-check">✓</span><div><small>Latest execution · ' + action.at + '</small><h3>' + action.recommendation + '</h3><p>' + (action.source === "safety" ? "Safety controller applied the emergency interlock." : "Controller applied a permitted deterministic rule.") + "</p></div></div>" : '<div class="empty-state compact"><span>◎</span><h3>Standing by</h3><p>Run a scenario to show autonomous analysis, action, and verification.</p></div>') +
      '<div class="policy-list"><div><b>Authorized routine actions</b><span>Quarantine, balance conveyor, cooling inspection</span></div><div><b>Escalation boundary</b><span>Unknown conditions request human intervention</span></div><div><b>Safety boundary</b><span>Thermal critical limit stops M-01 immediately</span></div></div></section>';
  }
  const requests = state.pending;
  return '<section class="panel control-panel"><div class="panel-heading"><div><span class="eyebrow">Human approval centre</span><h2>Operator decisions</h2></div>' + statusPill(requests.length + " pending", requests.length ? "warning" : "healthy") + '</div><p class="panel-copy">Routine actions wait for an operator. The emergency safety interlock never waits for approval.</p>' +
    (requests.length ? requests.map((request) => '<article class="approval-request"><div class="request-top"><span class="request-id">' + request.code + '</span>' + statusPill(severityText(request.severity), request.severity) + '</div><h3>' + request.recommendation + '</h3><p><b>Evidence:</b> ' + request.evidence + '</p><p><b>Expected:</b> ' + request.expected + '</p><div class="request-actions"><button class="button success" data-request="approve" data-id="' + request.id + '">✓ Approve</button><button class="button danger" data-request="reject" data-id="' + request.id + '">× Reject</button><button class="button" data-request="inspect" data-id="' + request.id + '">◎ Inspect again</button></div></article>').join("") :
      '<div class="empty-state compact"><span>✓</span><h3>No routine approvals pending</h3><p>Choose a warning scenario to demonstrate operator authority.</p></div>') +
    '<div class="interlock-callout"><span>✦</span><p><b>Safety interlock:</b> At 90°C or 8 mm/s vibration, M-01 stops immediately. An operator cannot reject or override this protective action.</p></div></section>';
}

function overview() {
  const risk = getRisk(state);
  const operational = state.equipment.machine === "stopped" ? "Safety stopped" : state.equipment.machine === "maintenance" ? "Maintenance" : "Operational";
  const operationalTone = statusClass(state.equipment.machine);
  return '<section class="overview"><div class="overview-heading"><div><span class="eyebrow">Factory overview</span><h1>AI Factory Manager</h1><p>Human-in-the-Loop and fully autonomous manufacturing decisions, safely simulated.</p></div><div class="overview-status">' + statusPill(operational, operationalTone) + '<span>Mode: <b>' + (state.mode === "hitl" ? "Human-in-the-Loop" : "Fully Autonomous") + '</b></span></div></div><div class="metric-grid">' +
    metric("Production rate", state.sensors.productionSpeed + "%", "of nominal", state.sensors.productionSpeed < 70 ? "warning" : "", "simulated") +
    metric("Units produced", number(state.production.total), "boards", "", number(state.production.accepted) + " accepted") +
    metric("Defective units", number(state.production.defective), "boards", state.production.defective > 54 ? "warning" : "", "quarantined when needed") +
    metric("M-01 temperature", state.sensors.temperature + "°C", state.sensors.temperature >= 90 ? "critical limit" : "safe limit 82°C", state.sensors.temperature >= 90 ? "critical" : state.sensors.temperature >= 82 ? "warning" : "", "thermal sensor") +
    metric("Conveyor load", state.sensors.conveyorLoad + "%", state.sensors.conveyorLoad >= 75 ? "attention" : "normal", state.sensors.conveyorLoad >= 75 ? "warning" : "", "C-01") +
    metric("Overall risk", risk.label, risk.score + "/100", risk.severity, "deterministic assessment") +
    metric("Estimated downtime", state.production.downtime, "minutes", state.production.downtime ? "warning" : "", "simulated estimate") +
    metric("Waiting boards", state.production.waiting, "in buffer", state.production.waiting ? "warning" : "", "traceable WIP") +
    "</div></section>";
}

function dashboardView() {
  return overview() + scenarioCards() + '<div class="content-grid"><div class="main-stack">' + factoryFloor() + decisionEngine() + '</div><aside class="side-stack">' + sensorPanel() + approvalPanel() + "</aside></div>" + eventPanel(6, false);
}

function eventPanel(limit, full) {
  const entries = state.events.slice(0, limit);
  return '<section class="panel event-panel"><div class="panel-heading"><div><span class="eyebrow">Audit trail</span><h2>' + (full ? "Complete event history" : "Recent state transitions") + '</h2></div>' + (full ? "" : '<button class="text-button" data-view="history">Open history →</button>') + '</div>' +
    (entries.length ? '<div class="event-list">' + entries.map((event) => '<article class="event-item"><time>' + event.time + '</time><span class="event-marker ' + event.severity + '"></span><div><small>' + event.category + " · " + (event.mode === "hitl" ? "HITL" : "Autonomous") + '</small><h3>' + event.title + '</h3><p>' + event.detail + "</p></div></article>").join("") + "</div>" : '<div class="empty-state compact"><span>◷</span><h3>History will appear here</h3><p>Run a scenario to record each sensor event, decision, action, and verification.</p></div>') + "</section>";
}

function comparisonView() {
  const scenario = SCENARIOS.heat;
  const hitlStatus = state.comparisonApproved ? "Recovery plan approved" : "Routine recovery plan pending";
  return '<section class="page-title"><span class="eyebrow">Live policy comparison</span><h1>Same evidence. Different authority.</h1><p>Both policies receive the identical overheating condition: M-01 at 96°C. The safety result matches; the routine recovery decision differs.</p></section>' +
    '<section class="comparison-hero"><div><span class="incident-chip critical">THERMAL-CRITICAL</span><h2>Overheating scenario at 96°C</h2><p>' + scenario.description + '</p></div><div class="safety-lock"><span>✦</span><div><b>Non-bypassable safety rule</b><small>Temperature ≥ 90°C → stop M-01</small></div></div></section>' +
    '<section class="comparison-table"><div class="compare-head stage-col">Stage</div><div class="compare-head hitl-col">Human-in-the-Loop</div><div class="compare-head auto-col">Fully Autonomous</div>' +
    compareRow("Detection", "AI detects overheating.", "AI detects overheating.") +
    compareRow("Analysis", "Risk 98/100. Continuing may damage equipment.", "Risk 98/100. Continuing may damage equipment.") +
    compareRow("Safety response", "Interlock stops M-01 immediately.", "Safety controller stops M-01 immediately.") +
    compareRow("Routine decision", "AI requests approval for the recovery plan.", "AI applies the permitted recovery rule.") +
    compareRow("Final state", state.comparisonApproved ? "Machine stopped; controlled recovery begins." : "Machine stopped; routine plan waits for the operator.", "Machine stopped; Line B recovery plan enabled.") +
    '</section><div class="comparison-footer"><div><h3>What changes?</h3><p><b>Control:</b> HITL reserves specified routine decisions for the operator. <b>Response time:</b> autonomy can act faster within approved limits. <b>Accountability:</b> HITL makes the approval explicit; autonomous operation needs clear policies and auditability.</p></div><button class="button primary" data-action="compare-approve">' + (state.comparisonApproved ? "✓ HITL plan approved" : "Approve HITL recovery plan") + '</button></div><section class="lessons"><article><span>01</span><h3>Safety comes first</h3><p>Both modes obey the same hard safety interlock.</p></article><article><span>02</span><h3>Authority differs</h3><p>HITL holds routine actions for review; autonomy uses a permitted operating envelope.</p></article><article><span>03</span><h3>Choose by context</h3><p>The right design depends on risk, task complexity, response time, and error consequences.</p></article></section>';
}
function compareRow(stageName, hitl, auto) { return '<div class="stage-col"><b>' + stageName + '</b></div><div class="hitl-col">' + hitl + '</div><div class="auto-col">' + auto + "</div>"; }

function presentationView() {
  const steps = [
    ["1", "Factory overview", "Circuit boards move from input through assembly, inspection, quality control, and packaging."],
    ["2", "Incident scenario", "Choose an overheating, quality, conveyor, or combined incident using the simulator."],
    ["3", "AI reasoning", "The rule engine compares sensor evidence with defined safe limits and explains its recommendation."],
    ["4", "HITL approval", "Routine actions wait in the operator queue. Approve, reject, or inspect again."],
    ["5", "Autonomous response", "Permitted routine rules execute immediately and leave a complete audit record."],
    ["6", "Comparison and lessons", "Both modes protect the factory; they differ in authority, timing, and oversight."]
  ];
  return '<section class="page-title presentation-title"><span class="eyebrow">Presentation mode</span><h1>Explain the system in six visible steps</h1><p>Designed for a classroom demonstration. Each section uses plain language and the live simulation remains available.</p></section><div class="presentation-layout"><section class="panel presenter-panel"><div class="panel-heading"><div><span class="eyebrow">Core message</span><h2>AI can assist, decide, and act within defined boundaries</h2></div></div><blockquote>“In Human-in-the-Loop systems, AI recommends actions while a human keeps approval authority for specified decisions. In fully autonomous systems, AI executes permitted actions without routine approval, under safety constraints and oversight.”</blockquote><div class="presentation-controls"><button class="button primary" data-view="dashboard">Open live dashboard</button><button class="button" data-view="compare">Open comparison</button></div></section><section class="presentation-steps">' +
    steps.map((item) => '<article><span>' + item[0] + '</span><div><h2>' + item[1] + '</h2><p>' + item[2] + '</p></div></article>').join("") + "</section></div>";
}

function historyView() {
  const categories = ["all", ...new Set(state.events.map((event) => event.category))];
  const filtered = state.events.filter((event) => (historyFilter.mode === "all" || event.mode === historyFilter.mode) && (historyFilter.category === "all" || event.category === historyFilter.category) && (historyFilter.severity === "all" || event.severity === historyFilter.severity));
  return '<section class="page-title"><span class="eyebrow">Audit trail and history</span><h1>Every state transition, in order</h1><p>This record reflects actual simulation actions. Clear it only when you are ready to begin a fresh demonstration.</p></section><section class="history-tools"><label>Operating mode<select data-filter="mode"><option value="all">All modes</option><option value="hitl">Human-in-the-Loop</option><option value="autonomous">Fully Autonomous</option></select></label><label>Category<select data-filter="category">' + categories.map((category) => '<option value="' + category + '">' + (category === "all" ? "All categories" : category) + "</option>").join("") + '</select></label><label>Severity<select data-filter="severity"><option value="all">All severities</option><option value="info">Info</option><option value="healthy">Normal</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label><button class="button danger" data-action="clear-history">Clear history</button></section><section class="panel">' + (filtered.length ? '<div class="event-list full">' + filtered.map((event) => '<article class="event-item"><time>' + event.time + '</time><span class="event-marker ' + event.severity + '"></span><div><small>' + event.category + " · " + (event.mode === "hitl" ? "HITL" : "Autonomous") + '</small><h3>' + event.title + '</h3><p>' + event.detail + "</p></div></article>").join("") + "</div>" : '<div class="empty-state"><span>⌕</span><h3>No matching events</h3><p>Change the filters or run a scenario to create evidence.</p></div>') + "</section>";
}

function viewContent() {
  if (state.activeView === "compare") return comparisonView();
  if (state.activeView === "presentation") return presentationView();
  if (state.activeView === "history") return historyView();
  return dashboardView();
}

function render() {
  const notification = state.notification ? '<div class="toast ' + state.notification.tone + '"><span>' + (state.notification.tone === "critical" ? "✦" : state.notification.tone === "success" ? "✓" : "i") + '</span>' + state.notification.message + '</div>' : "";
  app.innerHTML = '<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">AI</span><div><b>FactoryOS</b><small>Smart Manufacturing</small></div></div><nav>' +
    navItem("dashboard", "Operations", "dashboard") + navItem("compare", "Compare Modes", "compare") + navItem("presentation", "Presentation", "presentation") + navItem("history", "Audit History", "history") +
    '</nav><div class="sidebar-footer"><div class="mode-card"><small>OPERATING MODE</small><b>' + (state.mode === "hitl" ? "Human-in-the-Loop" : "Fully Autonomous") + '</b><button data-action="switch-mode">Switch mode</button></div><div class="sim-badge"><i></i> Local simulation</div></div></aside><main><header class="topbar"><div><span class="crumb">Smart Manufacturing / ' + (state.activeView === "dashboard" ? "Operations" : state.activeView) + '</span><span class="clock">' + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + '</span></div><div class="top-actions">' + statusPill(state.running && !state.paused ? "Simulation active" : state.paused ? "Simulation paused" : "Ready", state.running && !state.paused ? "healthy" : state.paused ? "warning" : "info") + '<button class="mode-toggle" data-action="switch-mode"><span class="' + (state.mode === "hitl" ? "on" : "") + '">HITL</span><span class="' + (state.mode === "autonomous" ? "on" : "") + '">AUTO</span></button></div></header><div class="content">' + viewContent() + '</div></main></div>' + notification;
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { state.activeView = button.dataset.view; render(); }));
  document.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => { loadScenario(state, button.dataset.scenario); render(); }));
  document.querySelectorAll("[data-sensor]").forEach((input) => input.addEventListener("input", () => { setManualSensor(state, input.dataset.sensor, input.value); render(); }));
  document.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.request === "approve") approveRequest(state, button.dataset.id);
    if (button.dataset.request === "reject") rejectRequest(state, button.dataset.id);
    if (button.dataset.request === "inspect") inspectRequest(state, button.dataset.id);
    render();
  }));
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.value = historyFilter[input.dataset.filter];
    input.addEventListener("change", () => { historyFilter[input.dataset.filter] = input.value; render(); });
  });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "run") { startScenario(state); startTicker(); }
    if (action === "pause") { state.paused = !state.paused; state.notification = { message: state.paused ? "Simulation paused. Sensor readings are held." : "Simulation resumed.", tone: "info", id: Date.now() }; }
    if (action === "reset") { stopTicker(); resetFactory(state); }
    if (action === "switch-mode") { state.mode = state.mode === "hitl" ? "autonomous" : "hitl"; state.pending = []; addEvent(state, { type: "Mode changed", severity: "info", category: "System", title: "Operating mode changed to " + (state.mode === "hitl" ? "Human-in-the-Loop" : "Fully Autonomous"), detail: "The same sensor data continues; only the approval policy changes." }); evaluate(state); state.notification = { message: "Mode is now " + (state.mode === "hitl" ? "Human-in-the-Loop." : "Fully Autonomous."), tone: "success", id: Date.now() }; }
    if (action === "compare-approve") { state.comparisonApproved = true; state.notification = { message: "Comparison HITL recovery plan approved.", tone: "success", id: Date.now() }; }
    if (action === "clear-history") { if (window.confirm("Clear all simulation history? This cannot be undone.")) { state.events = []; state.notification = { message: "Simulation history cleared.", tone: "success", id: Date.now() }; } }
    render();
  }));
}

function startTicker() {
  if (ticker) return;
  ticker = window.setInterval(() => { simulationTick(state); render(); if (state.equipment.machine === "stopped" || state.step >= 4 && SCENARIOS[state.scenarioId].ramp) { state.running = false; window.clearInterval(ticker); ticker = null; render(); } }, 1200);
}
function stopTicker() { if (ticker) window.clearInterval(ticker); ticker = null; }

loadScenario(state, "normal");
render();