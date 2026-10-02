import queryString from 'query-string'

// https://docs.geoserver.org/stable/en/user/services/wms/get_legend_graphic/
const DEFAULT_LEGEND_OPTIONS = {
  fontAntiAliasing: true,
  fontColor: '0x000000',
  fontSize: 14,
  dpi: 110,
  forceTitles: 'off',
}

/** Opt-in legendSource value: HTML rows from GeoServer GetLegendGraphic JSON. */
export const LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON = 'getLegendGraphicJson'

function serializeLegendOptions (options) {
  return Object.entries(options)
    .map(([ key, value ]) => `${ key }:${ value }`)
    .join(';')
}

/** Rewrite GWC WMTS URLs to WMS and strip a trailing `?`. */
function resolveWmsLegendBaseUrl (rawUrl) {
  if (!rawUrl) return undefined

  let wmsUrl = rawUrl
  if (rawUrl.includes('/gwc/service/wmts')) {
    wmsUrl = rawUrl.replace('/gwc/service/wmts', '/wms')
  }

  return wmsUrl.endsWith('?') ? wmsUrl.slice(0, -1) : wmsUrl
}

function buildLegendRequestUrl (layerData, { format, includeLegendOptions = true } = {}) {
  const { url: rawUrl, layer, legendOptions } = layerData

  if (!rawUrl || !layer) {
    return undefined
  }

  const baseUrl = resolveWmsLegendBaseUrl(rawUrl)
  if (!baseUrl) return undefined

  const params = {
    request: 'GetLegendGraphic',
    service: 'WMS',
    version: '1.0.0',
    format,
    layer,
  }

  if (includeLegendOptions) {
    params.legend_options = serializeLegendOptions({
      ...DEFAULT_LEGEND_OPTIONS,
      ...legendOptions,
    })
  }

  return `${ baseUrl }?${ queryString.stringify(params, { encode: true, sort: false }) }`
}

/** PNG GetLegendGraphic URL (default floating-legend image). */
export default function buildLegendUrl (layerData) {
  return buildLegendRequestUrl(layerData, {
    format: 'image/png',
    includeLegendOptions: true,
  })
}

/** GeoServer JSON GetLegendGraphic URL (machine-readable class list). */
export function buildLegendJsonUrl (layerData) {
  return buildLegendRequestUrl(layerData, {
    format: 'application/json',
    includeLegendOptions: false,
  })
}
