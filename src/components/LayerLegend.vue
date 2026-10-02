<template>
  <div
    v-if="hasVisibleLayers"
    class="layer-legend-container"
  >
    <v-badge
      :content="visibleLayers.length"
      :model-value="true"
      color="primary"
      overlap
    >
      <v-btn
        class="legend-button"
        icon="mdi-map-legend"
        size="large"
        elevation="4"
        @click="toggleLegend"
      />
    </v-badge>

    <v-expand-transition>
      <div
        v-show="showLegend"
        class="legend-panel"
        :class="`legend-panel--${legendStack}`"
      >
        <v-card
          v-for="layer in visibleLayers"
          :key="layer.id"
          class="legend-item-card"
          :class="{ 'mb-2': legendStack === 'vertical' }"
          elevation="2"
          rounded="xl"
          :max-width="layer.legendCardMaxWidth ?? LEGEND_UI_DEFAULTS.cardMaxWidth"
        >
          <v-card-title
            class="d-flex justify-space-between align-center pa-3 cursor-pointer legend-item-card__header"
            @click="toggleLayerLegend(layer.id)"
          >
            <span class="text-body-2 font-weight-medium legend-item-card__title">
              {{ getLayerName(layer.id) }}
            </span>
            <v-icon
              class="legend-chevron"
              :class="{ 'legend-chevron--active': isLayerExpanded(layer.id) }"
            >
              mdi-chevron-down
            </v-icon>
          </v-card-title>

          <v-expand-transition>
            <v-card-text
              v-show="isLayerExpanded(layer.id)"
              class="pa-3 pt-2 legend-item-body legend-card-body"
              :class="{ 'legend-card-body--dense': isDenseLegendLayout(layer) }"
              :style="legendBodyStyle(layer)"
            >
              <div
                v-if="usesHtmlCategoryLegend(layer)"
                class="legend-categories"
              >
                <div
                  v-for="row in getCategoryRows(layer.id)"
                  :key="row.value === '' ? '__empty__' : row.value"
                  class="legend-category-row"
                  :class="{ 'legend-category-row--dimmed': row.dimmed }"
                >
                  <span
                    class="legend-category-swatch"
                    :class="{ 'legend-category-swatch--square': layer.legendSwatch === 'square' || isFillLegend(layer) }"
                    :style="{ backgroundColor: row.color }"
                  />
                  <span class="legend-category-label">{{ row.label || row.value }}</span>
                </div>
                <div
                  v-if="getCategoryRows(layer.id).length === 0"
                  class="text-caption text-medium-emphasis"
                >
                  Loading…
                </div>
              </div>
              <img
                v-else-if="!failedImageIds.has(layer.id)"
                class="legend-image"
                :src="buildLegendUrl(layer)"
                :alt="`${ getLayerName(layer.id) } legend`"
                loading="lazy"
                @error="onImageError(layer.id)"
              >
            </v-card-text>
          </v-expand-transition>
        </v-card>
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { useMapStore } from '@/stores/map'
  import buildLegendUrl, { LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON } from '@/lib/build-legend-url'
  import { findWorkflowLayer } from '@/lib/find-workflow-layer'
  import { isDenseLegendLayout, LEGEND_UI_DEFAULTS } from '@/lib/legend-config'
  import navigationConfig from '@/config/workflow.json'

  const mapStore = useMapStore()
  const failedImageIds = ref(new Set())
  const showLegend = ref(true)
  const expandedLayers = ref(new Set())

  const legendStack = computed(() => {
    return navigationConfig.legendStack === 'horizontal' ? 'horizontal' : 'vertical'
  })

  const visibleLayers = computed(() => mapStore.visibleLayersWithConfig)
  const hasVisibleLayers = computed(() => visibleLayers.value.length > 0)

  function expandLayerIfConfigured (layer, targetSet) {
    if (layer.legendExpanded !== false) {
      targetSet.add(layer.id)
    }
  }

  watch(hasVisibleLayers, (newValue) => {
    if (!newValue) return
    showLegend.value = true
    const next = new Set(expandedLayers.value)
    visibleLayers.value.forEach(layer => expandLayerIfConfigured(layer, next))
    expandedLayers.value = next
  })

  watch(visibleLayers, (newLayers, oldLayers) => {
    const next = new Set(expandedLayers.value)
    const oldIds = new Set(oldLayers?.map(l => l.id) || [])
    newLayers.forEach(layer => {
      if (!oldIds.has(layer.id)) {
        expandLayerIfConfigured(layer, next)
      }
      if (layer.legendMode === 'categories') {
        mapStore.ensureLayerCategories(layer.id)
      }
    })
    const newIds = new Set(newLayers.map(l => l.id))
    next.forEach(id => {
      if (!newIds.has(id)) {
        next.delete(id)
      }
    })
    expandedLayers.value = next
  }, { immediate: true })

  function getLayerName (layerId) {
    return findWorkflowLayer(layerId)?.name
      || visibleLayers.value.find(l => l.id === layerId)?.name
      || layerId
  }

  function getCategoryRows (layerId) {
    return mapStore.getLayerCategoryRows(layerId)
  }

  /** Prefer HTML category rows; fall back to PNG if JSON legend fetch failed. */
  function usesHtmlCategoryLegend (layer) {
    if (layer.legendMode !== 'categories') return false
    const data = mapStore.layerCategories[layer.id]
    if (
      layer.legendSource === LEGEND_SOURCE_GET_LEGEND_GRAPHIC_JSON
      && data?.error
    ) {
      return false
    }
    return true
  }

  function isFillLegend (layer) {
    const cfg = mapStore.layersConfig.find(c => c.id === layer.id)
    return cfg?.vectorType === 'fill' || cfg?.categoryStyle?.geometry === 'fill'
  }

  function legendBodyStyle (layer) {
    if (layer.legendMode === 'categories') {
      // Only cap height when configured (long class lists); omit for short legends.
      if (layer.legendBodyMaxHeight == null) return undefined
      return { maxHeight: `${ layer.legendBodyMaxHeight }px` }
    }
    const maxHeight = layer.legendBodyMaxHeight ?? LEGEND_UI_DEFAULTS.bodyMaxHeight
    return { maxHeight: `${ maxHeight }px` }
  }

  function toggleLegend () {
    showLegend.value = !showLegend.value
  }

  function toggleLayerLegend (layerId) {
    const next = new Set(expandedLayers.value)
    if (next.has(layerId)) {
      next.delete(layerId)
    } else {
      next.add(layerId)
    }
    expandedLayers.value = next
  }

  function isLayerExpanded (layerId) {
    return expandedLayers.value.has(layerId)
  }

  function onImageError (layerId) {
    const next = new Set(failedImageIds.value)
    next.add(layerId)
    failedImageIds.value = next
  }
