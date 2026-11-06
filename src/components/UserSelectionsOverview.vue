<template>
  <div
    v-if="isEnabled && rows.length > 0"
    class="user-selections-overview"
    :style="panelStyle"
  >
    <v-card
      class="user-selections-overview__card"
      elevation="2"
      rounded="xl"
    >
      <v-card-title
        class="user-selections-overview__header d-flex justify-space-between align-center cursor-pointer"
        @click="expanded = !expanded"
      >
        <span class="user-selections-overview__title">
          {{ title }}
        </span>
        <v-icon
          class="user-selections-overview__chevron"
          :class="{ 'user-selections-overview__chevron--active': expanded }"
        >
          mdi-chevron-down
        </v-icon>
      </v-card-title>

      <v-expand-transition>
        <v-card-text
          v-show="expanded"
          class="user-selections-overview__body"
        >
          <div
            v-for="row in rows"
            :key="row.id"
            class="user-selections-overview__row"
          >
            <span class="user-selections-overview__label">{{ row.label }}:</span>
            <span class="user-selections-overview__value">{{ row.displayValue }}</span>
          </div>
        </v-card-text>
      </v-expand-transition>
    </v-card>
  </div>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { storeToRefs } from 'pinia'
  import workflowConfig from '@/config/workflow.json'
  import { useAppStore } from '@/stores/app'
  import { useMapStore } from '@/stores/map'
  import { resolveOverviewRows } from '@/lib/user-selections-overview'

  const overviewConfig = workflowConfig.userSelectionsOverview || null
  const appStore = useAppStore()
  const mapStore = useMapStore()
  const { completedSteps } = storeToRefs(appStore)

  const isEnabled = computed(() => overviewConfig?.enabled === true)
  const title = computed(() => overviewConfig?.title || 'User selections')
  const expanded = ref(overviewConfig?.expandedByDefault !== false)

  const panelStyle = computed(() => {
    const width = overviewConfig?.width ?? 250
    const left = overviewConfig?.left ?? 210
    const bottom = overviewConfig?.bottom ?? 24
    return {
      width: typeof width === 'number' ? `${ width }px` : width,
      left: typeof left === 'number' ? `${ left }px` : left,
      bottom: typeof bottom === 'number' ? `${ bottom }px` : bottom,
    }
  })

  const rows = computed(() => {
    if (!isEnabled.value) return []
    return resolveOverviewRows(
      overviewConfig,
      { payload: {}, stores: { app: appStore, map: mapStore } },
      {
        completedSteps: completedSteps.value,
        config: workflowConfig,
      },
    )
  })
</script>

<style scoped>
.user-selections-overview {
  /* Same left column as SubMenu */
  position: fixed;
  z-index: 1005;
  pointer-events: none;
  max-height: min(40vh, 320px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.user-selections-overview__card {
  pointer-events: auto;
  max-height: min(40vh, 320px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-selections-overview__header {
  user-select: none;
  padding: 12px 12px 12px 16px !important;
  flex-shrink: 0;
}

.user-selections-overview__title {
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.3;
  padding-right: 4px;
}

.user-selections-overview__chevron {
  flex-shrink: 0;
  transform: rotate(-180deg);
  transition: transform 0.4s;
}

.user-selections-overview__chevron--active {
  transform: rotate(0deg);
}

.user-selections-overview__body {
  padding: 0 16px 14px !important;
  overflow-y: auto;
  min-height: 0;
}

.user-selections-overview__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.35em;
  font-size: 0.8125rem;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
  margin-top: 6px;
}

.user-selections-overview__row:first-child {
  margin-top: 0;
}

.user-selections-overview__label {
  font-weight: 700;
}

.user-selections-overview__value {
  color: rgba(var(--v-theme-on-surface), 0.75);
}
</style>
