<template>
  <v-navigation-drawer
    class="custom-navigation-drawer"
    width="200"
  >
    <div class="drawer-content">
      <div>
        <v-list-item class="d-flex justify-center align-center pa-5">
          <v-img
            :src="config.logo"
            alt="DesirMED Logo"
            width="80px"
          />
        </v-list-item>
        <v-list-item
          v-for="step in config.steps"
          :key="step.id"
          :title="step.title"
          :disabled="isStepDisabled(step)"
          :class="{ 'step-locked': isStepDisabled(step) }"
          @click="handleStepClick(step)"
        />
      </div>

      <div
        v-if="showRestart"
        class="restart-wrapper"
      >
        <v-btn
          color="primary"
          variant="tonal"
          block
          size="small"
          prepend-icon="mdi-restart"
          :loading="isRestarting"
          :disabled="isRestarting"
          @click="onRestart"
        >
          Restart
        </v-btn>
      </div>
    </div>
  </v-navigation-drawer>

  <sub-menu
    v-for="step in config.steps"
    :key="step.id"
    :menu-id="step.id"
    :drawer-title="step.drawerTitle"
    :components="step.components"
    :completion-event="step.completionEvent"
    :requires-confirmation="step.requiresConfirmation || false"
    :confirmation-source="step.confirmationSource || 'component'"
    :explanation="step.explanation || ''"
    :explanation-flash-when-available="step.explanationFlashWhenAvailable || false"
    :confirm-flash-when-enabled="step.confirmFlashWhenEnabled || false"
    :required-selections="step.requiredSelections || []"
    :process="step.process || null"
  />
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { useMapStore } from '@/stores/map'
  import SubMenu from '@/components/SubMenu.vue'
  import config from '@/config/workflow.json'
  import { executeProcessConfig } from '@/lib/ogc-process/execute-config'

  const store = useAppStore()
  const mapStore = useMapStore()
  const isRestarting = ref(false)

  const firstStep = computed(() => config.steps?.[0] ?? null)
  const restartEnabled = computed(() => config.initialSetup?.restartButton === true)
  const showRestart = computed(() => {
    if (!restartEnabled.value) return false
    if (!firstStep.value) return false
    return store.isStepCompleted(firstStep.value.id)
  })

  function handleStepClick (step) {
    if (isStepDisabled(step)) return
    store.toggleMenu(step.id)
  }

  function isStepDisabled (step) {
    if (!store.isStepAvailable(step)) return true
    const disableAfterContinue =
      step.disabledOnContinue === true &&
      store.isStepCompleted(step.id) &&
      store.activeMenu !== step.id
    return disableAfterContinue
  }

  async function onRestart () {
    if (isRestarting.value) return
    isRestarting.value = true
    try {
      store.resetWorkflowState()
      mapStore.resetWorkflowState()

      const process = config.initialSetup?.process
      if (process?.trigger === 'onStart') {
        await executeProcessConfig(process, {
          payload: {},
          appStore: store,
          mapStore,
        })
      }

      if (firstStep.value) {
        store.toggleMenu(firstStep.value.id)
      }
    } catch (error) {
      console.error('Restart failed:', error)
    } finally {
      isRestarting.value = false
    }
  }
</script>

<style scoped>
.custom-navigation-drawer {
  max-height: calc(100% - 50px * 2);
  margin-top: 50px;
  margin-left: 10px;
  border-radius: 28px;
}

.drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.restart-wrapper {
  padding: 10px 12px 14px;
}

.step-locked {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
