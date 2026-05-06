import queryString from 'query-string'

// GeoServer - GetLegendGraphic Docs
// https://docs.geoserver.org/stable/en/user/services/wms/get_legend_graphic/index.html
export default function buildLegendUrl (layerData) {
  const { url: rawUrl, layer } = layerData
  
  if (!rawUrl || !layer) {
    return undefined
  }
  
  // Convert WMTS URL to WMS URL for GetLegendGraphic
  // Standard GeoServer structure: /gwc/service/wmts? -> /wms?
  let wmsUrl = rawUrl
  if (rawUrl.includes('/gwc/service/wmts')) {
    wmsUrl = rawUrl.replace('/gwc/service/wmts', '/wms')
  }
  
  // Remove trailing ? if present and add it back with params
  const baseUrl = wmsUrl.endsWith('?') ? wmsUrl.slice(0, -1) : wmsUrl
  
  const params = queryString.stringify({
    'request': 'GetLegendGraphic',
    'service': 'WMS',
    'version': '1.0.0',
    'format': 'image/png',
    'layer': layer,
    'legend_options': 'fontAntiAliasing:true;fontColor:0x000000;fontSize:16;labelMargin:8;dpi:90;',
  }, { encode: true, sort: false })
  
  return `${ baseUrl }?${ params }`
}
