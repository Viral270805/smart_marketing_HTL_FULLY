import { SENSOR_LIMITS } from "./scenarios.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const score = (value, warning, critical) => clamp(Math.round(((value - warning) / (critical - warning)) * 55 + 45), 0, 100);
const id = (code, index) => code + "-" + Date.now() + "-" + index;

export function assessFactory(sensors) {
  const incidents = [];
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const add = (item) => incidents.push({ id: id(item.code, incidents.length), time, ...item });

  if (sensors.temperature >= 90 || sensors.vibration >= 8) {
    const evidence = sensors.temperature >= 90
      ? "M-01 temperature is " + sensors.temperature + "°C, above the 90°C critical limit."
      : "M-01 vibration is " + sensors.vibration + " mm/s, above the 8 mm/s critical limit.";
    add({
      code: "THERMAL-CRITICAL", asset: "M-01 Assembly", category: "Safety", severity: "critical", risk: 98,
      condition: "Critical machine condition", evidence,
      recommendation: "Emergency stop M-01; create a maintenance task; replan production.",
      reason: "Continuing could damage equipment and create an unsafe operating condition.",
      expected: "Machine stops immediately. Work-in-progress waits for the recovery plan.",
      action: "emergency-stop", requiresApproval: false, safetyInterlock: true, confidence: "Rule certainty: 100%"
    });
  } else if (sensors.temperature >= 82 || sensors.vibration >= 6) {
    const evidence = sensors.temperature >= 82
      ? "M-01 temperature is " + sensors.temperature + "°C, above the 82°C warning limit."
      : "M-01 vibration is " + sensors.vibration + " mm/s, above the 6 mm/s warning limit.";
    add({
      code: "THERMAL-WARNING", asset: "M-01 Assembly", category: "Maintenance", severity: "warning",
      risk: score(Math.max(sensors.temperature, sensors.vibration * 13), 82, 90),
      condition: "Machine temperature / vibration warning", evidence,
      recommendation: "Pause M-01 and begin a cooling inspection.",
      reason: "Early intervention can prevent equipment damage and unplanned downtime.",
      expected: "Production pauses while the operator verifies the machine condition.",
      action: "cooling-inspection", requiresApproval: true, safetyInterlock: false,
      confidence: "Illustrative rule score based on threshold distance"
    });
  }

  if (sensors.defectRate >= 2.5) {
    const critical = sensors.defectRate >= 6;
    add({
      code: "VISION-QUALITY", asset: "V-02 Vision Inspection", category: "Quality",
      severity: critical ? "critical" : "warning", risk: score(sensors.defectRate, 2.5, 6),
      condition: "Defective board batch detected",
      evidence: "Vision inspection reports a " + sensors.defectRate + "% defect rate; the warning limit is 2.5%.",
      recommendation: "Divert affected boards to quarantine and inspect the upstream process.",
      reason: "Quarantine prevents faulty boards from reaching packaging.",
      expected: "Affected boards go to the rejected lane; production continues with quality monitoring.",
      action: "quarantine-batch", requiresApproval: true, safetyInterlock: false,
      confidence: "Illustrative rule score based on defect-rate threshold"
    });
  }

  if (sensors.conveyorLoad >= 75) {
    const critical = sensors.conveyorLoad >= 90;
    add({
      code: "CONVEYOR-LOAD", asset: "C-01 Conveyor", category: "Flow",
      severity: critical ? "critical" : "warning", risk: score(sensors.conveyorLoad, 75, 90),
      condition: "Conveyor bottleneck detected",
      evidence: "C-01 load is " + sensors.conveyorLoad + "%; the warning limit is 75% and production speed has fallen to " + sensors.productionSpeed + "%.",
      recommendation: "Reduce conveyor speed and route queued boards through a controlled buffer.",
      reason: "This prevents a jam and stabilizes inspection throughput.",
      expected: "Load falls toward 60% and production runs at a safe, reduced rate.",
      action: "balance-conveyor", requiresApproval: true, safetyInterlock: false,
      confidence: "Illustrative rule score based on conveyor-load threshold"
    });
  }
  return incidents;
}

export function riskSummary(incidents) {
  if (!incidents.length) return { label: "Low", severity: "healthy", score: 8, explanation: "All monitored values are within safe limits." };
  const highest = incidents.reduce((a, b) => a.risk > b.risk ? a : b);
  return { label: highest.severity === "critical" ? "Critical" : "Elevated", severity: highest.severity, score: highest.risk, explanation: highest.reason };
}

export function actionForIncident(incident, mode) {
  if (incident.safetyInterlock) return { execution: "automatic", approval: "Safety interlock", message: "The safety controller acted immediately. Human approval cannot override it." };
  if (mode === "autonomous") return { execution: "automatic", approval: "Within autonomous operating envelope", message: "The controller executed this permitted rule without routine approval." };
  return { execution: "pending", approval: "Operator approval required", message: "The AI recommends action; the operator retains authority for this routine decision." };
}