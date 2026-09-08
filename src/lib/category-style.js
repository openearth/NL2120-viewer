/**
 * Category colors, Mapbox circle paint, and selection matching for vector point layers.
 * Color tiers (optional): byValue → palette (alpha order) → golden-angle hues.
 */

const GOLDEN_ANGLE = 137.508
const DEFAULT_START_HUE = 210 // blue
const DEFAULT_SATURATION = 72
const DEFAULT_LIGHTNESS = 48
const MIN_HUE_DISTANCE = 28
const EMPTY_SECONDARY = 'Geen categorie'

export function parseDelimitedValues (rawValue, delimiter = ';') {
  if (rawValue == null) return []
  const text = String(rawValue).trim()
  if (!text) return []
  return text
    .split(delimiter)
    .map(v => v.trim())
    .filter(v => v.length > 0)
}

export function pairKey (primary, secondary) {
  return JSON.stringify([ primary, secondary ])
}

export function parsePairKey (key) {
  return JSON.parse(key)
}

/** Match a category token inside a (possibly delimited) attribute.
 * Values are trimmed in JS when discovered; GeoServer attributes often keep
 * trailing spaces, so we search for the token text inside ";attr;" rather than
 * requiring an exact ";token;" match.
 */
export function buildTokenMatchExpression (attribute, value, delimiter = ';') {
  const attrStr = [ 'to-string', [ 'coalesce', [ 'get', attribute ], '' ] ]
  const wrapped = [ 'concat', delimiter, attrStr, delimiter ]
  return [ '>=', [ 'index-of', value, wrapped ], 0 ]
}

export function buildPairCondition (
  primary,
  secondary,
  {
    attributeKey,
    secondaryAttributeKey,
    delimiter = ';',
    emptySecondaryLabel = EMPTY_SECONDARY,
  },
) {
  const primaryMatch = buildTokenMatchExpression(attributeKey, primary, delimiter)

  if (!secondaryAttributeKey) {
    return primaryMatch
  }

  if (secondary === emptySecondaryLabel) {
    return [
      'all',
      primaryMatch,
      [ '==', [ 'coalesce', [ 'get', secondaryAttributeKey ], '' ], '' ],
    ]
  }

  return [
    'all',
    primaryMatch,
    buildTokenMatchExpression(secondaryAttributeKey, secondary, delimiter),
  ]
}

/** Pair keys present on a feature (shared by paint gate and JS interactivity). */
export function getFeaturePairKeys (properties, {
  attributeKey,
  secondaryAttributeKey = null,
  delimiter = ';',
  emptySecondaryLabel = EMPTY_SECONDARY,
} = {}) {
  if (!properties || !attributeKey) return []

  const primaries = parseDelimitedValues(properties[attributeKey], delimiter)
  if (primaries.length === 0) return []

  if (!secondaryAttributeKey) {
    return primaries
  }

  const secondaries = parseDelimitedValues(properties[secondaryAttributeKey], delimiter)
  const resolvedSecondaries = secondaries.length > 0 ? secondaries : [ emptySecondaryLabel ]

  const keys = []
  for (const primary of primaries) {
    for (const secondary of resolvedSecondaries) {
      keys.push(pairKey(primary, secondary))
    }
  }
  return keys
}

export function isFeatureActive (properties, selectedKeys, filterConfig) {
  if (!Array.isArray(selectedKeys)) return true
  if (selectedKeys.length === 0) return false
  const selected = new Set(selectedKeys)
  return getFeaturePairKeys(properties, filterConfig).some(key => selected.has(key))
}

export function buildActiveMatchExpression (selectedKeys, filterConfig) {
  if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) {
    return false
  }

  const conditions = selectedKeys.map(key => {
    if (!filterConfig.secondaryAttributeKey) {
      return buildTokenMatchExpression(
        filterConfig.attributeKey,
        key,
        filterConfig.delimiter,
      )
    }
    const [ primary, secondary ] = parsePairKey(key)
    return buildPairCondition(primary, secondary, filterConfig)
  })

  return conditions.length === 1 ? conditions[0] : [ 'any', ...conditions ]
}

