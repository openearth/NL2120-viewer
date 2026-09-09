<template>
  <v-dialog
    v-if="isFeatureEnabled"
    v-model="isOpen"
    class="info-dialog"
    :width="dialogWidth"
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
          @click="isOpen = false"
        />
      </v-card-title>

      <v-card-text class="info-dialog__body">
        <!-- eslint-disable-next-line vue/no-v-html -- content is project-authored markdown config -->
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
          @click="isOpen = false"
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

  const DEFAULT_STORAGE_KEY = 'viewer:info-dialog-seen'

  // Open markdown links in a new tab (marked default is same-tab).
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

  const config = workflowConfig.infoDialog
  const isFeatureEnabled = config?.enabled === true
  const title = config?.title || 'Informatie'
  const closeLabel = config?.closeLabel || 'Sluiten'
  const dialogWidth = config?.width || '50vw'
  const dialogHeight = config?.height || '70vh'
  const remember = config?.remember || 'local'
  const storageKey = config?.storageKey || DEFAULT_STORAGE_KEY

  const fileName = config?.contentFile || 'info-dialog.md'
  const markdownPath = Object.keys(mdModules).find(path => path.endsWith(`/${ fileName }`))
  const htmlContent = markdownPath
    ? marked.parse(mdModules[markdownPath], { async: false })
    : ''

  const isOpen = computed({
    get: () => appStore.infoDialogOpen,
    set: (value) => {
      if (value) {
        appStore.openInfoDialog()
        return
      }
      markInfoDialogSeen(storageKey, remember)
      appStore.closeInfoDialog()
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

  onMounted(() => {
    if (!isFeatureEnabled) return
    if (config?.showOnStart !== true) return
    if (hasSeenInfoDialog(storageKey, remember)) return
    appStore.openInfoDialog()
  })
</script>

<style scoped>
.info-dialog__card {
  display: flex;
  flex-direction: column;
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
.v-overlay.info-dialog .v-overlay__scrim {
  opacity: 1 !important;
  background: rgba(255, 255, 255, 0.10) !important;
  backdrop-filter: blur(6px) saturate(120%);
  -webkit-backdrop-filter: blur(6px) saturate(120%);
}
</style>
