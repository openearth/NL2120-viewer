<template>
  <div class="selection-list pa-4">
    <flash-highlight
      :enabled="needsSelectionInteraction"
      :flash-when-enabled="flashWhenEnabled"
    >
      <v-select
        v-model="model"
        :items="filteredOptions"
        :label="label"
        item-title="name"
        item-value="id"
        variant="outlined"
        density="compact"
        clearable
        hide-details
        :disabled="isDisabledByCondition"
      />
    </flash-highlight>
    <v-btn
      v-if="confirmSelection"
      class="mt-3"
      color="primary"
      variant="tonal"
      block
      size="small"
      :disabled="isDisabledByCondition || pending == null"
      @click="confirm"
    >
      {{ confirmLabel }}
    </v-btn>
  </div>
</template>

<script setup>
  import { ref, watch, onMounted, computed } from 'vue'
  import { useAppStore } from '@/stores/app'
  import FlashHighlight from '@/components/FlashHighlight.vue'

  const props = defineProps({
    label: { type: String, required: true },
    options: { type: Array, required: true },
    selectionKey: { type: String, default: null },
    conditionSource: { type: String, default: null },
    disabledUntilCondition: { type: Boolean, default: false },
    /** When true, store + step-complete only after the confirm button (dropdown is pending until then). */
    confirmSelection: { type: Boolean, default: false },
    confirmLabel: { type: String, default: 'Confirm' },
    flashWhenEnabled: { type: Boolean, default: false },
  })

  const emit = defineEmits(['step-complete'])
  const appStore = useAppStore()
  const pending = ref(null)
  const committed = ref(null)

  const model = computed({
    get: () => (props.confirmSelection ? pending.value : committed.value),
    set: (v) => {
      if (props.confirmSelection) {
        pending.value = v
      } else {
        committed.value = v
      }
    },
  })

  const filteredOptions = computed(() => {
    if (!props.conditionSource) {
      return props.options
    }
    const raw = appStore.selections[props.conditionSource]
    const selectedId = raw != null && typeof raw === 'object' && 'id' in raw ? raw.id : raw
    return props.options.filter(option => !option.condition || option.condition === selectedId)
  })

  const conditionSourceSelected = computed(() => {
    if (!props.conditionSource) return true
    const raw = appStore.selections[props.conditionSource]
    const selectedId = raw != null && typeof raw === 'object' && 'id' in raw ? raw.id : raw
    return selectedId != null
  })

  const isDisabledByCondition = computed(() => {
    return props.disabledUntilCondition && !conditionSourceSelected.value
  })

  const isSelectable = computed(() => filteredOptions.value.length > 0)
  const needsSelectionInteraction = computed(() => {
    if (!isSelectable.value || isDisabledByCondition.value) return false
    return props.confirmSelection ? pending.value == null : committed.value == null
  })

  function selectionToStore (value) {
    if (!props.selectionKey || value == null) return
    const option = props.options.find(o => o.id === value)
    const toStore =
      option && option.layerName != null
        ? {
          id: option.id,
          layerName: option.layerName,
          ...(option.regionIdProperty != null && { regionIdProperty: option.regionIdProperty }),
          ...(option.layerNameForProcess != null && { layerNameForProcess: option.layerNameForProcess }),
        }
        : value
    appStore.setSelection(props.selectionKey, toStore)
  }

  function confirm () {
    if (pending.value == null) return
    committed.value = pending.value
    selectionToStore(committed.value)
    emit('step-complete', { value: committed.value })
  }

  onMounted(() => {
    if (!props.selectionKey || appStore.selections[props.selectionKey] == null) return
    const stored = appStore.selections[props.selectionKey]
    const id = typeof stored === 'object' && stored?.id != null ? stored.id : stored
    committed.value = id
    if (props.confirmSelection) {
      pending.value = id
    }
  })

  watch(committed, (value) => {
    if (props.confirmSelection) return
    selectionToStore(value)
    if (value != null) {
      emit('step-complete', { value })
    }
  })

  // Keep state consistent when a dependency changes and current value becomes invalid.
  watch(filteredOptions, (nextOptions) => {
    const allowedIds = new Set(nextOptions.map(o => o.id))
    if (committed.value != null && !allowedIds.has(committed.value)) {
      committed.value = null
      if (props.selectionKey) {
        appStore.setSelection(props.selectionKey, null)
      }
    }
    if (props.confirmSelection && pending.value != null && !allowedIds.has(pending.value)) {
      pending.value = null
    }
  }, { immediate: true })
</script>
