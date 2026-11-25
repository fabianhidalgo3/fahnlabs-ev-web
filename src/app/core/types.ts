// Contract types with the BFF (/api/v1 and /ws/live).

export interface Config {
  siteLimitKw: number;
  buildingLoadKw: number;
  buildingLoadMode: 'fixed' | 'simulated';
  strategy: 'equal' | 'priority' | 'fifo' | 'need';
  minPowerKw: number;
  safetyMarginKw: number;
  chargingRateUnit: 'W' | 'A';
  voltage: number;
  phases: number;
  acceptUnknownChargers?: boolean;
  energy?: Partial<Tariffs>;
}

export interface VehicleRef {
  id: number;
  name: string;
  vin?: string | null;
  evccid?: string | null;
  maxAcKw: number;
  targetSoc: number;
  priority: number;
  batteryKwh: number;
}

export interface Connector {
  connectorId: number;
  status: string;
  errorCode: string;
  transactionId: number | null;
  idTag: string | null;
  startedAt: number | null;
  energyWh: number;
  powerW: number;
  currentA: number | null;
  soc: number | null;
  allocatedW: number;
  demandLimited: boolean;
  needKWh: number | null;
  identMethod: string | null;
  plan: { id: number; targetSoc: number | null; departureAt: number | null; maxKw: number | null } | null;
  pendingPlanId: number | null;
  vehicle: VehicleRef | null;
}

export interface ChargerLive {
  id: string;
  vendor?: string;
  model?: string;
  serial?: string;
  firmware?: string;
  location?: string;
  connected: boolean;
  status?: string;
  lastSeen?: number;
  maxPowerKw: number;
  priority: number;
  connectors: Connector[];
}

export interface SessionRow {
  transaction_id: number;
  charger_id: string;
  connector_id: number;
  vehicle_id: number | null;
  vehicle_name?: string | null;
  vehicle_vin?: string | null;
  vehicle_evccid?: string | null;
  id_tag: string | null;
  ident_method: string | null;
  started_at: number;
  stopped_at: number | null;
  energy_wh: number | null;
  soc_start: number | null;
  soc_end: number | null;
  max_power_w?: number | null;
  stop_reason?: string | null;
  power_w?: number;
  allocated_w?: number;
  live?: boolean;
}

export interface Plan {
  id: number;
  charger_id: string;
  connector_id: number;
  vehicle_id: number | null;
  vehicle_name?: string | null;
  id_tag: string;
  start_at: number;
  departure_at: number | null;
  target_soc: number | null;
  max_kw: number | null;
  status: 'scheduled' | 'starting' | 'active' | 'completed' | 'cancelled' | 'failed';
  transaction_id: number | null;
  note?: string | null;
  created_at: number;
}

export interface LogLine {
  t: number;
  level: string;
  chargerId?: string | null;
  msg: string;
  dir?: string;
}

export interface HistoryPoint {
  t: number;
  limitW: number;
  buildingW: number;
  evW: number;
  allocW: number;
}

export interface Snapshot {
  config: Config;
  buildingLoadW: number;
  availableW: number;
  reservedW: number;
  totalPowerW: number;
  totalAllocatedW: number;
  activeSessions: number;
  chargers: ChargerLive[];
  transactions: SessionRow[];
  plans: Plan[];
  log: LogLine[];
  history: HistoryPoint[];
  serverTime: number;
}

export interface Vehicle {
  id: number;
  name: string;
  make: string | null;
  model: string | null;
  vin: string | null;
  evccid: string | null;
  id_tag: string | null;
  battery_kwh: number;
  max_ac_kw: number;
  phases: number;
  target_soc: number;
  priority: number;
}

export interface ChargerRow {
  id: string;
  vendor: string | null;
  model: string | null;
  location: string | null;
  max_power_kw: number;
  priority: number;
  connectors: number | null;
  last_seen: number | null;
}

export interface Tariffs {
  energyPriceClp: number;
  demandChargeClpKw: number;
  gridCo2KgKwh: number;
  evKmPerKwh: number;
  iceCo2KgKm: number;
  iceKmPerL: number;
  fuelPriceClpL: number;
}

export interface EnergyReport {
  period: { from: number; to: number; days: number; groups: string[] };
  assumptions: Tariffs;
  siteLimitKw: number;
  sessions: number;
  energyKwh: number;
  demand: {
    peakControlledKw: number;
    peakUncontrolledKw: number;
    peakEvControlledKw: number;
    peakEvUncontrolledKw: number;
    peakAvoidedKw: number;
    peakReductionPct: number;
    overLimitUncontrolledPct: number;
    overLimitControlledPct: number;
    requiredConnectionUncontrolledKw: number;
  };
  efficiency: {
    loadFactorControlledPct: number;
    loadFactorUncontrolledPct: number;
    contractedPowerUsePct: number;
    shiftedEnergyKwh: number;
    extraMinutesPerSession: number;
    sessionsReachingTargetPct: number | null;
  };
  economics: { energyCostClp: number; demandChargeSavingsMonthClp: number; savingsVsFuelClp: number; costPerKmClp: number };
  environment: { electricKm: number; co2AvoidedKg: number; co2CombustionKg: number; co2GridKg: number };
  series: { t: number; controlledKw: number; uncontrolledKw: number; auxKw: number }[];
}

export interface EnergyGroups {
  groups: { group: string; sessions: number; lastSessionAt: number }[];
  assumptions: Tariffs;
}

export interface OcppRow {
  t: number;
  charger_id: string;
  dir: 'in' | 'out';
  kind: 'CALL' | 'CALLRESULT' | 'CALLERROR';
  action: string | null;
  msg_id: string;
  error_code: string | null;
  payload: string;
}

export interface CommandRow {
  t: number;
  charger_id: string;
  action: string | null;
  payload: string;
  result_kind: string | null;
  result_payload: string | null;
  result_t: number | null;
  result_error: string | null;
}

export interface CommandStat {
  action: string;
  n: number;
  rejected: number;
  no_response: number;
  latency_ms: number | null;
}

export interface Info {
  motorConnected: boolean;
  gatewayUrl: string;
  ocppUrl: string;
  emulatorUrl: string;
  assistantConfigured: boolean;
}
