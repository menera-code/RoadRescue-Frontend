// src/data/barangays.js
//
// Calapan City, Oriental Mindoro — 62 barangays.
//
// Coordinates are DEMO approximations (same values seeded into Firestore).
// They're good enough for "nearest barangay" auto-detection in development.
// Refine as real incident data comes in.

export const BARANGAYS = [
  // ---------- Poblacion (city center) ----------
  { name: 'Ibaba East (Poblacion)',           lat: 13.4100, lng: 121.1830 },
  { name: 'Ibaba West (Poblacion)',           lat: 13.4090, lng: 121.1790 },
  { name: 'Ilaya (Poblacion)',                lat: 13.4130, lng: 121.1840 },
  { name: 'Libis (Poblacion)',                lat: 13.4075, lng: 121.1865 },
  { name: 'San Vicente Central (Poblacion)',  lat: 13.4115, lng: 121.1805 },
  { name: 'San Vicente East (Poblacion)',     lat: 13.4118, lng: 121.1855 },
  { name: 'San Vicente North (Poblacion)',    lat: 13.4155, lng: 121.1815 },
  { name: 'San Vicente South (Poblacion)',    lat: 13.4070, lng: 121.1800 },
  { name: 'San Vicente West (Poblacion)',     lat: 13.4110, lng: 121.1760 },
  { name: 'Santa Rita (Poblacion)',           lat: 13.4085, lng: 121.1820 },

  // ---------- Northern ----------
  { name: 'Balingayan',       lat: 13.4450, lng: 121.1890 },
  { name: 'Balite',           lat: 13.4350, lng: 121.1810 },
  { name: 'Baruyan',          lat: 13.4420, lng: 121.1740 },
  { name: 'Batino',           lat: 13.4380, lng: 121.1870 },
  { name: 'Bayanan I',        lat: 13.4480, lng: 121.1720 },
  { name: 'Bayanan II',       lat: 13.4520, lng: 121.1690 },
  { name: 'Biga',             lat: 13.4410, lng: 121.1800 },
  { name: 'Buenavista',       lat: 13.4530, lng: 121.1855 },
  { name: 'Bulusan',          lat: 13.4470, lng: 121.1660 },

  // ---------- Western ----------
  { name: 'Calero',           lat: 13.4140, lng: 121.1710 },
  { name: 'Camilmil',         lat: 13.4000, lng: 121.1655 },
  { name: 'Canubing I',       lat: 13.3985, lng: 121.1595 },
  { name: 'Canubing II',      lat: 13.3940, lng: 121.1570 },
  { name: 'Comunal',          lat: 13.4045, lng: 121.1620 },
  { name: 'Guinobatan',       lat: 13.3980, lng: 121.1680 },
  { name: 'Gulpio',           lat: 13.4065, lng: 121.1645 },
  { name: 'Lalud',            lat: 13.4155, lng: 121.1685 },
  { name: 'Lazareto',         lat: 13.3995, lng: 121.1735 },
  { name: 'Lumangbayan',      lat: 13.4040, lng: 121.1695 },
  { name: 'Mahal na Pangalan', lat: 13.4120, lng: 121.1730 },
  { name: 'Maidlang',         lat: 13.3960, lng: 121.1695 },
  { name: 'Malad',            lat: 13.4010, lng: 121.1575 },
  { name: 'Malamig',          lat: 13.3910, lng: 121.1630 },

  // ---------- Eastern ----------
  { name: 'Managpi',          lat: 13.4020, lng: 121.1950 },
  { name: 'Masipit',          lat: 13.4135, lng: 121.1905 },
  { name: 'Nag-Iba I',        lat: 13.3860, lng: 121.1990 },
  { name: 'Nag-Iba II',       lat: 13.3820, lng: 121.1960 },
  { name: 'Navotas',          lat: 13.4220, lng: 121.1990 },
  { name: 'Pachoca',          lat: 13.4095, lng: 121.1935 },
  { name: 'Palhi',            lat: 13.3855, lng: 121.1900 },
  { name: 'Panggalaan',       lat: 13.4065, lng: 121.1985 },
  { name: 'Parang',           lat: 13.4005, lng: 121.1900 },
  { name: 'Patas',            lat: 13.3960, lng: 121.1990 },
  { name: 'Personas',         lat: 13.3870, lng: 121.1870 },
  { name: 'Puting Tubig',     lat: 13.3930, lng: 121.1945 },

  // ---------- Southern ----------
  { name: 'Salong',               lat: 13.3800, lng: 121.1740 },
  { name: 'San Antonio',          lat: 13.3775, lng: 121.1820 },
  { name: 'Santa Cruz',           lat: 13.3745, lng: 121.1760 },
  { name: 'Santa Isabel',         lat: 13.3710, lng: 121.1855 },
  { name: 'Santa Maria Village',  lat: 13.3805, lng: 121.1695 },
  { name: 'Santo Niño',           lat: 13.3740, lng: 121.1640 },
  { name: 'Sapul',                lat: 13.3690, lng: 121.1705 },
  { name: 'Silonay',              lat: 13.3810, lng: 121.1810 },
  { name: 'Suqui',                lat: 13.3775, lng: 121.1880 },
  { name: 'Tawiran',              lat: 13.3855, lng: 121.1920 },
  { name: 'Tibag',                lat: 13.3745, lng: 121.1695 },
  { name: 'Wawa',                 lat: 13.4130, lng: 121.2020 },
]

// Flat list of names (used by the dropdown)
export const BARANGAY_NAMES = BARANGAYS.map((b) => b.name)

/**
 * Turn a barangay name into a Firestore-friendly slug.
 * "Ilaya (Poblacion)" → "ilaya-poblacion"
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Find the barangay whose center is closest to the given coordinates.
 * Uses Haversine distance (accurate to a few meters).
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ name: string, lat: number, lng: number, distance: number } | null}
 */
export function findNearestBarangay(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  let best = null
  let bestDist = Infinity

  for (const b of BARANGAYS) {
    const d = haversine(lat, lng, b.lat, b.lng)
    if (d < bestDist) {
      bestDist = d
      best = b
    }
  }

  return best ? { ...best, distance: bestDist } : null
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000 // meters
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Fuzzy search — returns barangay NAMES matching the query.
 * Prioritizes prefix matches.
 */
export function searchBarangays(query) {
  if (!query || !query.trim()) return BARANGAY_NAMES

  const q = query.toLowerCase().trim()
  const startsWith = []
  const contains = []

  for (const name of BARANGAY_NAMES) {
    const lower = name.toLowerCase()
    if (lower.startsWith(q)) startsWith.push(name)
    else if (lower.includes(q)) contains.push(name)
  }

  return [...startsWith, ...contains]
}