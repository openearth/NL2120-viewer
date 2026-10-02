import { defineStore } from 'pinia'
import area from '@turf/area'
import layersConfig from '@/config/base-layers-config.json'
import workflowConfig from '@/config/workflow.json'
import buildMapboxLayer from '@/lib/build-mapbox-layer'
import { findWorkflowLayer } from '@/lib/find-workflow-layer'
import {
  assignCategoryColors,
  buildLiveCategoryPaint,
  buildCategoryWfsUrl,
  getDimmedCategoryColor,
  isFeatureActive,
  parsePairKey,
  tabulateCategories,
} from '@/lib/category-style'
import { LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON } from '@/lib/build-legend-url'
import { fetchWmsLegendCategories } from '@/lib/fetch-wms-legend-categories'
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

function resolveCategoryLoadOptions (layerId, overrides = {}, layersConfigList = layersConfig) {
  const layerConfig = layersConfigList.find(cfg => cfg.id === layerId)
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
  const match = overrides.match || style.match || 'token'
  const includeEmpty = overrides.includeEmpty !== undefined
    ? overrides.includeEmpty
    : (style.empty?.showInLegend !== false && match === 'exact')
  const emptyLabel = overrides.emptyLabel
    || style.empty?.label
    || null

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
    match,
    includeEmpty,
    emptyLabel,
    wfsUrl,
    categoryStyle: style,
  }
}

