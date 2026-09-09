import queryString from 'query-string'

// https://docs.geoserver.org/stable/en/user/services/wms/get_legend_graphic/
const DEFAULT_LEGEND_OPTIONS = {
  fontAntiAliasing: true,
  fontColor: '0x000000',
  fontSize: 14,
  dpi: 110,
  forceTitles: 'off',
}

function serializeLegendOptions (options) {
  return Object.entries(options)
    .map(([ key, value ]) => `${ key }:${ value }`)
    .join(';')
}

export default function buildLegendUrl (layerData) {
  const { url: rawUrl, layer, legendOptions } = layerData

  if (!rawUrl || !layer) {
    return undefined
  }

  let wmsUrl = rawUrl
  if (rawUrl.includes('/gwc/service/wmts')) {
    wmsUrl = rawUrl.replace('/gwc/service/wmts', '/wms')
  }

  const baseUrl = wmsUrl.endsWith('?') ? wmsUrl.slice(0, -1) : wmsUrl
  const legendOptionsParam = serializeLegendOptions({
    ...DEFAULT_LEGEND_OPTIONS,
    ...legendOptions,
  })

  const params = queryString.stringify({
    request: 'GetLegendGraphic',
    service: 'WMS',
    version: '1.0.0',
    format: 'image/png',
    layer,
    legend_options: legendOptionsParam,
  }, { encode: true, sort: false })

  return `${ baseUrl }?${ params }`
}
