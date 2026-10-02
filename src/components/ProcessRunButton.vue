<template>
  <div class="process-run-button pa-4 pt-0">
    <flash-highlight
      :enabled="needsRunHighlight"
      :flash-when-enabled="flashWhenEnabled"
    >
      <v-btn
        color="primary"
        variant="tonal"
        block
        size="small"
        :disabled="isRunDisabled"
        :loading="showButtonSpinner"
        @click="onRunClick"
      >
        {{ label }}
      </v-btn>
    </flash-highlight>
  </div>
</template>

<script setup>
  import { ref, computed, watch, inject } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { isSelectionMissing } from '@/lib/selection-utils'
  import { useProcessRunUi } from '@/lib/use-process-run-ui'
  import FlashHighlight from '@/components/FlashHighlight.vue'

  const props = defineProps({
    label: { type: String, default: 'Run process' },
    requiredSelections: { type: Array, default: () => [] },
    flashWhenEnabled: { type: Boolean, default: false },
  })

  const emit = defineEmits(['run-process'])
  const appStore = useAppStore()
  const stepId = inject('stepId', null)
  const { isProcessLoading, showButtonSpinner } = useProcessRunUi()
  const lastRunSignature = ref(null)

  const isThisStepOpen = computed(() => stepId != null && appStore.activeMenu === stepId)
  watch(isThisStepOpen, (open) => {
    if (open) lastRunSignature.value = null
  })

  const selectionSignature = computed(() => {
    const keys = props.requiredSelections
    if (!Array.isArray(keys) || keys.length === 0) return ''
    return JSON.stringify(keys.map(k => appStore.selections[k]))
  })

  const allRequiredSelected = computed(() => {
    const keys = props.requiredSelections
    if (!Array.isArray(keys) || keys.length === 0) return true
    return keys.every(key => !isSelectionMissing(appStore.selections[key]))
  })

  const isRunDisabled = computed(() =>
    !allRequiredSelected.value || isProcessLoading.value,
  )

  const needsRunHighlight = computed(() => {
    if (!props.flashWhenEnabled || isRunDisabled.value) return false
    return lastRunSignature.value !== selectionSignature.value
  })

  watch(selectionSignature, () => {
    lastRunSignature.value = null
  })

  function onRunClick () {
    if (isRunDisabled.value) return
    lastRunSignature.value = selectionSignature.value
    emit('run-process', {})
  }
</script>
