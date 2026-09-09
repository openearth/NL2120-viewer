/** Optional fields on base-layers-config.json entries, forwarded to LayerLegend. */
export const LAYER_LEGEND_FIELDS = [
  'legendOptions',
  'legendLayout',
  'legendCardMaxWidth',
  'legendBodyMaxHeight',
  'legendExpanded',
]

export const LEGEND_UI_DEFAULTS = {
  cardMaxWidth: 300,
  bodyMaxHeight: 280,
}

export function pickLayerLegendFields (layerConfig) {
  const out = {}
  for (const key of LAYER_LEGEND_FIELDS) {
    if (layerConfig[key] !== undefined) {
      out[key] = layerConfig[key]
    }
  }
  return out
}

export function isDenseLegendLayout (layer) {
  return layer?.legendLayout === 'dense'
}