</script>

<style scoped>
.layer-legend-container {
  position: absolute;
  bottom: 24px;
  right: 58px;
  z-index: 2;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-end;
  gap: 12px;
  /* Transparent gaps must not block map pan/zoom (same pattern as FeatureInfoPanel) */
  pointer-events: none;
}

.legend-button,
.legend-item-card {
  pointer-events: auto;
}

.legend-panel {
  display: flex;
  align-items: flex-end;
  /* Padding keeps elevation shadows inside the overflow box (otherwise they look cropped) */
  padding: 8px;
  margin: -8px;
  pointer-events: none;
}

.legend-panel--vertical {
  flex-direction: column;
  max-height: calc(100vh - 200px);
  overflow-x: hidden;
  overflow-y: auto;
}

.legend-panel--horizontal {
  flex-direction: row-reverse;
  flex-wrap: nowrap;
  gap: 12px;
  max-width: calc(100vw - 120px);
  max-height: min(45vh, 360px);
  overflow-x: auto;
  overflow-y: hidden;
}

.legend-panel--horizontal .legend-item-card {
  flex: 0 0 auto;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.legend-panel--horizontal .legend-item-body {
  overflow-y: auto;
  min-height: 0;
}

.legend-item-card__header {
  user-select: none;
}

.legend-item-card__title {
  line-height: 1.3;
  padding-right: 4px;
}

.legend-chevron {
  flex-shrink: 0;
  transform: rotate(-180deg);
  transition: transform 0.4s;
}

.legend-chevron--active {
  transform: rotate(0deg);
}

.legend-card-body {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.legend-card-body--dense .legend-image {
  max-width: none;
  width: max-content;
}

.legend-image {
  max-width: 100%;
  height: auto;
  display: block;
}

.legend-categories {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-category-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-category-row--dimmed .legend-category-label {
  opacity: 0.45;
}

.legend-category-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.legend-category-swatch--square {
  border-radius: 2px;
}

.legend-category-label {
  font-size: 0.8125rem;
  line-height: 1.2;
}
</style>
