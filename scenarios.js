export const SCENARIOS = {
  normal: {
    id: "normal", label: "Normal Production", short: "Safe operation", tone: "healthy",
    description: "All stations run within the configured operating limits.",
    sensors: { temperature: 72, vibration: 2.1, conveyorLoad: 42, defectRate: 0.4, productionSpeed: 100, machineHealth: 96 }
  },
  heat: {
    id: "heat", label: "Overheating Machine", short: "M-01 thermal rise", tone: "critical",
    description: "M-01 warms in steps. At 90°C the safety interlock stops it without waiting for approval.",
    sensors: { temperature: 80, vibration: 5.2, conveyorLoad: 54, defectRate: 0.5, productionSpeed: 96, machineHealth: 82 },
    ramp: { temperature: [84, 88, 92, 96], vibration: [5.7, 6.3, 7.1, 8.4] }
  },
  defects: {
    id: "defects", label: "Defective Product Batch", short: "Vision alert", tone: "warning",
    description: "Vision Station V-02 identifies a batch with a high defect rate and recommends quarantine.",
    sensors: { temperature: 73, vibration: 2.5, conveyorLoad: 49, defectRate: 7.8, productionSpeed: 92, machineHealth: 91 },
    defectiveBatch: 18
  },
  bottleneck: {
    id: "bottleneck", label: "Conveyor Bottleneck", short: "Load imbalance", tone: "warning",
    description: "A queue builds ahead of inspection, reducing throughput and raising conveyor load.",
    sensors: { temperature: 75, vibration: 3.8, conveyorLoad: 91, defectRate: 1.2, productionSpeed: 61, machineHealth: 88 }
  },
  multiple: {
    id: "multiple", label: "Multiple Incidents", short: "Thermal + quality", tone: "critical",
    description: "A thermal event and a defective batch require coordinated safety, quality, and planning actions.",
    sensors: { temperature: 96, vibration: 8.5, conveyorLoad: 84, defectRate: 6.4, productionSpeed: 55, machineHealth: 64 },
    defectiveBatch: 15
  }
};

export const SENSOR_LIMITS = {
  temperature: { warning: 82, critical: 90, unit: "°C" },
  vibration: { warning: 6, critical: 8, unit: "mm/s" },
  conveyorLoad: { warning: 75, critical: 90, unit: "%" },
  defectRate: { warning: 2.5, critical: 6, unit: "%" }
};

export const initialSensors = () => ({ ...SCENARIOS.normal.sensors });