function clamp (n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb (hex) {
  const raw = String(hex).replace('#', '').trim()
  const full = raw.length === 3
    ? raw.split('').map(c => c + c).join('')
    : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHsl (r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  switch (max) {
    case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
    case gn: h = (bn - rn) / d + 2; break
    default: h = (rn - gn) / d + 4; break
  }
  return { h: (h * 60) % 360, s: s * 100, l: l * 100 }
}

function hslToHex (h, s, l) {
  const hn = ((h % 360) + 360) % 360 / 360
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100

  if (sn === 0) {
    const v = Math.round(ln * 255)
    return `#${ [ v, v, v ].map(x => x.toString(16).padStart(2, '0')).join('') }`
  }

  const hue2rgb = (p, q, t) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const r = Math.round(hue2rgb(p, q, hn + 1 / 3) * 255)
  const g = Math.round(hue2rgb(p, q, hn) * 255)
  const b = Math.round(hue2rgb(p, q, hn - 1 / 3) * 255)
  return `#${ [ r, g, b ].map(x => x.toString(16).padStart(2, '0')).join('') }`
}

function hueDistance (a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function resolveStartHue (startHue) {
  if (typeof startHue === 'number' && Number.isFinite(startHue)) {
    return ((startHue % 360) + 360) % 360
  }
  if (typeof startHue === 'string') {
    const rgb = hexToRgb(startHue)
    if (rgb) return rgbToHsl(rgb.r, rgb.g, rgb.b).h
  }
  return DEFAULT_START_HUE
}

function colorToHue (color) {
  const rgb = hexToRgb(color)
  if (!rgb) return null
  return rgbToHsl(rgb.r, rgb.g, rgb.b).h
}

/** Assign colors to discovered values (alpha order for palette / rotation). */
export function assignCategoryColors (values, colorsConfig = {}) {
  const sorted = [ ...values ].sort((a, b) => a.localeCompare(b))
  const byValueRaw = colorsConfig.byValue && typeof colorsConfig.byValue === 'object'
    ? colorsConfig.byValue
    : {}
  const palette = Array.isArray(colorsConfig.palette) ? colorsConfig.palette : []
  const startHue = resolveStartHue(colorsConfig.startHue)
  const saturation = colorsConfig.saturation ?? DEFAULT_SATURATION
  const lightness = colorsConfig.lightness ?? DEFAULT_LIGHTNESS

  const byValueLookup = new Map()
  for (const [ key, color ] of Object.entries(byValueRaw)) {
    byValueLookup.set(String(key).trim().toLowerCase(), color)
  }

  const result = {}
  const usedHues = []
  const remaining = []

  for (const value of sorted) {
    const pinned = byValueLookup.get(String(value).trim().toLowerCase())
    if (pinned) {
      result[value] = pinned
      const hue = colorToHue(pinned)
      if (hue != null) usedHues.push(hue)
    } else {
      remaining.push(value)
    }
  }

  const unmatchedPins = Object.keys(byValueRaw).filter(key => {
    const needle = String(key).trim().toLowerCase()
    return !sorted.some(v => String(v).trim().toLowerCase() === needle)
  })
  if (unmatchedPins.length > 0 && import.meta.env.DEV) {
    console.warn('[category-style] colors.byValue keys not found in data:', unmatchedPins)
  }

  let paletteIndex = 0
  const needsGenerated = []
  for (const value of remaining) {
    if (paletteIndex < palette.length) {
      const color = palette[paletteIndex++]
      result[value] = color
      const hue = colorToHue(color)
      if (hue != null) usedHues.push(hue)
    } else {
      needsGenerated.push(value)
    }
  }

  let hue = startHue
  let guard = 0
  for (const value of needsGenerated) {
    while (guard < 1000) {
      const conflict = usedHues.some(u => hueDistance(u, hue) < MIN_HUE_DISTANCE)
      guard += 1
      if (!conflict) break
      hue = (hue + GOLDEN_ANGLE) % 360
    }
    const color = hslToHex(hue, saturation, lightness)
    result[value] = color
    usedHues.push(hue)
    hue = (hue + GOLDEN_ANGLE) % 360
  }

  return result
}

export function tabulateCategories (features, {
  attributeKey,
  secondaryAttributeKey = null,
  delimiter = ';',
  emptySecondaryLabel = EMPTY_SECONDARY,
} = {}) {
  if (!attributeKey) {
    return { values: [], options: [], groups: [], hierarchical: false }
  }

  if (!secondaryAttributeKey) {
    const counts = new Map()
    for (const feature of features) {
      for (const value of parseDelimitedValues(feature?.properties?.[attributeKey], delimiter)) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }
    const options = Array.from(counts.entries())
      .map(([ value, count ]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
    return {
      values: options.map(o => o.value),
      options,
      groups: [],
      hierarchical: false,
    }
  }

  const parentCounts = new Map()
  const childCounts = new Map()

  for (const feature of features) {
    const primaries = parseDelimitedValues(feature?.properties?.[attributeKey], delimiter)
    if (primaries.length === 0) continue

    const secondaries = parseDelimitedValues(
      feature?.properties?.[secondaryAttributeKey],
      delimiter,
    )
    const resolvedSecondaries = secondaries.length > 0 ? secondaries : [ emptySecondaryLabel ]

    for (const primary of primaries) {
      parentCounts.set(primary, (parentCounts.get(primary) ?? 0) + 1)
      if (!childCounts.has(primary)) childCounts.set(primary, new Map())
      const children = childCounts.get(primary)
      for (const secondary of resolvedSecondaries) {
        children.set(secondary, (children.get(secondary) ?? 0) + 1)
      }
    }
  }

  const groups = Array.from(parentCounts.entries())
    .map(([ value, count ]) => {
      const childrenMap = childCounts.get(value) ?? new Map()
      const children = Array.from(childrenMap.entries())
        .map(([ childValue, childCount ]) => ({ value: childValue, count: childCount }))
        .sort((a, b) => {
          if (a.value === emptySecondaryLabel) return 1
          if (b.value === emptySecondaryLabel) return -1
          return a.value.localeCompare(b.value)
        })
      return { value, count, children }
    })
    .sort((a, b) => a.value.localeCompare(b.value))

  return {
    values: groups.map(g => g.value),
    options: [],
    groups,
    hierarchical: true,
  }
}

/** Build a WFS GetFeature URL from a base-layers-config entry. */
export function buildCategoryWfsUrl (layerConfig, propertyNames = []) {
  if (!layerConfig?.url || !layerConfig?.layer) return null

  let origin
  try {
    origin = new URL(layerConfig.url).origin
  } catch {
    return null
  }

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: layerConfig.layer,
    outputFormat: 'application/json',
  })

  const props = propertyNames.filter(Boolean)
  if (props.length > 0) {
    params.set('propertyName', props.join(','))
  }

  return `${ origin }/geoserver/wfs?${ params.toString() }`
}

function buildCategoryColorExpression (attribute, colorByValue, fallbackColor, delimiter) {
  const entries = Object.entries(colorByValue || {})
  if (entries.length === 0) return fallbackColor

  const expr = [ 'case' ]
  for (const [ value, color ] of entries) {
    expr.push(buildTokenMatchExpression(attribute, value, delimiter))
    expr.push(color)
  }
  expr.push(fallbackColor)
  return expr
}

/** Circle paint (+ sort-key). selectedKeys null → no dimming. */
export function buildCategoryCircleStyle (categoryStyle, colorByValue, {
  selectedKeys = null,
  filterConfig = null,
} = {}) {
  const style = categoryStyle || {}
  const attribute = style.attribute
  const delimiter = style.delimiter || filterConfig?.delimiter || ';'
  const fallbackColor = style.fallbackColor || '#9e9e9e'
  const radius = style.radius ?? 7
  const baseStroke = style.strokeColor || '#ffffff'
  const baseStrokeWidth = style.strokeWidth ?? 1.5
  const hover = style.hover || {}
  const selected = style.selected || {}
  const dimmed = style.dimmed || {}
  const dimColor = getDimmedCategoryColor(style)
  const dimOpacity = dimmed.opacity ?? 0.45
  const dimStroke = dimmed.strokeColor || baseStroke
  const dimStrokeWidth = dimmed.strokeWidth ?? baseStrokeWidth

  const categoryColor = attribute
    ? buildCategoryColorExpression(attribute, colorByValue, fallbackColor, delimiter)
    : fallbackColor

  const isSelected = [ 'boolean', [ 'feature-state', 'selected' ], false ]
  const isHovered = [ 'boolean', [ 'feature-state', 'hover' ], false ]

  const shouldDim = Array.isArray(selectedKeys) && filterConfig?.attributeKey
  const activeMatch = shouldDim
    ? buildActiveMatchExpression(selectedKeys, filterConfig)
    : true
  const isDimmed = shouldDim
    ? [ '!', activeMatch ]
    : false

  const paint = {
    'circle-radius': radius,
    'circle-color': shouldDim
      ? [ 'case', isDimmed, dimColor, categoryColor ]
      : categoryColor,
    'circle-opacity': shouldDim
      ? [ 'case', isDimmed, dimOpacity, 1 ]
      : 1,
    'circle-stroke-color': [
      'case',
      ...(shouldDim ? [ isDimmed, dimStroke ] : []),
      isSelected, selected.strokeColor || '#000000',
      isHovered, hover.strokeColor || '#212121',
      baseStroke,
    ],
    'circle-stroke-width': [
      'case',
      ...(shouldDim ? [ isDimmed, dimStrokeWidth ] : []),
      isSelected, selected.strokeWidth ?? 4,
      isHovered, hover.strokeWidth ?? 3,
      baseStrokeWidth,
    ],
  }

  const layout = shouldDim
    ? {
      'circle-sort-key': [ 'case', isDimmed, 0, 1 ],
    }
    : {}

  return { paint, layout }
}

export function getInitialCategoryCirclePaint (categoryStyle) {
  const style = categoryStyle || {}
  return {
    'circle-radius': style.radius ?? 7,
    'circle-color': style.fallbackColor || '#9e9e9e',
    'circle-opacity': 1,
    'circle-stroke-color': style.strokeColor || '#ffffff',
    'circle-stroke-width': style.strokeWidth ?? 1.5,
  }
}

/** Grey used for dimmed map circles and matching UI swatches. */
export function getDimmedCategoryColor (categoryStyle) {
  return categoryStyle?.dimmed?.color || '#bdbdbd'
}
