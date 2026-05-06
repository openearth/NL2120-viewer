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
      >
        <v-card
          v-for="layer in visibleLayers"
          :key="layer.id"
          class="legend-item-card mb-2"
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
              class="pa-3 pt-2"
            >
              <img
                v-if="!failedImageIds.has(layer.id)"
                class="legend-image"
                :src="legendUrl(layer)"
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
  import navigationConfig from '@/config/workflow.json'

  const mapStore = useMapStore()
  const failedImageIds = ref(new Set())
  const showLegend = ref(true)
  const expandedLayers = ref(new Set())
  
  const visibleLayers = computed(() => mapStore.visibleLayersWithConfig)
  const hasVisibleLayers = computed(() => visibleLayers.value.length > 0)
  
  watch(hasVisibleLayers, (newValue) => {
    if (newValue) {
      showLegend.value = true
      visibleLayers.value.forEach(layer => {
        expandedLayers.value.add(layer.id)
      })
    }
  })
  
  watch(visibleLayers, (newLayers, oldLayers) => {
    const oldIds = new Set(oldLayers?.map(l => l.id) || [])
    newLayers.forEach(layer => {
      if (!oldIds.has(layer.id)) {
        expandedLayers.value.add(layer.id)
      }
    })
    const newIds = new Set(newLayers.map(l => l.id))
    expandedLayers.value.forEach(id => {
      if (!newIds.has(id)) {
        expandedLayers.value.delete(id)
      }
    })
  })

  function getLayerNameFromNavigation (layerId) {
    for (const step of navigationConfig.steps) {
      if (step.components) {
        for (const component of step.components) {
          if (component.component === 'LayerList' && component.componentProps?.layers) {
            const layer = component.componentProps.layers.find(l => l.id === layerId)
            if (layer) {
              return layer.name
            }
          }
        }
      }
    }
    return null
  }

  function getLayerName (layerId) {
    const navName = getLayerNameFromNavigation(layerId)
    if (navName) {
      return navName
    }
    
    const layer = visibleLayers.value.find(l => l.id === layerId)
    return layer?.name || layerId
  }

  function legendUrl (layer) {
    return buildLegendUrl(layer)
  }

  function toggleLegend () {
    showLegend.value = !showLegend.value
  }

  function toggleLayerLegend (layerId) {
    if (expandedLayers.value.has(layerId)) {
      expandedLayers.value.delete(layerId)
    } else {
      expandedLayers.value.add(layerId)
    }
  }

  function isLayerExpanded (layerId) {
    return expandedLayers.value.has(layerId)
  }

  function onImageError (layerId) {
    failedImageIds.value.add(layerId)
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
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
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
