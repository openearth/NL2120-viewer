const DEFAULT_JOIN_ATTRIBUTE = 'fid'

/** Mapbox layer ids controlled by a relatedGeometry config (fill + optional outline). */
export function resolveRelatedGeometryLayerIds (relatedGeometry) {
  if (!relatedGeometry?.layerId) return []
  const ids = [ relatedGeometry.layerId ]
  if (relatedGeometry.outlineLayerId) {
    ids.push(relatedGeometry.outlineLayerId)
  }
  return ids
}

export function getRelatedJoinAttribute (relatedGeometry, which = 'source') {
  if (which === 'target') {
    return relatedGeometry?.targetAttribute || DEFAULT_JOIN_ATTRIBUTE
  }
  return relatedGeometry?.sourceAttribute || DEFAULT_JOIN_ATTRIBUTE
}

export function getRelatedJoinValue (region, sourceAttribute) {
  if (!region) return null
  const value = region.properties?.[sourceAttribute] ?? region.feature?.id
  if (value == null || value === '') return null
  return value
}

/** Mapbox filter matching targetAttribute to one or more join values. */
export function buildRelatedGeometryFilter (targetAttribute, joinValueOrValues) {
  const uniqueValues = [ ...new Set(
    []
      .concat(joinValueOrValues)
      .filter(value => value != null && value !== '')
      .map(value => String(value)),
  ) ]

  if (uniqueValues.length === 0) return [ 'any' ]

  const conditions = uniqueValues.map(value => [
    '==',
    [ 'to-string', [ 'get', targetAttribute ] ],
    value,
  ])

  return conditions.length === 1 ? conditions[0] : [ 'any', ...conditions ]
}

/** WFS GetFeature URL for a layer config filtered by attribute = value. */
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
  const text = String(value).replace(/'/g, '\'\'')
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return text
  }
  return `'${ text }'`
}
