/**
 * Resolve Mapbox layer ids controlled by a relatedGeometry config.
 */
export function resolveRelatedGeometryLayerIds (relatedGeometry) {
  if (!relatedGeometry?.layerId) return []
  const ids = [ relatedGeometry.layerId ]
  if (relatedGeometry.outlineLayerId) {
    ids.push(relatedGeometry.outlineLayerId)
  }
  return ids
}

/**
 * Build a Mapbox filter that matches targetAttribute to one or more join values.
 */
export function buildRelatedGeometryFilter (targetAttribute, joinValueOrValues) {
  const values = [ ]
    .concat(joinValueOrValues)
    .filter(value => value != null && value !== '')
    .map(value => String(value))

  const uniqueValues = [ ...new Set(values) ]
  if (uniqueValues.length === 0) return [ 'any' ]

  const conditions = uniqueValues.map(value => [
    '==',
    [ 'to-string', [ 'get', targetAttribute ] ],
    value,
  ])

  return conditions.length === 1 ? conditions[0] : [ 'any', ...conditions ]
}

/**
 * Build a WFS GetFeature URL for a layer config filtered by attribute = value.
 */
export function buildRelatedGeometryWfsUrl (layerConfig, attribute, value) {
  if (!layerConfig?.url || !layerConfig?.layer || attribute == null || value == null) {
    return null
  }

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
    cql_filter: `${ attribute }=${ formatCqlValue(value) }`,
  })

  return `${ origin }/geoserver/wfs?${ params.toString() }`
}

function formatCqlValue (value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  const text = String(value).replace(/'/g, "''")
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return text
  }
  return `'${ text }'`
}
