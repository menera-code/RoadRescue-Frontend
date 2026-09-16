// src/data/legal.js
//
// Philippine traffic laws & fines.
//
// ⚠️ These figures are current as of September 2026 but LTO rules change
// frequently. Always verify with the official LTO portal before relying
// on any number here. This is informational, not legal advice.
//
// Source references:
//   - LTO: https://lto.gov.ph
//   - MMDA: https://mmda.gov.ph
//   - Official Gazette: https://officialgazette.gov.ph

export const LEGAL_UPDATED = 'September 2026'

export const LEGAL_CATEGORIES = [
  { key: 'all',           label: 'All' },
  { key: 'licensing',     label: 'Licensing' },
  { key: 'registration',  label: 'Registration' },
  { key: 'traffic',       label: 'Traffic Rules' },
  { key: 'new_laws',      label: 'New Laws' },
]

export const LEGAL_TOPICS = [
  // ========== LICENSING ==========
  {
    id: 'no-valid-license',
    category: 'licensing',
    title: 'Driving Without a Valid License',
    summary: 'No license, or an expired / suspended / revoked license',
    fine: '₱3,000',
    consequences: [
      '1-year disqualification from obtaining a driver\'s license',
      'Vehicle may be impounded until licensed driver is present',
    ],
    lawReference: 'RA 4136, Sec. 19',
    severity: 'serious',
    tags: ['license', 'expired', 'suspended', 'revoked', 'no license'],
    details:
      'You cannot operate a motor vehicle without a valid, unexpired license. A suspended or revoked license is illegal to drive with, even if you physically hold the card.',
  },
  {
    id: 'not-carrying-license',
    category: 'licensing',
    title: 'Failure to Carry License',
    summary: 'Driving without your physical or digital license on hand',
    fine: '₱1,000',
    consequences: [
      'Must present a valid license within 5 days to avoid penalty',
      'LTMS digital ID is accepted as valid proof',
    ],
    lawReference: 'RA 4136, Sec. 20',
    severity: 'minor',
    tags: ['license', 'carry', 'forgot', 'LTMS', 'digital'],
    details:
      'You are required to carry your license at all times while driving. Since 2023, the LTMS digital ID on your phone is legally accepted.',
  },
  {
    id: 'student-driver-alone',
    category: 'licensing',
    title: 'Student Driver Without Companion',
    summary: 'Student permit holder driving without a licensed companion',
    fine: '₱3,000',
    consequences: [
      'Vehicle may be impounded',
      'Permit may be suspended',
    ],
    lawReference: 'RA 4136, Sec. 21',
    severity: 'moderate',
    tags: ['student', 'permit', 'companion', 'supervising'],
    details:
      'A student permit holder must be accompanied by a licensed driver who has held a non-professional or professional license for at least 1 year.',
  },
  {
    id: 'fake-license',
    category: 'licensing',
    title: 'Fake or Counterfeit License',
    summary: 'Using, possessing, or presenting a falsified license',
    fine: '₱3,000',
    consequences: [
      '12-month license suspension',
      'Criminal charges may apply',
    ],
    lawReference: 'RA 4136, Sec. 21',
    severity: 'critical',
    tags: ['fake', 'counterfeit', 'forged', 'fraud'],
    details:
      'Using a fake license is a criminal offense that can also trigger separate charges under the Revised Penal Code for falsification of public documents.',
  },

  // ========== REGISTRATION ==========
  {
    id: 'unregistered-vehicle',
    category: 'registration',
    title: 'Unregistered or Expired Registration',
    summary: 'Driving with expired or missing MV registration',
    fine: '₱10,000',
    consequences: [
      'Vehicle impounded until registered and deemed roadworthy',
      'Back registration fees + penalties also apply',
    ],
    lawReference: 'RA 4136, Sec. 5',
    severity: 'critical',
    tags: ['registration', 'expired', 'unregistered', 'MV', 'OR CR'],
    details:
      'The ₱10,000 fine is on top of all back registration fees owed. Vehicle is impounded until fully compliant and inspected.',
  },
  {
    id: 'illegal-modification',
    category: 'registration',
    title: 'Illegal Vehicle Modifications',
    summary: 'Unauthorized changes to color, engine, or chassis',
    fine: '₱5,000',
    consequences: [
      'Vehicle impounded until restored to original specs',
      'LTO approval required for legal modifications',
    ],
    lawReference: 'RA 4136, Sec. 12',
    severity: 'moderate',
    tags: ['modification', 'custom', 'color', 'engine', 'chassis', 'tune'],
    details:
      'Any change to the color, engine, or chassis of a vehicle must be approved by the LTO in advance. Unapproved changes trigger a fine and require restoration.',
  },
  {
    id: 'defective-equipment',
    category: 'registration',
    title: 'Defective Vehicle Equipment',
    summary: 'Broken lights, mirrors, open mufflers, or faulty brakes',
    fine: '₱5,000',
    consequences: [
      'Must repair before vehicle can be released',
      'Repeat offenses may lead to revocation',
    ],
    lawReference: 'RA 4136, Sec. 34',
    severity: 'moderate',
    tags: ['lights', 'mirrors', 'muffler', 'brakes', 'defective'],
    details:
      'All vehicles must maintain functional lights, mirrors, brakes, horns, and mufflers. Modified exhaust systems ("open pipe") are illegal on public roads.',
  },

  // ========== TRAFFIC RULES ==========
  {
    id: 'no-helmet',
    category: 'traffic',
    title: 'No Motorcycle Helmet',
    summary: 'Riding or carrying a passenger without an approved helmet',
    fine: '₱1,500 (1st) · ₱3,000 (2nd) · ₱5,000 (3rd) · ₱10,000 (4th+)',
    consequences: [
      '1st offense: fine only',
      '4th+ offense: license confiscation + mandatory seminar',
    ],
    lawReference: 'RA 10054, Sec. 7',
    severity: 'serious',
    tags: ['helmet', 'motorcycle', 'rider', 'backride', 'passenger'],
    details:
      'Both rider AND passenger must wear an ICC-approved helmet. The passenger being without a helmet counts against the driver.',
  },
  {
    id: 'substandard-helmet',
    category: 'traffic',
    title: 'Substandard Helmet (No ICC Sticker)',
    summary: 'Wearing a helmet without the required ICC compliance sticker',
    fine: '₱3,000 (1st) · ₱5,000 (2nd+)',
    consequences: [
      'Helmet confiscated on the spot',
    ],
    lawReference: 'RA 10054, Sec. 7',
    severity: 'moderate',
    tags: ['helmet', 'ICC', 'sticker', 'substandard', 'unapproved'],
    details:
      'Helmets must bear the Import Commodity Clearance (ICC) sticker from the Department of Trade and Industry. Unmarked or knock-off helmets are illegal even if they look legitimate.',
  },
  {
    id: 'no-seatbelt',
    category: 'traffic',
    title: 'No Seat Belt',
    summary: 'Driver or front-seat passenger not wearing a seat belt',
    fine: '₱1,000 (1st) · ₱2,000 (2nd) · ₱5,000 (3rd+)',
    consequences: [
      '1-week license suspension starting at 3rd offense',
      'Mandatory road safety seminar',
    ],
    lawReference: 'RA 8750, Sec. 7',
    severity: 'moderate',
    tags: ['seatbelt', 'safety belt', 'driver', 'passenger'],
    details:
      'Required for drivers and front-seat passengers. Rear-seat belts are also required in newer vehicles (RA 8750 IRR).',
  },
  {
    id: 'reckless-driving',
    category: 'traffic',
    title: 'Reckless Driving',
    summary: 'Driving with disregard for traffic rules and safety',
    fine: '₱2,000 (1st) · ₱3,000 (2nd) · ₱10,000 (3rd+)',
    consequences: [
      '3-month license suspension at 3rd offense',
      '6-month suspension for repeat offenses',
      'Vehicle impounded',
    ],
    lawReference: 'RA 4136, Sec. 48',
    severity: 'serious',
    tags: ['reckless', 'speeding', 'dangerous', 'swerving'],
    details:
      'Reckless driving covers a wide range of behaviors: speeding through intersections, aggressive lane-switching, street racing, and ignoring traffic signals in a manner that endangers others.',
  },
  {
    id: 'dui',
    category: 'traffic',
    title: 'Driving Under the Influence (DUI)',
    summary: 'Driving while intoxicated by alcohol or drugs',
    fine: '₱50,000 – ₱500,000',
    consequences: [
      '3–6 month imprisonment',
      'License confiscation + mandatory rehabilitation',
      'If fatality occurs: up to ₱800,000 fine + 20 years imprisonment',
    ],
    lawReference: 'RA 10586',
    severity: 'critical',
    tags: ['DUI', 'drunk', 'alcohol', 'drugs', 'intoxicated'],
    details:
      'BAC threshold: 0.05% for non-professional drivers, 0.0% for professionals, truckers, and PUV drivers. Random checkpoints are authorized to test BAC.',
  },
  {
    id: 'distracted-driving',
    category: 'traffic',
    title: 'Anti-Distracted Driving',
    summary: 'Using a phone, texting, or watching media while driving',
    fine: '₱5,000 (1st) · ₱10,000 (2nd) · ₱15,000 (3rd) · ₱20,000 (4th+)',
    consequences: [
      '3-month license suspension starting at 3rd offense',
    ],
    lawReference: 'RA 10913',
    severity: 'serious',
    tags: ['phone', 'texting', 'cellphone', 'distracted', 'mobile'],
    details:
      'Using a mobile phone while driving is illegal — even at stoplights. Hands-free is allowed for calls only, and only if it does not distract the driver.',
  },
  {
    id: 'disregarding-signs',
    category: 'traffic',
    title: 'Disregarding Traffic Signs',
    summary: 'Ignoring a traffic signal, sign, or enforcer direction',
    fine: '₱1,000',
    consequences: [
      'Automatic NCAP violation if captured by camera',
      'Notice sent via mail to registered owner',
    ],
    lawReference: 'RA 4136, Sec. 39',
    severity: 'minor',
    tags: ['signs', 'signals', 'NCAP', 'traffic light', 'enforcer'],
    details:
      'This covers running red lights, ignoring no-entry signs, and disobeying traffic enforcers. NCAP (No-Contact Apprehension) tickets arrive by mail — failure to respond can suspend your registration renewal.',
  },
  {
    id: 'overloading',
    category: 'traffic',
    title: 'Overloading Passengers or Cargo',
    summary: 'Carrying more passengers or cargo than the vehicle allows',
    fine: '₱2,000',
    consequences: [
      'Cargo offloaded before proceeding',
      'Passengers may be asked to disembark',
    ],
    lawReference: 'RA 4136, Sec. 32',
    severity: 'moderate',
    tags: ['overload', 'cargo', 'passengers', 'excess'],
    details:
      'Both passenger count and cargo weight limits are set per vehicle type. Motorcycles carrying more than one backrider are subject to this rule as well.',
  },

  // ========== NEW LAWS / PENDING ==========
  {
    id: 'anti-road-rage',
    category: 'new_laws',
    title: 'Anti-Road Rage Bill (Pending)',
    summary: 'Proposed law penalizing aggressive driving and road rage',
    fine: 'Up to ₱200,000',
    consequences: [
      'Up to 4 years imprisonment if injury results',
      '6 months to 2 years for threats / harassment',
    ],
    lawReference: 'Senate Bill (pending)',
    severity: 'serious',
    tags: ['road rage', 'aggressive', 'proposed', 'pending'],
    details:
      'Currently in Congress. If passed, road rage incidents involving injury would carry prison time and mandatory driver\'s license revocation.',
  },
  {
    id: 'e-trike-regulation',
    category: 'new_laws',
    title: 'E-Trike & E-Bike Regulation',
    summary: 'New rules for electric tricycles and bicycles on public roads',
    fine: '₱1,000 (obstruction) · ₱1,500 (no helmet)',
    consequences: [
      'Effective January 2026',
      'Confiscation for unregistered e-trikes',
    ],
    lawReference: 'LTO Memo Circular 2025-XX',
    severity: 'moderate',
    tags: ['e-bike', 'e-trike', 'electric', 'regulation', '2026'],
    details:
      'E-trikes must now be registered with the LTO. Riders must wear helmets. Driving on national highways and major thoroughfares without registration is prohibited.',
  },
  {
    id: '15-day-settlement',
    category: 'new_laws',
    title: '15-Day Settlement Rule',
    summary: 'Traffic violations must be settled within 15 working days',
    fine: 'Varies by violation',
    consequences: [
      'Automatic license suspension if unpaid',
      'Registration renewal blocked',
    ],
    lawReference: 'LTO Memo Circular 2026-01',
    severity: 'moderate',
    tags: ['settlement', 'deadline', 'unpaid', 'suspension', '2026'],
    details:
      'Effective January 2026, unsettled traffic violations trigger automatic license suspension and block vehicle registration renewal after 15 working days.',
  },
]

/**
 * Fuzzy search across title, tags, summary, and law reference.
 * Optionally accepts a pre-filtered list to search within.
 */
export function searchLegal(query, source = LEGAL_TOPICS) {
  if (!query || !query.trim()) return source

  const q = query.toLowerCase().trim()

  return source.filter((t) => {
    return (
      t.title.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.lawReference.toLowerCase().includes(q) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
    )
  })
}

/**
 * Human-readable severity label.
 */
export function severityLabel(severity) {
  return {
    minor:    'Minor',
    moderate: 'Moderate',
    serious:  'Serious',
    critical: 'Critical',
  }[severity] || severity
}

/**
 * Category icon — used in list rows.
 */
export function categoryIcon(category) {
  return {
    licensing:    '🪪',
    registration: '📄',
    traffic:      '🚦',
    new_laws:     '🆕',
  }[category] || '⚖️'
}