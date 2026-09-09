import { defineStore } from 'pinia'
import area from '@turf/area'
import layersConfig from '@/config/base-layers-config.json'
import buildMapboxLayer from '@/lib/build-mapbox-layer'
import { findWorkflowLayer } from '@/lib/find-workflow-layer'
import {
  assignCategoryColors,
  buildCategoryCircleStyle,
  buildCategoryWfsUrl,
  getDimmedCategoryColor,
  isFeatureActive,
  parsePairKey,
  tabulateCategories,
} from '@/lib/category-style'
import { pickLayerLegendFields } from '@/lib/legend-config'
import { useAppStore } from '@/stores/app'

function normalizeLayerUrlForBrowser (rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl
  }

  // Backend may return host.docker.internal URLs valid from containers but
  // unreachable from the browser on Windows; remap to localhost by default.
  const publicGeoserverBase = import.meta.env.VITE_GEOSERVER_PUBLIC_BASE_URL
  if (publicGeoserverBase) {
    try {
      const sourceUrl = new URL(rawUrl)
      const targetBaseUrl = new URL(publicGeoserverBase)
      sourceUrl.protocol = targetBaseUrl.protocol
      sourceUrl.host = targetBaseUrl.host
      return sourceUrl.toString()
    } catch {
      return rawUrl
    }
  }

  return rawUrl.replace('://host.docker.internal:', '://localhost:')
}

function resolveCategoryLoadOptions (layerId, overrides = {}) {
  const layerConfig = layersConfig.find(cfg => cfg.id === layerId)
  const workflowLayer = findWorkflowLayer(layerId)
  const filter = workflowLayer?.attributeFilter || {}
  const style = layerConfig?.categoryStyle || {}

  const attributeKey = overrides.attributeKey
    || style.attribute
    || filter.attributeKey
  if (!attributeKey) return null

  const secondaryAttributeKey = overrides.secondaryAttributeKey !== undefined
    ? overrides.secondaryAttributeKey
    : (filter.secondaryAttributeKey || null)
  const delimiter = overrides.delimiter || style.delimiter || filter.delimiter || ';'
  const emptySecondaryLabel = overrides.emptySecondaryLabel
    || filter.emptySecondaryLabel
    || 'Geen categorie'

  const propertyNames = [ attributeKey, secondaryAttributeKey ].filter(Boolean)
  const wfsUrl = overrides.wfsUrl
    || filter.wfsUrl
    || buildCategoryWfsUrl(layerConfig, propertyNames)

  if (!wfsUrl) return null

  return {
    attributeKey,
    secondaryAttributeKey,
    delimiter,
    emptySecondaryLabel,
    wfsUrl,
    categoryStyle: style,
  }
}

