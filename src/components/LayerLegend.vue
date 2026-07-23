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
          max-width="300"
        >
          <v-card-title
            class="d-flex justify-space-between align-center pa-3 cursor-pointer"
            style="user-select: none;"
            @click="toggleLayerLegend(layer.id)"
          >
            <span class="text-body-2 font-weight-medium">
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
              class="pa-3 pt-2 legend-item-body"
            >
              <img
                v-if="!failedImageIds.has(layer.id)"
                class="legend-image"
                :src="buildLegendUrl(layer)"
                alt=""
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
  import buildLegendUrl from '@/lib/build-legend-url'
  import { findWorkflowLayer } from '@/lib/find-workflow-layer'
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

  watch(hasVisibleLayers, (newValue) => {
    if (newValue) {
      showLegend.value = true
      const next = new Set(expandedLayers.value)
      visibleLayers.value.forEach(layer => next.add(layer.id))
      expandedLayers.value = next
    }
  })

  watch(visibleLayers, (newLayers, oldLayers) => {
    const next = new Set(expandedLayers.value)
    const oldIds = new Set(oldLayers?.map(l => l.id) || [])
    newLayers.forEach(layer => {
      if (!oldIds.has(layer.id)) {
        next.add(layer.id)
      }
    })
    const newIds = new Set(newLayers.map(l => l.id))
    next.forEach(id => {
      if (!newIds.has(id)) {
        next.delete(id)
      }
    })
    expandedLayers.value = next
  })

  function getLayerName (layerId) {
    return findWorkflowLayer(layerId)?.name
      || visibleLayers.value.find(l => l.id === layerId)?.name
      || layerId
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
}

.legend-panel {
  display: flex;
  align-items: flex-end;
  /* Padding keeps elevation shadows inside the overflow box (otherwise they look cropped) */
  padding: 8px;
  margin: -8px;
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

.legend-chevron {
  transform: rotate(-180deg);
  transition: transform 0.4s;
}

.legend-chevron--active {
  transform: rotate(0deg);
}

.legend-image {
  max-width: 100%;
  display: block;
}
</style>
