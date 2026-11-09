// Shared incident type definitions for Admin and Responder views.
// Handles both Firestore keys (flat_tire) and older human-readable values
// (Flat Tire, Dead Battery, etc.).

export const INCIDENT_TYPES = {
  flat_tire:       { label: 'Flat Tire', icon: '🛞' },
  battery:         { label: 'Dead Battery', icon: '🔋' },
  fuel:            { label: 'Out of Fuel', icon: '⛽' },
  stalled_vehicle: { label: 'Stalled', icon: '🛑' },
  minor_collision: { label: 'Minor Crash', icon: '🚗' },
  major_collision: { label: 'Major Crash', icon: '💥' },
  vehicle_fire:    { label: 'Vehicle Fire', icon: '🔥' },
  road_hazard:     { label: 'Road Hazard', icon: '⚠️' },
  emergency:       { label: 'Emergency (SOS)', icon: '🚨' },
  accident:        { label: 'Accident', icon: '🚗' },
  medical:         { label: 'Medical', icon: '🚑' },
  fire:            { label: 'Fire', icon: '🔥' },
  other:           { label: 'Other', icon: '📋' },
}

const TYPE_ALIASES = {
  'flat tire': 'flat_tire',
  flat_tire: 'flat_tire',
  'dead battery': 'battery',
  battery: 'battery',
  'out of fuel': 'fuel',
  fuel: 'fuel',
  stalled: 'stalled_vehicle',
  'stalled vehicle': 'stalled_vehicle',
  stalled_vehicle: 'stalled_vehicle',
  'minor crash': 'minor_collision',
  minor_collision: 'minor_collision',
  'major crash': 'major_collision',
  major_collision: 'major_collision',
  'vehicle fire': 'vehicle_fire',
  vehicle_fire: 'vehicle_fire',
  'road hazard': 'road_hazard',
  road_hazard: 'road_hazard',
  sos: 'emergency',
  'emergency sos': 'emergency',
}

export function normalizeIncidentType(type) {
  if (type == null || type === '') return 'other'

  const key = String(type)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  const normalized = TYPE_ALIASES[key] || key.replace(/ /g, '_')

  return Object.prototype.hasOwnProperty.call(INCIDENT_TYPES, normalized)
    ? normalized
    : 'other'
}

export function getIncidentType(type) {
  return INCIDENT_TYPES[normalizeIncidentType(type)]
}

export function getIncidentIcon(type) {
  return getIncidentType(type).icon
}

export function getIncidentLabel(type) {
  return getIncidentType(type).label
}
