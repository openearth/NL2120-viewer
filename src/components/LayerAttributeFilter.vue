<template>
  <flash-highlight
    :enabled="isReady"
    :flash-when-enabled="flashWhenEnabled"
  >
    <v-card
      variant="flat"
      rounded="xl"
      class="bg-grey-lighten-3 px-3 py-0 mx-3 my-1 attribute-filter-card"
    >
      <v-card-title class="d-flex justify-space-between align-center card-title-compact filter-title-sticky">
        {{ title }}
      </v-card-title>

      <v-card-text class="pa-0 filter-scroll-content">
        <div
          v-if="isLoading"
          class="text-caption text-medium-emphasis"
        >
          Loading filter options...
        </div>
        <div
          v-else-if="errorMessage"
          class="text-caption text-error"
        >
          {{ errorMessage }}
        </div>
        <div
          v-else-if="options.length === 0"
          class="text-caption text-medium-emphasis"
        >
          No filter options found.
        </div>
        <v-list
          v-else
          density="compact"
          class="pa-0"
        >
          <v-list-item
            v-for="option in options"
            :key="option.value"
            class="px-0 filter-item"
          >
            <template #prepend>
              <v-checkbox
                :model-value="selectedValues.includes(option.value)"
                density="compact"
                hide-details
                color="primary"
                class="mr-2"
                @update:model-value="toggleValue(option.value, $event)"
              />
            </template>
            <v-list-item-title class="text-caption filter-item-title">
              {{ option.value }} ({{ option.count }})
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </flash-highlight>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useMapStore } from '@/stores/map'
  import FlashHighlight from '@/components/FlashHighlight.vue'

  const props = defineProps({
    layerId: { type: String, required: true },
    title: { type: String, default: 'Filter' },
    attributeKey: { type: String, required: true },
    wfsUrl: { type: String, required: true },
    delimiter: { type: String, default: ';' },
    flashWhenEnabled: { type: Boolean, default: false },
  })

  const mapStore = useMapStore()
  const isLoading = ref(false)
  const errorMessage = ref('')
  const options = ref([])
  const selectedValues = ref([])

  const isReady = computed(() => {
    return mapStore.layerVisibility[props.layerId] === true && options.value.length > 0
  })

  function parseDelimitedValues (rawValue) {
    if (typeof rawValue !== 'string' || rawValue.length === 0) return []
    return rawValue
      .split(props.delimiter)
      .map(v => v.trim())
      .filter(v => v.length > 0)
  }

  async function loadOptions () {
    isLoading.value = true
    errorMessage.value = ''
    try {
      const response = await fetch(props.wfsUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${ response.status }`)
      }
      const data = await response.json()
      const features = Array.isArray(data?.features) ? data.features : []
      const counts = new Map()

      for (const feature of features) {
        const raw = feature?.properties?.[props.attributeKey]
        const values = parseDelimitedValues(raw)
        for (const value of values) {
          counts.set(value, (counts.get(value) ?? 0) + 1)
        }
      }

      options.value = Array.from(counts.entries())
        .map(([ value, count ]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value))

      selectedValues.value = options.value.map(o => o.value)
    } catch (error) {
      console.error(`[LayerAttributeFilter] Failed to load options for ${ props.layerId }:`, error)
      errorMessage.value = 'Unable to load filter options.'
      options.value = []
      selectedValues.value = []
    } finally {
      isLoading.value = false
    }
  }

  function toggleValue (value, checked) {
    const current = new Set(selectedValues.value)
    checked ? current.add(value) : current.delete(value)
    selectedValues.value = Array.from(current)
  }

  function applyFilterToLayer () {
    const total = options.value.length
    const selected = selectedValues.value

    if (total === 0 || selected.length === total) {
      mapStore.setLayerFilter(props.layerId, null)
      return
    }

    if (selected.length === 0) {
      mapStore.setLayerFilter(props.layerId, [ '==', 1, 0 ])
      return
    }

    const conditions = selected.map(value => {
      return [ 'in', value, [ 'coalesce', [ 'get', props.attributeKey ], '' ] ]
    })

    mapStore.setLayerFilter(props.layerId, [ 'any', ...conditions ])
  }

  watch(selectedValues, applyFilterToLayer)

  onMounted(async () => {
    await loadOptions()
    applyFilterToLayer()
  })

  onBeforeUnmount(() => {
    mapStore.setLayerFilter(props.layerId, null)
  })
</script>

<style scoped>
.card-title-compact {
  font-size: 0.8rem;
  line-height: 1.2;
}

.filter-item {
  min-height: 18px;
}

.filter-item-title {
  white-space: normal;
  line-height: 1;
}

.filter-item :deep(.v-selection-control) {
  transform: scale(0.82);
  transform-origin: left center;
  margin-top: -10px;
  margin-bottom: -10px;
}

.attribute-filter-card {
  max-height: 140px;
  overflow: hidden;
}

.filter-scroll-content {
  max-height: 110px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.35) transparent;
}

.filter-scroll-content::-webkit-scrollbar {
  width: 6px;
}

.filter-scroll-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 999px;
}

.filter-scroll-content::-webkit-scrollbar-track {
  background: transparent;
}

.filter-title-sticky {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: rgb(var(--v-theme-grey-lighten-3));
}
</style>
