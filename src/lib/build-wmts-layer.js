import buildGeoserverUrl from './build-geoserver-url'


function buildWmtsLayer ({
  url: rawUrl,
  id,
  layer,
  style = '',
  paint = {},
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

  return format === 'application/vnd.mapbox-vector-tile'
    ? {
      'id': id, // Use original config ID to match visibility/clickable state
      layer,
      'type': vectorType,
      'source': {
        type: 'vector',
        tiles: [ tile ],
        ...(bbox && Array.isArray(bbox) && bbox.length > 0 && { bounds: bbox }),
        ...(promoteId && { promoteId: { [layer.split(':')[1]]: promoteId } }),
      },
      'source-layer': layer.split(':')[1],
      paint,
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
