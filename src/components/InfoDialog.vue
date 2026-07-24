<template>
  <v-dialog
    v-if="isFeatureEnabled"
    v-model="isOpen"
    class="info-dialog"
    :width="dialogWidth"
    :scrim="true"
    retain-focus
    @update:model-value="onOpenChange"
  >
    <v-card
      class="info-dialog__card"
      rounded="xl"
      :style="{ height: dialogHeight }"
    >
      <v-card-title class="info-dialog__header">
        <span class="info-dialog__title">{{ title }}</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          aria-label="Sluiten"
          @click="closeAndRemember"
        />
      </v-card-title>

      <v-card-text class="info-dialog__body">
        <!-- Markdown is project-authored config content -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          class="info-dialog__markdown"
          v-html="htmlContent"
        />
      </v-card-text>

      <v-card-actions class="info-dialog__actions">
        <v-spacer />
        <v-btn
          color="primary"
          variant="tonal"
          @click="closeAndRemember"
        >
          {{ closeLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
  import { computed, onMounted } from 'vue'
  import { marked } from 'marked'
  import workflowConfig from '@/config/workflow.json'
  import { useAppStore } from '@/stores/app'

  const DEFAULT_STORAGE_KEY = 'nl2120-viewer:info-dialog-seen'

  marked.use({
    renderer: {
      link ({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens)
        const titleAttr = title ? ` title="${ title }"` : ''
        return `<a href="${ href }" target="_blank" rel="noopener noreferrer"${ titleAttr }>${ text }</a>`
      },
    },
  })

  const appStore = useAppStore()

  const mdModules = import.meta.glob('@/config/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  const config = computed(() => workflowConfig.infoDialog ?? null)
  const isFeatureEnabled = computed(() => config.value?.enabled === true)

  const title = computed(() => config.value?.title || 'Informatie')
  const closeLabel = computed(() => config.value?.closeLabel || 'Sluiten')
  const dialogWidth = computed(() => config.value?.width || '50vw')
  const dialogHeight = computed(() => config.value?.height || '70vh')
  const remember = computed(() => config.value?.remember || 'local')
  const storageKey = computed(() => config.value?.storageKey || DEFAULT_STORAGE_KEY)

  const markdownSource = computed(() => {
    const fileName = config.value?.contentFile || 'info-dialog.md'
    const key = Object.keys(mdModules).find(path => path.endsWith(`/${ fileName }`))
    return key ? mdModules[key] : ''
  })

  const htmlContent = computed(() => {
    if (!markdownSource.value) return ''
    return marked.parse(markdownSource.value, { async: false })
  })

  const isOpen = computed({
    get: () => appStore.infoDialogOpen,
    set: (value) => {
      if (value) {
        appStore.openInfoDialog()
      } else {
        appStore.closeInfoDialog()
      }
    },
  })

  function getRememberStorage (mode) {
    return mode === 'session' ? sessionStorage : localStorage
  }

  function hasSeenInfoDialog (key, mode) {
    if (mode === 'always') return false
    try {
      return getRememberStorage(mode).getItem(key) === '1'
    } catch {
      return false
    }
  }

  function markInfoDialogSeen (key, mode) {
    if (mode === 'always') return
    try {
      getRememberStorage(mode).setItem(key, '1')
    } catch {
      // Storage may be unavailable (private mode); ignore
    }
  }

  function closeAndRemember () {
    markInfoDialogSeen(storageKey.value, remember.value)
    appStore.closeInfoDialog()
  }

  function onOpenChange (value) {
    if (!value) {
      markInfoDialogSeen(storageKey.value, remember.value)
    }
  }

  onMounted(() => {
    if (!isFeatureEnabled.value) return
    if (config.value?.showOnStart !== true) return
    if (hasSeenInfoDialog(storageKey.value, remember.value)) return
    appStore.openInfoDialog()
  })
</script>

<style scoped>
.info-dialog__card {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  overflow: hidden;
}

.info-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding: 16px 16px 8px 20px;
}

.info-dialog__title {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  white-space: normal;
}

.info-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 20px 12px !important;
}

.info-dialog__actions {
  flex-shrink: 0;
  padding: 8px 16px 16px;
}

.info-dialog__markdown {
  font-size: 0.95rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.info-dialog__markdown :deep(p) {
  margin: 0 0 1rem;
}

.info-dialog__markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.info-dialog__markdown :deep(a) {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  word-break: break-word;
}
</style>

<!-- Unscoped: v-dialog teleports the overlay outside this component -->
<style>
.v-overlay.info-dialog .v-overlay__scrim,
.v-overlay:has(.info-dialog) .v-overlay__scrim {
  opacity: 1 !important;
  background: rgba(255, 255, 255, 0.10) !important;
  backdrop-filter: blur(6px) saturate(120%);
  -webkit-backdrop-filter: blur(6px) saturate(120%);
}
</style>
