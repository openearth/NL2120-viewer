<template>
  <v-app>
    <navigation-drawer />
    <v-main style="padding-inline: 0">
      <router-view />
      <layer-legend />
    </v-main>
  </v-app>
</template>

<script setup>
  import { onMounted } from 'vue'
  import NavigationDrawer from '@/components/NavigationDrawer.vue'
  import LayerLegend from '@/components/LayerLegend.vue'
  import workflowConfig from '@/config/workflow.json'
  import { useAppStore } from '@/stores/app'
  import { useMapStore } from '@/stores/map'
  import { executeProcessConfig } from '@/lib/ogc-process/execute-config'

  const appStore = useAppStore()
  const mapStore = useMapStore()

  onMounted(async () => {
    const process = workflowConfig.initialSetup?.process
    if (process?.trigger === 'onStart') {
      try {
        await executeProcessConfig(process, {
          payload: {},
          appStore,
          mapStore,
        })
      } catch (error) {
        console.error('Initial setup process request failed:', error)
      }
    }

    const firstStep = workflowConfig.steps?.[0]
    if (firstStep) {
      appStore.toggleMenu(firstStep.id)
    }
  })
</script>