export const useMapStore = defineStore('map', {
  state: () => ({
    layersConfig,
    staticLayerIds: layersConfig.map(cfg => cfg.id),
    mapboxLayers: [],
    layerVisibility: {},
    layerFilters: {},
    layerClickableByStep: {},
    layerCategories: {},
    layerFilterSelection: {},
    layerFilterConfig: {},
    layerDimMode: {},
    categoryLoadPromises: {},
    activeRegion: null,
    activeRegionId: null,
    hoveredFeature: null,
  }),

  getters: {
    visibleMapboxLayers: (state) => {
      const visible = []
      for (const layer of state.mapboxLayers) {
        if (state.layerVisibility[layer.id] === true) {
          const filter = state.layerFilters[layer.id]
          const categoryPaint = buildLiveCategoryStyle(state, layer.id)
          let next = layer
          if (filter) {
            next = { ...next, filter }
          }
          if (categoryPaint) {
            next = {
              ...next,
              paint: { ...next.paint, ...categoryPaint.paint },
              ...(Object.keys(categoryPaint.layout || {}).length > 0
                ? { layout: { ...next.layout, ...categoryPaint.layout } }
                : {}),
            }
          }
          visible.push(next)
        } else if (layer.id.endsWith('_raster')) {
          // Raster layers with '_raster' suffix are shown when their base ID is visible
          const baseId = layer.id.replace('_raster', '')
          if (state.layerVisibility[baseId] === true) {
            visible.push(layer)
          }
        }
      }
      return visible
    },

    isLayerClickable: (state) => (layerId) => {
      const appStore = useAppStore()
      const activeStepId = appStore.activeMenu
      if (!activeStepId) return false
      return state.layerClickableByStep[activeStepId]?.[layerId] ?? false
    },

    isFeatureInteractive: (state) => (layerId, properties) => {
      const dimMode = state.layerDimMode[layerId]
      if (!dimMode) return true
      const selectedKeys = state.layerFilterSelection[layerId]
      const filterConfig = state.layerFilterConfig[layerId]
      if (!filterConfig) return true
      return isFeatureActive(properties, selectedKeys, filterConfig)
    },

    getLayerCategoryRows: (state) => (layerId) => {
      const data = state.layerCategories[layerId]
      if (!data?.values?.length) return []
      const layerConfig = state.layersConfig.find(cfg => cfg.id === layerId)
      const dimColor = getDimmedCategoryColor(layerConfig?.categoryStyle)
      return data.values.map(value => {
        const dimmed = isPrimaryCategoryDimmed(state, layerId, value)
        const categoryColor = data.colorByValue?.[value] || '#9e9e9e'
        return {
          value,
          color: dimmed ? dimColor : categoryColor,
          dimmed,
        }
      })
    },

    visibleLayersWithConfig: (state) => {
      const visible = []
      const seenIds = new Set()

      for (const layerId in state.layerVisibility) {
        if (state.layerVisibility[layerId] === true) {
          // Skip raster layers with _raster suffix (only show base layer legends)
          if (layerId.endsWith('_raster')) {
            continue
          }

          // Avoid duplicates
          if (seenIds.has(layerId)) {
            continue
          }
          seenIds.add(layerId)

          const layerConfig = state.layersConfig.find(config => config.id === layerId)
          if (layerConfig?.showInLegend === false) {
            continue
          }
          if (layerConfig && layerConfig.url && layerConfig.layer) {
            visible.push({
              id: layerId,
              url: layerConfig.url,
              layer: layerConfig.layer,
              name: layerConfig.name,
              legendMode: layerConfig.legendMode || null,
              ...pickLayerLegendFields(layerConfig),
            })
          }
        }
      }

      return visible
    },

    suggestedUom: (state) => {
      const feature = state.activeRegion?.feature
      if (!feature) return null

      const geomArea = area(feature)
      if (!Number.isFinite(geomArea)) return null

      return Math.floor(geomArea / 1000)
    },
  },

  actions: {
    initializeMapboxLayers () {
      const configMap = new Map()
      for (const layerConfig of this.layersConfig) {
        if (!configMap.has(layerConfig.id)) {
          configMap.set(layerConfig.id, [])
        }
        configMap.get(layerConfig.id).push(layerConfig)
      }

      const builtLayers = []
      for (const [ , configs ] of configMap.entries()) {
        if (configs.length > 1) {
          // Duplicate IDs: build both raster (visible) and vector (clickable) layers
          const rasterConfig = configs.find(c => c.format !== 'application/vnd.mapbox-vector-tile')
          const vectorConfig = configs.find(c => c.format === 'application/vnd.mapbox-vector-tile')

          if (rasterConfig) {
            const rasterLayer = buildMapboxLayer(rasterConfig)
            if (rasterLayer) {
              rasterLayer.id = `${ rasterConfig.id }_raster`
              builtLayers.push(rasterLayer)
            }
          }

          if (vectorConfig) {
            const vectorLayer = buildMapboxLayer(vectorConfig)
            if (vectorLayer) {
              builtLayers.push(vectorLayer)
            }
          }
        } else {
          const layer = buildMapboxLayer(configs[0])
          if (layer) {
            builtLayers.push(layer)
          }
        }
      }

      this.mapboxLayers = builtLayers
    },

    initializeLayerVisibility (layers) {
      for (const layer of layers) {
        if (this.layerVisibility[layer.id] === undefined) {
          this.layerVisibility[layer.id] = layer.active ?? false
        }
      }
    },

    registerStepClickability (stepId, layers) {
      if (!stepId || !Array.isArray(layers)) return
      const clickability = {}
      for (const layer of layers) {
        clickability[layer.id] = layer.clickable ?? false
      }
      this.layerClickableByStep[stepId] = clickability
    },

    unregisterStepClickability (stepId) {
      if (!stepId) return
      delete this.layerClickableByStep[stepId]
    },

    setLayerVisibility (layerId, isVisible) {
      this.layerVisibility[layerId] = isVisible
    },

    setLayerFilter (layerId, filter) {
      if (!layerId) return
      if (filter == null) {
        delete this.layerFilters[layerId]
        return
      }
      this.layerFilters[layerId] = filter
    },

    setLayerFilterSelection (layerId, {
      selectedKeys,
      filterConfig,
      dimMode = false,
    }) {
      if (!layerId) return
      this.layerFilterSelection[layerId] = selectedKeys
      this.layerFilterConfig[layerId] = filterConfig || null
      this.layerDimMode[layerId] = dimMode || false

      // Dim mode keeps all features visible; clear any hide-filter
      if (dimMode) {
        this.setLayerFilter(layerId, null)
      }

      this.clearStrandedSelection(layerId)
    },

    clearLayerFilterSelection (layerId) {
      if (!layerId) return
      delete this.layerFilterSelection[layerId]
      delete this.layerFilterConfig[layerId]
      delete this.layerDimMode[layerId]
    },

    clearStrandedSelection (layerId) {
      const region = this.activeRegion
      if (!region || region.layerId !== layerId) return
      if (this.isFeatureInteractive(layerId, region.properties)) return
      this.clearActiveRegion()
      if (this.hoveredFeature?.layerId === layerId) {
        this.clearHoveredFeature()
      }
    },

    async ensureLayerCategories (layerId, overrides = {}) {
      if (!layerId) return null
      if (this.layerCategories[layerId]?.loaded) {
        return this.layerCategories[layerId]
      }
      if (this.categoryLoadPromises[layerId]) {
        return this.categoryLoadPromises[layerId]
      }

      const options = resolveCategoryLoadOptions(layerId, overrides)
      if (!options) return null

      const promise = (async () => {
        try {
          const response = await fetch(options.wfsUrl)
          if (!response.ok) throw new Error(`HTTP ${ response.status }`)
          const data = await response.json()
          const features = Array.isArray(data?.features) ? data.features : []
          const table = tabulateCategories(features, options)
          const colorByValue = assignCategoryColors(
            table.values,
            options.categoryStyle?.colors || {},
          )

          const entry = {
            loaded: true,
            values: table.values,
            options: table.options,
            groups: table.groups,
            hierarchical: table.hierarchical,
            colorByValue,
          }
          this.layerCategories[layerId] = entry
          return entry
        } catch (error) {
          console.error(`[map] Failed to load categories for ${ layerId }:`, error)
          this.layerCategories[layerId] = {
            loaded: true,
            values: [],
            options: [],
            groups: [],
            hierarchical: false,
            colorByValue: {},
            error: 'Unable to load categories.',
          }
          return this.layerCategories[layerId]
        } finally {
          delete this.categoryLoadPromises[layerId]
        }
      })()

      this.categoryLoadPromises[layerId] = promise
      return promise
    },

    setActiveRegion (layerId, feature, regionIdProperty = null) {
      this.activeRegion = {
        layerId: layerId,
        properties: feature.properties || {},
        feature: feature,
      }
      this.activeRegionId =
        regionIdProperty && feature.properties && feature.properties[regionIdProperty] != null
          ? feature.properties[regionIdProperty]
          : null
    },

    clearActiveRegion () {
      this.activeRegion = null
      this.activeRegionId = null
    },

    setHoveredFeature (layerId, feature) {
      if (!layerId || !feature) {
        this.hoveredFeature = null
        return
      }
      this.hoveredFeature = {
        layerId,
        properties: feature.properties || {},
        feature,
      }
    },

    clearHoveredFeature () {
      this.hoveredFeature = null
    },

    addDynamicLayer (layerConfig) {
      const existing = this.mapboxLayers.find(l => l.id === layerConfig.id)
      if (existing) return

      const normalizedUrl = normalizeLayerUrlForBrowser(layerConfig.url)
      const built = buildMapboxLayer({
        ...layerConfig,
        url: normalizedUrl,
        format: 'image/png',
      })
      if (built) {
        this.mapboxLayers.push(built)
        this.layerVisibility[layerConfig.id] = true

        // Ensure dynamic layers also show up in the legend by
        // creating a corresponding layersConfig entry when needed.
        const hasConfig = this.layersConfig.some(cfg => cfg.id === layerConfig.id)
        if (!hasConfig) {
          this.layersConfig.push({
            id: layerConfig.id,
            url: layerConfig.url,
            layer: layerConfig.layer,
            name: layerConfig.name || layerConfig.id,
            dynamic: true,
          })
        }
      }
    },

    removeDynamicLayer (layerId) {
      this.mapboxLayers = this.mapboxLayers.filter(l => l.id !== layerId)
      delete this.layerVisibility[layerId]

      // Remove any dynamic-only config entry so legends stay in sync
      this.layersConfig = this.layersConfig.filter(cfg => !(cfg.id === layerId && cfg.dynamic))
    },

    /**
     * Removes all dynamically added layers (those not present in the static layersConfig).
     */
    clearDynamicLayers () {
      const staticIds = new Set(this.staticLayerIds)

      // Remove all non-static layers from the map and visibility state
      this.mapboxLayers = this.mapboxLayers.filter(layer => {
        const baseId = layer.id.endsWith('_raster')
          ? layer.id.replace('_raster', '')
          : layer.id
        const isStatic = staticIds.has(baseId)
        if (!isStatic) {
          delete this.layerVisibility[layer.id]
        }
        return isStatic
      })

      // Strip any dynamic layer configs so legends update accordingly
      this.layersConfig = this.layersConfig.filter(cfg => staticIds.has(cfg.id))
    },

    resetWorkflowState () {
      this.clearDynamicLayers()
      this.layerVisibility = {}
      this.layerFilters = {}
      this.layerClickableByStep = {}
      this.layerCategories = {}
      this.layerFilterSelection = {}
      this.layerFilterConfig = {}
      this.layerDimMode = {}
      this.categoryLoadPromises = {}
      this.clearActiveRegion()
      this.clearHoveredFeature()
    },
  },
})

