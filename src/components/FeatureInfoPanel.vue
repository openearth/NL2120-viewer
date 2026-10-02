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
          v-for="(block, blockIndex) in displayBlocks"
          :key="`block-${blockIndex}`"
        >
          <v-divider
            v-if="blockIndex > 0"
            class="feature-info-panel__divider"
          />

          <!-- Simple field list (legacy fields[] or sections type=fields) -->
          <template v-if="block.kind === 'fields'">
            <div
              v-for="(field, index) in block.fields"
              :key="`${field.attribute}-${index}`"
              class="feature-info-panel__field"
              :class="{ 'mt-3': index > 0 }"
            >
              <div class="feature-info-panel__field-title d-flex align-center">
                <span
                  v-if="field.swatchColor"
                  class="feature-info-panel__swatch"
                  :style="{ backgroundColor: field.swatchColor }"
                />
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

          <!-- Table section -->
          <template v-else-if="block.kind === 'table'">
            <div
              v-if="block.title"
              class="feature-info-panel__section-title"
            >
              {{ block.title }}
            </div>
            <div class="feature-info-panel__table-wrap">
              <table class="feature-info-panel__table">
                <thead>
                  <tr>
                    <th
                      v-for="col in block.columns"
                      :key="col.title"
                    >
                      {{ col.title }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, rowIndex) in block.rows"
                    :key="rowIndex"
                  >
                    <td
                      v-for="(cell, cellIndex) in row"
                      :key="cellIndex"
                    >
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="block.rows.length === 0"
              class="text-caption text-medium-emphasis mt-1"
            >
              No data for this feature.
            </div>
          </template>
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { useMapStore } from '@/stores/map'
  import { useAppStore } from '@/stores/app'
  import { findWorkflowLayer } from '@/lib/find-workflow-layer'
  import {
    expandAttributeTemplate,
    formatAttributeValue,
    isBlank,
  } from '@/lib/format-value'

  const mapStore = useMapStore()
  const appStore = useAppStore()

  const panelConfig = computed(() => {
    return findWorkflowLayer(mapStore.activeRegion?.layerId)?.featureInfo ?? null
  })

  const isVisible = computed(() => {
    const config = panelConfig.value
    if (!mapStore.activeRegion || !config) return false
    if (config.sections?.length) return true
    return Boolean(config.fields?.length)
  })

  function resolveField (fieldConfig, properties, globalEmpty) {
    const raw = properties[fieldConfig.attribute]
    const formatted = formatAttributeValue(raw, fieldConfig.format || null, {
      emptyValue: fieldConfig.emptyValue ?? globalEmpty,
    })

    let swatchColor = null
    if (fieldConfig.categorySwatch) {
      const layerId = mapStore.activeRegion?.layerId
      const colors = mapStore.layerCategories[layerId]?.colorByValue || {}
      const key = raw == null ? '' : String(raw).trim()
      swatchColor = colors[key]
        || mapStore.layersConfig.find(c => c.id === layerId)?.categoryStyle?.empty?.color
        || '#e0e0e0'
    }

    return {
      attribute: fieldConfig.attribute,
      title: fieldConfig.title,
      displayValue: formatted.displayValue,
      href: formatted.href,
      swatchColor,
    }
  }

  function buildTableSection (section, properties, globalEmpty) {
    const columns = section.columns || []
    const repeat = section.repeat
    const rows = []

    if (repeat && repeat.from != null && repeat.to != null) {
      const token = repeat.token || 'n'
      for (let i = repeat.from; i <= repeat.to; i++) {
        const hideAttrs = (section.hideRowWhenEmpty || []).map(t =>
          expandAttributeTemplate(t, token, i),
        )
        if (hideAttrs.some(attr => isBlank(properties[attr]))) {
          continue
        }

        const cells = columns.map(col => {
          const attr = expandAttributeTemplate(col.attribute, token, i)
          if (col.hideWhenMissing && isBlank(properties[attr])) {
            return globalEmpty
          }
          return formatAttributeValue(properties[attr], col.format || null, {
            emptyValue: col.emptyValue ?? globalEmpty,
          }).displayValue
        })
        rows.push(cells)
      }
    } else {
      // Single row from fixed attributes
      const hideAttrs = section.hideRowWhenEmpty || []
      if (!hideAttrs.some(attr => isBlank(properties[attr]))) {
        rows.push(columns.map(col => {
          if (col.hideWhenMissing && isBlank(properties[col.attribute])) {
            return globalEmpty
          }
          return formatAttributeValue(properties[col.attribute], col.format || null, {
            emptyValue: col.emptyValue ?? globalEmpty,
          }).displayValue
        }))
      }
    }

    return {
      kind: 'table',
      title: section.title || null,
      columns,
      rows,
    }
  }

  const displayBlocks = computed(() => {
    const config = panelConfig.value
    const properties = mapStore.activeRegion?.properties
    if (!config || !properties) return []

    const globalEmpty = config.emptyValue ?? '—'

    // New sections API
    if (Array.isArray(config.sections) && config.sections.length) {
      return config.sections.map(section => {
        if (section.type === 'table') {
          return buildTableSection(section, properties, globalEmpty)
        }
        // default: fields
        const fields = (section.fields || []).map(field =>
          resolveField(field, properties, globalEmpty),
        )
        return { kind: 'fields', fields }
      }).filter(block => {
        if (block.kind === 'fields') return block.fields.length > 0
        return true
      })
    }

    // Legacy fields[]
    if (config.fields?.length) {
      return [ {
        kind: 'fields',
        fields: config.fields.map(field => resolveField(field, properties, globalEmpty)),
      } ]
    }

    return []
  })

  function close () {
    const selection = appStore.selections.userCaseSelection
    const isRegionLayer = Boolean(
      selection != null
        && typeof selection === 'object'
        && selection.layerName
        && mapStore.activeRegion?.layerId === selection.layerName,
    )
    mapStore.clearActiveRegion({ clearRegionId: isRegionLayer })
  }
</script>

<style scoped>
.feature-info-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 2;
  width: min(420px, calc(100vw - 48px));
  pointer-events: none;
}

.feature-info-panel__card {
  pointer-events: auto;
  max-height: min(70vh, 560px);
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

.feature-info-panel__swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
  margin-right: 8px;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.feature-info-panel__section-title {
  font-size: 0.875rem;
  font-weight: 700;
  margin-bottom: 8px;
  line-height: 1.3;
}

.feature-info-panel__table-wrap {
  overflow-x: auto;
}

.feature-info-panel__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  line-height: 1.35;
}

.feature-info-panel__table th {
  text-align: left;
  font-weight: 700;
  padding: 4px 6px 6px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}

.feature-info-panel__table td {
  padding: 6px 6px 6px 0;
  vertical-align: top;
  color: rgba(var(--v-theme-on-surface), 0.75);
  word-break: break-word;
}

.feature-info-panel__table tr:not(:last-child) td {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
