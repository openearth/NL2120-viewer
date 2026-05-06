<template>
  <v-navigation-drawer
    v-if="isOpen"
    v-model="isOpen"
    class="sub-menu-drawer"
    width="250"
  >
    <div class="sub-menu-drawer__inner">
      <v-list-item class="sub-menu-drawer__header">
        <v-list-item-title class="font-weight-bold drawer-title">
          {{ drawerTitle }}
        </v-list-item-title>
        <template #append>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            style="margin-top: 10px;"
            @click="isOpen = false"
          />
        </template>
      </v-list-item>

      <div class="sub-menu-drawer__content">
        <component
          :is="comp.component"
          v-for="(comp, index) in validComponents"
          :key="index"
          v-bind="comp.props"
          @step-complete="onChildStepComplete"
          @step-ready="onStepReady"
          @run-process="onRunProcess"
        />
      </div>

      <div class="sub-menu-drawer__footer">
        <flash-highlight
          v-if="props.explanation"
          :enabled="isOpen && shouldPromptExplanation"
          :flash-when-enabled="props.explanationFlashWhenAvailable"
        >
          <p class="sub-menu-drawer__explanation text-body-2 text-medium-emphasis">
            {{ props.explanation }}
          </p>
        </flash-highlight>
        <flash-highlight
          v-if="props.requiresConfirmation"
          :enabled="isOpen && !confirmButtonDisabled"
          :flash-when-enabled="props.confirmFlashWhenEnabled"
        >
          <v-btn
            class="sub-menu-drawer__confirm"
            color="primary"
            variant="tonal"
            block
            size="small"
            :disabled="confirmButtonDisabled"
            @click="onConfirmClick"
          >
            Confirm
          </v-btn>
        </flash-highlight>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup>
  import { computed, provide, shallowRef, watch } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { useMapStore } from '@/stores/map'
  import { executeProcessConfig } from '@/lib/ogc-process/execute-config'
  import FlashHighlight from '@/components/FlashHighlight.vue'

  const props = defineProps({
    menuId: { type: String, required: true },
    drawerTitle: { type: String, required: true },
    components: { type: Array, default: () => [] },
    completionEvent: { type: String, default: null },
    requiresConfirmation: { type: Boolean, default: false },
    confirmationSource: { type: String, default: 'component' },
    explanation: { type: String, default: '' },
    explanationFlashWhenAvailable: { type: Boolean, default: false },
    confirmFlashWhenEnabled: { type: Boolean, default: false },
    /** When set, footer Confirm stays disabled until each key has a value in appStore.selections. */
    requiredSelections: { type: Array, default: () => [] },
    process: { type: Object, default: null },
  })

  const store = useAppStore()
  const mapStore = useMapStore()
  const loadedComponents = shallowRef([])
  const stepReadyPayload = shallowRef(null)
  provide('stepId', props.menuId)

  const modules = import.meta.glob('@/components/*.vue')

  const loadComponents = async () => {
    const loaded = []

    for (const compConfig of props.components) {
      if (compConfig.component) {
        const path = `/src/components/${compConfig.component}.vue`
        if (modules[path]) {
          const mod = await modules[path]()
          loaded.push({
            component: mod.default,
            props: compConfig.componentProps || {},
          })
        }
      }
    }

    loadedComponents.value = loaded
  }

  watch(() => props.components, loadComponents, { immediate: true, deep: true })

  const validComponents = computed(() => {
    return loadedComponents.value.filter(comp => comp.component)
  })

  function isSelectionMissing (value) {
    if (value == null) return true
    if (typeof value === 'string') return value === ''
    if (typeof value === 'object' && value !== null && 'id' in value) {
      return value.id == null || value.id === ''
    }
    return false
  }

  const requiredSelectionsSatisfied = computed(() => {
    const keys = props.requiredSelections
    if (!Array.isArray(keys) || keys.length === 0) return true
    return keys.every(key => !isSelectionMissing(store.selections[key]))
  })

  /** For process-driven steps, footer Confirm must wait for a successful run (payload includes `result`). */
  const confirmButtonDisabled = computed(() => {
    if (!props.requiresConfirmation) return false
    if (!requiredSelectionsSatisfied.value) return true
    const p = stepReadyPayload.value
    if (!p) return true
    if (props.confirmationSource === 'process' && props.process?.trigger === 'component') {
      return p.result == null
    }
    return false
  })

  const shouldPromptExplanation = computed(() => {
    if (!props.explanation) return false
    if (props.confirmationSource === 'mapClick') {
      return stepReadyPayload.value == null
    }
    return true
  })

  const isOpen = computed({
    get: () => store.activeMenu === props.menuId,
    set: (value) => {
      if (!value && store.activeMenu === props.menuId) {
        store.closeMenu()
        stepReadyPayload.value = null
      }
    },
  })

  // --- Step completion (independent of WPS) ---

  watch(isOpen, async (open) => {
    if (open) {
      stepReadyPayload.value = null
    }
    if (open && props.completionEvent === 'auto' && !store.isStepCompleted(props.menuId)) {
      completeStep()
    }
    if (open && props.confirmationSource === 'process' && props.process?.trigger === 'stepOpen') {
      try {
        const result = await executeProcessOnly({})
        stepReadyPayload.value = result != null ? { result } : {}
      } catch (error) {
        console.error(`Process request failed for step "${ props.menuId }" (stepOpen):`, error)
      }
    }
  })

  if (props.confirmationSource === 'mapClick') {
    watch([isOpen, () => mapStore.activeRegion], ([open, region]) => {
      if (!open) return
      stepReadyPayload.value = region ? { region } : null
    })
  }

  function completeStep () {
    if (store.isStepCompleted(props.menuId)) {
      store.resetStepsFrom(props.menuId)
    }
    store.completeStep(props.menuId)
  }

  // --- Process execution (driven by process.trigger) ---

  const processTrigger = props.process?.trigger

  if (processTrigger === 'mapClick') {
    watch(() => mapStore.activeRegion, (region) => {
      if (region && isOpen.value) {
        executeProcess()
      }
    })
  }

  async function executeProcessOnly (payload = {}) {
    if (!props.process) return null
    return executeProcessConfig(props.process, {
      payload,
      appStore: store,
      mapStore,
    })
  }

  async function executeProcess (payload = {}) {
    try {
      await executeProcessOnly(payload)
    } catch (error) {
      console.error(`Process request failed for step "${ props.menuId }":`, error)
      return
    }
    completeStep()
  }

  function onChildStepComplete (payload) {
    if (props.requiresConfirmation) {
      stepReadyPayload.value = payload || {}
    } else {
      onStepComplete(payload)
    }
  }

  function onStepReady (payload) {
    stepReadyPayload.value = payload || {}
  }

  async function onRunProcess (payload) {
    if (props.process?.trigger !== 'component') return
    try {
      const result = await executeProcessOnly(payload || {})
      stepReadyPayload.value = result != null ? { result } : {}
    } catch (error) {
      console.error(`Process request failed for step "${ props.menuId }" (run-process):`, error)
    }
  }

  async function onStepComplete (payload) {
    if (processTrigger === 'stepComplete') {
      await executeProcess(payload)
    } else {
      completeStep()
    }
  }

  async function onConfirmClick () {
    if (props.requiresConfirmation && !requiredSelectionsSatisfied.value) return
    if (props.requiresConfirmation && !stepReadyPayload.value) return
    const payload = stepReadyPayload.value || {}
    stepReadyPayload.value = null
    if (props.confirmationSource === 'process' || props.confirmationSource === 'mapClick') {
      completeStep()
      store.openNextStep(props.menuId)
      return
    }
    await onStepComplete(payload)
    store.openNextStep(props.menuId)
  }
</script>

<style scoped>
.sub-menu-drawer {
  position: absolute;
  left: 210px !important;
  height: fit-content !important;
  max-height: calc(100vh - 100px);
  margin-top: 50px;
  border-radius: 28px;
}

.sub-menu-drawer :deep(.v-navigation-drawer__content) {
  display: block;
}

.sub-menu-drawer__inner {
  display: flex;
  flex-direction: column;
}

.sub-menu-drawer__header {
  flex-shrink: 0;
}

.sub-menu-drawer__content {
  overflow-y: auto;
  max-height: min(60vh, 400px);
}

.sub-menu-drawer__footer {
  flex-shrink: 0;
  padding: 12px 16px 16px;
}

.sub-menu-drawer__explanation {
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.sub-menu-drawer__confirm {
  margin: 0;
}

.drawer-title {
  white-space: normal;
  margin-top: 10px;
}
</style>
