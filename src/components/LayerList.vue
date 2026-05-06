<template>
  <div class="layer-list">
    <v-list-item class="data-layers-header text-decoration-underline text-subtitle-2">
      Data Layers
    </v-list-item>

    <template v-for="layer in filteredLayers" :key="layer.id">
      <v-list-item>
        <template #prepend>
          <v-switch
            :model-value="mapStore.layerVisibility[layer.id] ?? false"
            hide-details
            density="compact"
            color="primary"
            class="mr-4"
            @update:model-value="mapStore.setLayerVisibility(layer.id, $event)"
          />
        </template>

        <v-list-item-title class="layer-name">
          {{ layer.name }}
        </v-list-item-title>
      </v-list-item>
      <active-feature-properties
        v-if="layer.propertiesBox"
        :layer-id="layer.id"
        :properties-box-type="layer.propertiesBox"
        :flash-when-enabled="layer.flashWhenEnabled ?? false"
        class="mt-0"
      />
    </template>
  </div>
</template>

<script setup>
  import { computed, inject, onMounted, onUnmounted, watch } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { useMapStore } from '@/stores/map'
  import ActiveFeatureProperties from '@/components/ActiveFeatureProperties.vue'

  const props = defineProps({
    layers: { type: Array, required: true },
    conditionSource: { type: String, default: null },
  })

  const appStore = useAppStore()
  const mapStore = useMapStore()
  const stepId = inject('stepId', null)

  const filteredLayers = computed(() => {
    if (!props.conditionSource) {
      return props.layers
    }
    const raw = appStore.selections[props.conditionSource]
    const selectedId = raw != null && typeof raw === 'object' && 'id' in raw ? raw.id : raw
    return props.layers.filter(
      layer => !layer.condition || layer.condition === selectedId,
    )
  })

  function syncVisibilityToFilter () {
    if (!props.conditionSource) return
    const ids = new Set(filteredLayers.value.map(l => l.id))
    for (const layer of props.layers) {
      if (!ids.has(layer.id)) {
        mapStore.setLayerVisibility(layer.id, false)
      }
    }
  }

  onMounted(() => {
    mapStore.initializeLayerVisibility(props.layers)
    mapStore.registerStepClickability(stepId, props.layers)
    syncVisibilityToFilter()
  })

  onUnmounted(() => {
    mapStore.unregisterStepClickability(stepId)
  })

  watch(filteredLayers, syncVisibilityToFilter)
</script>

<style scoped>
.data-layers-header {
  justify-content: center;
  display: flex;
  margin-top: 10px;
}

.layer-name {
  white-space: normal;
}
</style>
