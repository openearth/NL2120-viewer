import { defineStore } from 'pinia'
import area from '@turf/area'
import layersConfig from '@/config/base-layers-config.json'
import buildMapboxLayer from '@/lib/build-mapbox-layer'
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

export const useMapStore = defineStore('map', {
  state: () => ({
    layersConfig,
    staticLayerIds: layersConfig.map(cfg => cfg.id),
    mapboxLayers: [],
    layerVisibility: {},
    layerClickableByStep: {},
    activeRegion: null,
    activeRegionId: null,
  }),
  
  getters: {
    visibleMapboxLayers: (state) => {
      const visible = []
      for (const layer of state.mapboxLayers) {
        if (state.layerVisibility[layer.id] === true) {
          visible.push(layer)
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
          if (layerConfig && layerConfig.url && layerConfig.layer) {
            visible.push({
              id: layerId,
              url: layerConfig.url,
              layer: layerConfig.layer,
              name: layerConfig.name,
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
      this.layerClickableByStep = {}
      this.clearActiveRegion()
    },
  },
})
