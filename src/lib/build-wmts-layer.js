import buildGeoserverUrl from './build-geoserver-url'
import { getInitialCategoryCirclePaint, getInitialCategoryFillPaint } from './category-style'


function buildWmtsLayer ({
  url: rawUrl,
  id,
  layer,
  style = '',
  paint = {},
  layout,
  categoryStyle,
  mapServiceVersion = '1.0.0',
  bbox = [],
  format,
  vectorType,
  promoteId,
  minZoom,
  maxZoom,
}) {
  const url = new URL(rawUrl)
  const tile = buildGeoserverUrl({
    url: url.origin + url.pathname,
    service: 'WMTS',
    request: 'GetTile',
    layer,
    style,
    version: mapServiceVersion,
    format,
    tilematrixset: 'EPSG:900913',
    tilematrix: 'EPSG:900913:{z}',
    tilerow: '{y}',
    tilecol: '{x}',
    encode: false,
    transparent: true,
  })

  // Neutral style until the store applies live category colors
  let resolvedPaint = paint
  if (categoryStyle && Object.keys(paint || {}).length === 0) {
    resolvedPaint = vectorType === 'fill'
      ? getInitialCategoryFillPaint(categoryStyle)
      : getInitialCategoryCirclePaint(categoryStyle)
  }

  return format === 'application/vnd.mapbox-vector-tile'
    ? {
      'id': id,
      layer,
      'type': vectorType,
      'source': {
        type: 'vector',
        tiles: [ tile ],
        ...(bbox && Array.isArray(bbox) && bbox.length > 0 && { bounds: bbox }),
        ...(promoteId && { promoteId: { [layer.split(':')[1]]: promoteId } }),
      },
      'source-layer': layer.split(':')[1],
      ...(layout && { layout }),
      paint: resolvedPaint,
      ...(minZoom && { minzoom: minZoom }),
      ...(maxZoom && { maxzoom: maxZoom }),
    }
    : {
      id,
      layer,
      type: 'raster',
      source: {
        type: 'raster',
        tiles: [ tile ],
        tileSize: 256,
        ...(bbox && Array.isArray(bbox) && bbox.length > 0 && { bounds: bbox }),
      },
      ...(minZoom && { minzoom: minZoom }),
      ...(maxZoom && { maxzoom: maxZoom }),
    }
}

export default buildWmtsLayer
