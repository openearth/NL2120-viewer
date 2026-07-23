<template>
  <div
    v-if="isVisible"
    class="feature-info-panel"
  >
    <v-card
      class="feature-info-panel__card"
      elevation="4"
      rounded="xl"
    >
      <v-card-title class="feature-info-panel__header">
        <span class="feature-info-panel__header-title">
          {{ panelConfig.title }}
        </span>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          density="compact"
          aria-label="Close"
          @click="close"
        />
      </v-card-title>

      <v-card-text class="feature-info-panel__body">
        <template
          v-for="(field, index) in displayFields"
          :key="`${field.attribute}-${index}`"
        >
          <v-divider
            v-if="index > 0"
            class="feature-info-panel__divider"
          />
          <div class="feature-info-panel__field">
            <div class="feature-info-panel__field-title">
              {{ field.title }}
            </div>
            <div class="feature-info-panel__field-value">
              <a
                v-if="field.href"
                :href="field.href"
                target="_blank"
                rel="noopener noreferrer"
                class="feature-info-panel__link"
              >
                {{ field.displayValue }}
              </a>
              <template v-else>
                {{ field.displayValue }}
              </template>
            </div>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { useMapStore } from '@/stores/map'
  import { findWorkflowLayer } from '@/lib/find-workflow-layer'

  const mapStore = useMapStore()

  function isBlank (value) {
    if (value == null) return true
    if (typeof value === 'string') return value.trim().length === 0
    return false
  }

  function toDisplayString (value) {
    return typeof value === 'string' ? value.trim() : String(value)
  }

  function toHref (value) {
    const text = toDisplayString(value)
    if (/^https?:\/\//i.test(text)) return text
    if (/^www\./i.test(text)) return `https://${ text }`
    return null
  }

  const panelConfig = computed(() => {
    return findWorkflowLayer(mapStore.activeRegion?.layerId)?.featureInfo ?? null
  })

  const isVisible = computed(() => {
    return Boolean(mapStore.activeRegion && panelConfig.value?.fields?.length)
  })

  const displayFields = computed(() => {
    const config = panelConfig.value
    const properties = mapStore.activeRegion?.properties
    if (!config?.fields?.length || !properties) return []

    const globalEmpty = config.emptyValue ?? '—'

    return config.fields.map(field => {
      const raw = properties[field.attribute]
      const blank = isBlank(raw)
      return {
        attribute: field.attribute,
        title: field.title,
        displayValue: blank ? (field.emptyValue ?? globalEmpty) : toDisplayString(raw),
        href: blank ? null : toHref(raw),
      }
    })
  })

  function close () {
    mapStore.clearActiveRegion()
  }
</script>

<style scoped>
.feature-info-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 2;
  width: min(360px, calc(100vw - 48px));
  pointer-events: none;
}

.feature-info-panel__card {
  pointer-events: auto;
  max-height: min(70vh, 520px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.feature-info-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 8px 16px;
  flex-shrink: 0;
}

.feature-info-panel__header-title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  white-space: normal;
}

.feature-info-panel__body {
  padding: 4px 16px 16px !important;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
}

.feature-info-panel__field-title {
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 4px;
}

.feature-info-panel__field-value {
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.feature-info-panel__divider {
  margin: 12px 0;
  opacity: 0.35;
}

.feature-info-panel__link {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  word-break: break-all;
}
</style>
