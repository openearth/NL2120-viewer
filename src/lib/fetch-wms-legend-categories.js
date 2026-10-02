import {
  buildLegendJsonUrl,
  LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON,
} from './build-legend-url'

const DEFAULT_NODATA_LABEL_PATTERN = /nodata/i

function extractSymbolizerColor (symbolizer) {
  if (!symbolizer || symbolizer.Text) return null

  if (symbolizer.Polygon?.fill) return String(symbolizer.Polygon.fill)
  if (symbolizer.Line?.stroke) return String(symbolizer.Line.stroke)

  const point = symbolizer.Point
  if (point?.fill) return String(point.fill)
  const graphicFill = point?.graphics?.[0]?.fill
  if (graphicFill) return String(graphicFill)

  return null
}

function parseRuleSymbolizerEntry (rule) {
  const label = rule?.title || rule?.name || rule?.filter || ''
  if (!label) return null

  for (const symbolizer of rule?.symbolizers || []) {
    const color = extractSymbolizerColor(symbolizer)
    if (!color) continue
    return {
      value: rule?.name || rule?.title || String(label),
      label: String(label),
      color,
    }
  }
  return null
}

/** Parse GeoServer GetLegendGraphic JSON (Raster colormaps and vector rules). */
export function parseGetLegendGraphicJson (data) {
  const entries = []
  const legends = Array.isArray(data?.Legend) ? data.Legend : []

  for (const legend of legends) {
    for (const rule of legend?.rules || []) {
      let addedRaster = false
      for (const symbolizer of rule?.symbolizers || []) {
        const colormapEntries = symbolizer?.Raster?.colormap?.entries
        if (!Array.isArray(colormapEntries)) continue
        for (const entry of colormapEntries) {
          const label = entry?.label != null ? String(entry.label) : ''
          const color = entry?.color != null ? String(entry.color) : '#9e9e9e'
          const quantity = entry?.quantity != null ? String(entry.quantity) : label
          if (!label && !quantity) continue
          entries.push({
            value: quantity || label,
            label: label || quantity,
            color,
          })
          addedRaster = true
        }
      }
      if (!addedRaster) {
        const ruleEntry = parseRuleSymbolizerEntry(rule)
        if (ruleEntry) entries.push(ruleEntry)
      }
    }
  }

  return entries
}

function filterLegendCategoryEntries (entries, {
  hideNoData = false,
  noDataLabelPattern = DEFAULT_NODATA_LABEL_PATTERN,
} = {}) {
  if (!hideNoData) return entries
  const pattern = noDataLabelPattern instanceof RegExp
    ? noDataLabelPattern
    : new RegExp(String(noDataLabelPattern), 'i')
  return entries.filter(entry => !pattern.test(String(entry?.label || '')))
}

/**
 * Fetch and normalise WMS JSON legend classes for HTML category rows.
 * Opt-in: legendMode "categories" + legendSource "getLegendGraphicJson".
 */
export async function fetchWmsLegendCategories (layerConfig, {
  hideNoData = false,
  noDataLabelPattern = DEFAULT_NODATA_LABEL_PATTERN,
  fetchImpl = fetch,
} = {}) {
  const url = buildLegendJsonUrl(layerConfig)
  if (!url) {
    throw new Error('Missing WMS url/layer for GetLegendGraphic JSON')
  }

  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`HTTP ${ response.status }`)
  }

  const entries = filterLegendCategoryEntries(
    parseGetLegendGraphicJson(await response.json()),
    { hideNoData, noDataLabelPattern },
  )
  if (entries.length === 0) {
    throw new Error('GetLegendGraphic JSON returned no legend classes')
  }

  const colorByValue = {}
  const options = []
  const values = []

  for (const entry of entries) {
    values.push(entry.value)
    options.push({ value: entry.value, label: entry.label })
    colorByValue[entry.value] = entry.color
  }

  return {
    loaded: true,
    source: LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON,
    values,
    options,
    groups: [],
    hierarchical: false,
    colorByValue,
  }
}