function buildLiveCategoryStyle (state, layerId) {
  const layerConfig = state.layersConfig.find(cfg => cfg.id === layerId)
  const categoryStyle = layerConfig?.categoryStyle
  if (!categoryStyle) return null

  const categories = state.layerCategories[layerId]
  const colorByValue = categories?.colorByValue || {}
  const dimMode = state.layerDimMode[layerId]
  const selectedKeys = dimMode ? (state.layerFilterSelection[layerId] ?? null) : null
  const filterConfig = dimMode ? state.layerFilterConfig[layerId] : null

  return buildCategoryCircleStyle(categoryStyle, colorByValue, {
    selectedKeys,
    filterConfig,
  })
}

function isPrimaryCategoryDimmed (state, layerId, primaryValue) {
  const dimMode = state.layerDimMode[layerId]
  if (!dimMode) return false
  const selectedKeys = state.layerFilterSelection[layerId]
  if (!Array.isArray(selectedKeys)) return false
  const filterConfig = state.layerFilterConfig[layerId]
  if (!filterConfig?.secondaryAttributeKey) {
    return !selectedKeys.includes(primaryValue)
  }
  return !selectedKeys.some(key => {
    try {
      const [ primary ] = parsePairKey(key)
      return primary === primaryValue
    } catch {
      return false
    }
  })
}