export const useMapStore = defineStore('map', {
  state: () => ({
    layersConfig: layersConfig.map(cfg => ({ ...cfg })),
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
    /**
     * Durable map feature committed on step confirm (commitSelectionOnConfirm).
     * Independent of activeRegion so later feature inspection does not clear it.
     * Shape: { layerId, featureId, source, sourceLayer }
     */
    committedSelection: null,
  }),

  getters: {
    /**
     * True when committedSelection exists and the active (or progressed) step
     * is at or after the first workflow step with committedSelectionOutline.fromHere.
     */
    isCommittedOutlineVisible: (state) => {
      if (!state.committedSelection) return false
      const steps = workflowConfig.steps || []
      const fromIndex = steps.findIndex(s => s.committedSelectionOutline?.fromHere === true)
      if (fromIndex < 0) return false

      const appStore = useAppStore()
      if (appStore.activeMenu) {
        const activeIndex = steps.findIndex(s => s.id === appStore.activeMenu)
        return activeIndex >= fromIndex
      }

      // Menu closed: keep outline once the fromHere step is reachable
      const fromStep = steps[fromIndex]
      return Boolean(fromStep && appStore.isStepAvailable(fromStep))
    },

    visibleMapboxLayers: (state) => {
      const visible = []
      for (const layer of state.mapboxLayers) {
        if (layer.id.endsWith('__outline')) {
          continue
        }
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
          // Category fill outlines are managed inside MapLayer (same source lifecycle)
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
      const style = layerConfig?.categoryStyle || {}
      const dimColor = getDimmedCategoryColor(style)
      const labelJoin = style.legend?.labelJoin ?? null
      const delimiter = style.delimiter || ';'
      const emptyLabel = style.empty?.label || 'No applicable NbS'

      return data.values.map(value => {
        const dimmed = isPrimaryCategoryDimmed(state, layerId, value)
        const categoryColor = value === ''
          ? (style.empty?.color || '#e0e0e0')
          : (data.colorByValue?.[value] || '#9e9e9e')
        const option = data.options?.find(o => o.value === value)
        let label
        if (value === '') {
          label = emptyLabel
        } else if (labelJoin) {
          label = String(value).split(delimiter).map(s => s.trim()).filter(Boolean).join(labelJoin)
        } else {
          label = option?.label || value
        }
        return {
          value,
          label,
          color: dimmed ? dimColor : categoryColor,
          dimmed,
          count: option?.count,
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
          if (layerConfig?.dynamic === true && (!layerConfig.url || !layerConfig.layer)) {
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
        // Dynamic slots are filled later by process outputActions
        if (layerConfig.dynamic === true && !layerConfig.url) continue
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

      const layerConfig = this.layersConfig.find(cfg => cfg.id === layerId)
      const legendSource = overrides.legendSource || layerConfig?.legendSource || null

      // Opt-in: HTML rows from GeoServer GetLegendGraphic JSON (LayerLegend falls
      // back to the PNG legend when this path sets error).
      if (legendSource === LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON) {
        if (!layerConfig?.url || !layerConfig?.layer) return null
        const hideNoData = overrides.hideNoData !== undefined
          ? overrides.hideNoData
          : Boolean(layerConfig.legendHideNoData)

        const promise = (async () => {
          try {
            const entry = await fetchWmsLegendCategories(layerConfig, { hideNoData })
            this.layerCategories[layerId] = entry
            return entry
          } catch (error) {
            console.error(`[map] Failed to load WMS JSON legend for ${ layerId }:`, error)
            this.layerCategories[layerId] = {
              loaded: true,
              source: LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON,
              values: [],
              options: [],
              groups: [],
              hierarchical: false,
              colorByValue: {},
              error: 'Unable to load legend categories.',
            }
            return this.layerCategories[layerId]
          } finally {
            delete this.categoryLoadPromises[layerId]
          }
        })()

        this.categoryLoadPromises[layerId] = promise
        return promise
      }

      const options = resolveCategoryLoadOptions(layerId, overrides, this.layersConfig)
      if (!options) return null

      const promise = (async () => {
        try {
          const response = await fetch(options.wfsUrl)
          if (!response.ok) throw new Error(`HTTP ${ response.status }`)
          const data = await response.json()
          const features = Array.isArray(data?.features) ? data.features : []
          const table = tabulateCategories(features, options)
          const colorByValue = assignCategoryColors(
            table.values.filter(v => v !== ''),
            options.categoryStyle?.colors || {},
          )
          if (table.values.includes('')) {
            colorByValue[''] = options.categoryStyle?.empty?.color || '#e0e0e0'
          }

          // Optional frequency sort for legend (exact-match already sorts by count)
          let values = table.values
          let categoryOptions = table.options
          if (options.categoryStyle?.legend?.sort === 'count' && options.match !== 'exact') {
            categoryOptions = [ ...table.options ].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
            values = categoryOptions.map(o => o.value)
          }

          const entry = {
            loaded: true,
            values,
            options: categoryOptions,
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
      // Only update activeRegionId for region-selection layers; keep prior id when
      // inspecting other features (e.g. NbS hexagons) so process inputs stay valid.
      if (regionIdProperty && feature.properties && feature.properties[regionIdProperty] != null) {
        this.activeRegionId = feature.properties[regionIdProperty]
      }
    },

    clearActiveRegion ({ clearRegionId = true } = {}) {
      this.activeRegion = null
      if (clearRegionId) {
        this.activeRegionId = null
      }
    },

    /**
     * Persist the current activeRegion as a committed selection (generic; any layer).
     * Does not clear activeRegionId. Callers clear interactive highlight via MapLayer watch.
     */
    commitSelectionFromActive () {
      const region = this.activeRegion
      const feature = region?.feature
      if (!region?.layerId || !feature || feature.id == null) return false

      this.committedSelection = {
        layerId: region.layerId,
        featureId: feature.id,
        source: feature.source ?? region.layerId,
        sourceLayer: feature.sourceLayer ?? null,
      }
      return true
    },

    clearCommittedSelection () {
      this.committedSelection = null
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

    /**
     * Add or fill a map layer from a process response / runtime config.
     *
     * Slot mode (preferred): layerConfig.id matches a `dynamic: true` entry in
     * base-layers-config.json. URL/layer from the process fill that slot; paint,
     * categoryStyle, format, etc. come from the slot definition.
     *
     * Legacy mode: no matching slot → create an ad-hoc PNG raster layer (previous behaviour).
     */
    addDynamicLayer (layerConfig) {
      if (!layerConfig?.id && !layerConfig?.layer) return

      const slotId = layerConfig.slotId || layerConfig.id
      const slotIndex = this.layersConfig.findIndex(
        cfg => cfg.id === slotId && cfg.dynamic === true,
      )
      const isSlot = slotIndex >= 0

      const normalizedUrl = normalizeLayerUrlForBrowser(layerConfig.url)
      const geoserverLayer = layerConfig.layer || layerConfig.id

      if (isSlot) {
        const slot = this.layersConfig[slotIndex]
        const merged = {
          ...slot,
          url: normalizedUrl,
          layer: geoserverLayer,
          name: layerConfig.name || slot.name || slotId,
          // Keep slot id stable for LayerList / legend / featureInfo
          id: slotId,
        }
        // Replace slot metadata so legend/WFS resolve the live URL
        this.layersConfig[slotIndex] = merged

        const built = buildMapboxLayer(merged)
        if (!built) return

        const existingIdx = this.mapboxLayers.findIndex(l => l.id === slotId)
        if (existingIdx >= 0) {
          this.mapboxLayers.splice(existingIdx, 1, built)
        } else {
          this.mapboxLayers.push(built)
        }

        if (this.layerVisibility[slotId] === undefined) {
          this.layerVisibility[slotId] = true
        }

        // Categories may change when the slot is refilled
        delete this.layerCategories[slotId]
        delete this.categoryLoadPromises[slotId]
        if (merged.categoryStyle || merged.legendMode === 'categories') {
          this.ensureLayerCategories(slotId)
        }
        return
      }

      // Legacy: ad-hoc dynamic PNG layer keyed by GeoServer layer name
      const legacyId = layerConfig.id || geoserverLayer
      const existing = this.mapboxLayers.find(l => l.id === legacyId)
      if (existing) return

      const built = buildMapboxLayer({
        ...layerConfig,
        id: legacyId,
        url: normalizedUrl,
        format: layerConfig.format || 'image/png',
      })
      if (built) {
        this.mapboxLayers.push(built)
        this.layerVisibility[legacyId] = true

        const hasConfig = this.layersConfig.some(cfg => cfg.id === legacyId)
        if (!hasConfig) {
          this.layersConfig.push({
            id: legacyId,
            url: layerConfig.url,
            layer: geoserverLayer,
            name: layerConfig.name || legacyId,
            dynamic: true,
          })
        }
      }
    },

    removeDynamicLayer (layerId) {
      if (!layerId) return

      const isDeclaredSlot = this.staticLayerIds.includes(layerId)
        && this.layersConfig.some(cfg => cfg.id === layerId && cfg.dynamic === true)

      this.mapboxLayers = this.mapboxLayers.filter(l => l.id !== layerId)
      delete this.layerCategories[layerId]
      delete this.categoryLoadPromises[layerId]

      if (isDeclaredSlot) {
        const baseSlot = layersConfig.find(cfg => cfg.id === layerId)
        const idx = this.layersConfig.findIndex(cfg => cfg.id === layerId)
        if (idx >= 0 && baseSlot) {
          this.layersConfig[idx] = { ...baseSlot }
        }
        return
      }

      delete this.layerVisibility[layerId]
      this.layersConfig = this.layersConfig.filter(
        cfg => !(cfg.id === layerId && cfg.dynamic === true),
      )
    },

    /**
     * Removes runtime layers. Declared dynamic slots are reset to placeholders.
     */
    clearDynamicLayers () {
      const declaredSlotIds = new Set(
        layersConfig.filter(cfg => cfg.dynamic === true).map(cfg => cfg.id),
      )
      const staticNonSlotIds = new Set(
        layersConfig.filter(cfg => cfg.dynamic !== true).map(cfg => cfg.id),
      )

      this.mapboxLayers = this.mapboxLayers.filter(layer => {
        const baseId = layer.id.endsWith('_raster')
          ? layer.id.replace('_raster', '')
          : layer.id
        if (declaredSlotIds.has(baseId)) {
          delete this.layerVisibility[layer.id]
          delete this.layerCategories[baseId]
          delete this.categoryLoadPromises[baseId]
          return false
        }
        if (!staticNonSlotIds.has(baseId)) {
          delete this.layerVisibility[layer.id]
          return false
        }
        return true
      })

      this.layersConfig = layersConfig.map(cfg => ({ ...cfg }))
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
      this.clearCommittedSelection()
      this.clearActiveRegion()
      this.clearHoveredFeature()
    },
  },
})

function buildLiveCategoryStyle (state, layerId) {
  const layerConfig = state.layersConfig.find(cfg => cfg.id === layerId)
  if (!layerConfig?.categoryStyle) return null

  const categories = state.layerCategories[layerId]
  const dimMode = state.layerDimMode[layerId]
  const selectedKeys = dimMode ? (state.layerFilterSelection[layerId] ?? null) : null
  const filterConfig = dimMode ? state.layerFilterConfig[layerId] : null

  return buildLiveCategoryPaint(layerConfig, categories, {
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
