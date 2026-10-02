import buildGeoserverUrl from './build-geoserver-url'
import { getInitialCategoryFillPaint, getInitialCategoryCirclePaint } from './category-style'

const MVT_FORMAT = 'application/vnd.mapbox-vector-tile'

/**
 * Build a Mapbox layer from a WMS endpoint.
 * Raster PNG by default; vector tiles when format is MVT.
 */
export default function buildWmsLayer ({
  url: rawUrl,
  id,
  layer,
  styles = '',
  paint = {},
  layout,
  categoryStyle,
  tileSize = 256,
  time,
  filter,
  mapServiceVersion,
  format = 'image/png',
  vectorType,
  promoteId,
  minZoom,
  maxZoom,
  sourceLayer,
}) {
  const url = new URL(rawUrl)
  const searchParamEntries = url.searchParams.entries()
  const searchParamsObject = Object.fromEntries(searchParamEntries)
  const isVector = format === MVT_FORMAT

  const tile = buildGeoserverUrl({
    url: url.origin + url.pathname,
    service: 'WMS',
    request: 'GetMap',
    layers: layer,
    styles,
    width: 256,
    height: 256,
    version: mapServiceVersion,
    ...(time) && { time },
    ...(filter) && { cql_filter: filter },
    crs: 'EPSG:3857',
    transparent: true,
    bbox: '{bbox-epsg-3857}',
    format: isVector ? MVT_FORMAT : 'image/png',
    encode: false,
    ...searchParamsObject,
  })

  if (!isVector) {
    return {
      id,
      layer,
      type: 'raster',
      source: {
        type: 'raster',
        tiles: [ tile ],
        tileSize,
      },
      paint,
    }
  }

  // GeoServer WMS MVT uses the layer local name as the MVT source-layer
  const resolvedSourceLayer = sourceLayer
    || (typeof layer === 'string' && layer.includes(':') ? layer.split(':')[1] : layer)

  const type = vectorType || 'fill'
  let resolvedPaint = paint
  if (categoryStyle && Object.keys(paint || {}).length === 0) {
    resolvedPaint = type === 'circle'
      ? getInitialCategoryCirclePaint(categoryStyle)
      : getInitialCategoryFillPaint(categoryStyle)
  }

  const source = {
    type: 'vector',
    tiles: [ tile ],
    ...(promoteId && resolvedSourceLayer
      ? { promoteId: { [resolvedSourceLayer]: promoteId } }
      : {}),
  }

  return {
    id,
    layer,
    type,
    source,
    'source-layer': resolvedSourceLayer,
    ...(layout && { layout }),
    paint: resolvedPaint,
    ...(minZoom != null && { minzoom: minZoom }),
    ...(maxZoom != null && { maxzoom: maxZoom }),
  }
}
