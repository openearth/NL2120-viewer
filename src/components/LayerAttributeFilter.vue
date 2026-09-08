<template>
  <flash-highlight
    :enabled="isReady"
    :flash-when-enabled="flashWhenEnabled"
  >
    <v-card
      variant="flat"
      rounded="xl"
      class="bg-grey-lighten-3 px-3 py-0 mx-3 my-1 attribute-filter-card"
    >
      <v-card-title class="d-flex justify-space-between align-center card-title-compact filter-title-sticky">
        {{ title }}
      </v-card-title>

      <v-card-text class="pa-0 filter-scroll-content">
        <div
          v-if="isLoading"
          class="text-caption text-medium-emphasis"
        >
          Loading filter options...
        </div>
        <div
          v-else-if="errorMessage"
          class="text-caption text-error"
        >
          {{ errorMessage }}
        </div>
        <div
          v-else-if="!hasOptions"
          class="text-caption text-medium-emphasis"
        >
          No filter options found.
        </div>

        <v-list
          v-else-if="!isHierarchical"
          density="compact"
          class="pa-0"
        >
          <v-list-item
            v-for="option in options"
            :key="option.value"
            class="px-0 filter-item"
            :class="{ 'filter-item--dimmed': !selectedValues.includes(option.value) }"
          >
            <template #prepend>
              <v-checkbox
                :model-value="selectedValues.includes(option.value)"
                density="compact"
                hide-details
                color="primary"
                class="mr-2"
                @update:model-value="toggleValue(option.value, $event)"
              />
            </template>
            <v-list-item-title class="text-caption filter-item-title d-flex align-center">
              <span
                v-if="showCategoryColors"
                class="filter-category-swatch"
                :style="{ backgroundColor: swatchColorFor(option.value, !selectedValues.includes(option.value)) }"
              />
              {{ option.value }} ({{ option.count }})
            </v-list-item-title>
          </v-list-item>
        </v-list>

        <v-list
          v-else
          density="compact"
          class="pa-0"
        >
          <template
            v-for="group in groups"
            :key="group.value"
          >
            <v-list-item
              class="px-0 filter-item filter-item--parent"
              :class="{ 'filter-item--dimmed': !isParentActive(group) }"
            >
              <template #prepend>
                <v-checkbox
                  :model-value="isParentChecked(group)"
                  :indeterminate="isParentIndeterminate(group)"
                  density="compact"
                  hide-details
                  color="primary"
                  class="mr-2"
                  @update:model-value="toggleParent(group, $event)"
                />
              </template>
              <v-list-item-title class="text-caption filter-item-title d-flex align-center">
                <span
                  v-if="showCategoryColors"
                  class="filter-category-swatch"
                  :style="{ backgroundColor: swatchColorFor(group.value, !isParentActive(group)) }"
                />
                {{ group.value }} ({{ group.count }})
              </v-list-item-title>
              <template #append>
                <v-icon
                  size="22"
                  class="filter-expand-icon"
                  :class="{ 'filter-expand-icon--expanded': isGroupExpanded(group.value) }"
                  role="button"
                  tabindex="0"
                  :aria-label="isGroupExpanded(group.value) ? 'Collapse' : 'Expand'"
                  @click.stop="toggleGroupExpanded(group.value)"
                  @keydown.enter.prevent="toggleGroupExpanded(group.value)"
                  @keydown.space.prevent="toggleGroupExpanded(group.value)"
                >
                  mdi-menu-down
                </v-icon>
              </template>
            </v-list-item>

            <template v-if="isGroupExpanded(group.value)">
              <v-list-item
                v-for="child in group.children"
                :key="pairKey(group.value, child.value)"
                class="px-0 filter-item filter-item--child"
                :class="{
                  'filter-item--dimmed': !selectedPairs.includes(pairKey(group.value, child.value)),
                }"
              >
                <template #prepend>
                  <v-checkbox
                    :model-value="selectedPairs.includes(pairKey(group.value, child.value))"
                    density="compact"
                    hide-details
                    color="primary"
                    class="mr-2"
                    @update:model-value="togglePair(group.value, child.value, $event)"
                  />
                </template>
                <v-list-item-title class="text-caption filter-item-title">
                  {{ child.value }} ({{ child.count }})
                </v-list-item-title>
              </v-list-item>
            </template>
          </template>
        </v-list>
      </v-card-text>
    </v-card>
  </flash-highlight>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useMapStore } from '@/stores/map'
  import FlashHighlight from '@/components/FlashHighlight.vue'
  import {
    buildPairCondition,
    buildTokenMatchExpression,
    getDimmedCategoryColor,
    pairKey,
    parsePairKey,
  } from '@/lib/category-style'

  const props = defineProps({
    layerId: { type: String, required: true },
    title: { type: String, default: 'Filter' },
    attributeKey: { type: String, required: true },
    secondaryAttributeKey: { type: String, default: null },
    /** true → secondary lists start collapsed; false → expanded */
    defaultCollapse: { type: Boolean, default: false },
    /** Shown (and matched) when a feature has no usable secondary value */
    emptySecondaryLabel: { type: String, default: 'Geen categorie' },
    wfsUrl: { type: String, default: null },
    delimiter: { type: String, default: ';' },
    flashWhenEnabled: { type: Boolean, default: false },
    showCategoryColors: { type: Boolean, default: false },
    /** false | 'primary' | 'all' — dim instead of hide when unchecked */
    dimOnDeselect: { type: [ Boolean, String ], default: false },
  })

  const mapStore = useMapStore()
  const isLoading = ref(false)
  const errorMessage = ref('')
  const options = ref([])
  const groups = ref([])
  const selectedValues = ref([])
  const selectedPairs = ref([])
  const expandedGroups = ref(new Set())
  /** Remember child selection when a parent is unchecked (dim mode) */
  const rememberedParentPairs = ref({})

  const isHierarchical = computed(() => Boolean(props.secondaryAttributeKey))
  const dimMode = computed(() => {
    if (props.dimOnDeselect === true || props.dimOnDeselect === 'all') return 'all'
    if (props.dimOnDeselect === 'primary') return 'primary'
    return false
  })

  const hasOptions = computed(() => {
    return isHierarchical.value
      ? groups.value.length > 0
      : options.value.length > 0
  })

  const isReady = computed(() => {
    return mapStore.layerVisibility[props.layerId] === true && hasOptions.value
  })

  const filterConfig = computed(() => ({
    attributeKey: props.attributeKey,
    secondaryAttributeKey: props.secondaryAttributeKey,
    delimiter: props.delimiter,
    emptySecondaryLabel: props.emptySecondaryLabel,
  }))

  function colorFor (value) {
    return mapStore.layerCategories[props.layerId]?.colorByValue?.[value] || '#9e9e9e'
  }

  function swatchColorFor (value, isDimmed) {
    if (!isDimmed) return colorFor(value)
    const layerConfig = mapStore.layersConfig.find(cfg => cfg.id === props.layerId)
    return getDimmedCategoryColor(layerConfig?.categoryStyle)
  }

  function allPairKeys (groupList) {
    return groupList.flatMap(group =>
      group.children.map(child => pairKey(group.value, child.value)),
    )
  }

  function childPairKeys (group) {
    return group.children.map(child => pairKey(group.value, child.value))
  }

  function resetLocalState () {
    options.value = []
    groups.value = []
    selectedValues.value = []
    selectedPairs.value = []
    expandedGroups.value = new Set()
    rememberedParentPairs.value = {}
  }

  async function loadOptions () {
    isLoading.value = true
    errorMessage.value = ''
    try {
      const entry = await mapStore.ensureLayerCategories(props.layerId, {
        attributeKey: props.attributeKey,
        secondaryAttributeKey: props.secondaryAttributeKey,
        delimiter: props.delimiter,
        emptySecondaryLabel: props.emptySecondaryLabel,
        wfsUrl: props.wfsUrl,
      })

      if (!entry || entry.error) {
        errorMessage.value = entry?.error || 'Unable to load filter options.'
        resetLocalState()
        return
      }

      if (entry.hierarchical) {
        groups.value = entry.groups
        options.value = []
        selectedPairs.value = allPairKeys(entry.groups)
        selectedValues.value = []
        expandedGroups.value = props.defaultCollapse
          ? new Set()
          : new Set(entry.groups.map(group => group.value))
      } else {
        options.value = entry.options
        groups.value = []
        selectedValues.value = entry.options.map(o => o.value)
        selectedPairs.value = []
        expandedGroups.value = new Set()
      }
    } catch (error) {
      console.error(`[LayerAttributeFilter] Failed to load options for ${ props.layerId }:`, error)
      errorMessage.value = 'Unable to load filter options.'
      resetLocalState()
    } finally {
      isLoading.value = false
    }
  }

  function toggleInList (listRef, key, checked) {
    const current = new Set(listRef.value)
    checked ? current.add(key) : current.delete(key)
    listRef.value = Array.from(current)
  }

  function toggleValue (value, checked) {
    toggleInList(selectedValues, value, checked)
  }

  function togglePair (primary, secondary, checked) {
    toggleInList(selectedPairs, pairKey(primary, secondary), checked)
  }

  function isGroupExpanded (value) {
    return expandedGroups.value.has(value)
  }

  function toggleGroupExpanded (value) {
    const group = groups.value.find(g => g.value === value)
    if (!group || !isParentActive(group)) return

    const next = new Set(expandedGroups.value)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    expandedGroups.value = next
  }

  function isParentChecked (group) {
    const keys = childPairKeys(group)
    return keys.length > 0 && keys.every(key => selectedPairs.value.includes(key))
  }

  function isParentIndeterminate (group) {
    const keys = childPairKeys(group)
    const selectedCount = keys.filter(key => selectedPairs.value.includes(key)).length
    return selectedCount > 0 && selectedCount < keys.length
  }

  function isParentActive (group) {
    return childPairKeys(group).some(key => selectedPairs.value.includes(key))
  }

  function toggleParent (group, checked) {
    const keys = childPairKeys(group)
    if (checked) {
      const remembered = rememberedParentPairs.value[group.value]
      const toRestore = Array.isArray(remembered) && remembered.length > 0 ? remembered : keys
      const current = new Set(selectedPairs.value)
      for (const key of toRestore) current.add(key)
      selectedPairs.value = Array.from(current)
      delete rememberedParentPairs.value[group.value]
    } else {
      rememberedParentPairs.value[group.value] = keys.filter(key =>
        selectedPairs.value.includes(key),
      )
      const current = new Set(selectedPairs.value)
      for (const key of keys) current.delete(key)
      selectedPairs.value = Array.from(current)

      // Collapse when parent is unchecked
      const next = new Set(expandedGroups.value)
      next.delete(group.value)
      expandedGroups.value = next
    }
  }

  /**
   * Mapbox: null = show all; empty `any` = show none; otherwise OR of conditions.
   */
  function setLayerFilterFromSelection (totalCount, selected, buildConditions) {
    if (totalCount === 0 || selected.length === totalCount) {
      mapStore.setLayerFilter(props.layerId, null)
      return
    }

    if (selected.length === 0) {
      mapStore.setLayerFilter(props.layerId, [ 'any' ])
      return
    }

    mapStore.setLayerFilter(props.layerId, [ 'any', ...buildConditions(selected) ])
  }

  function publishSelection () {
    if (dimMode.value) {
      let selectedKeys
      let publishedConfig = filterConfig.value

      if (dimMode.value === 'primary') {
        selectedKeys = isHierarchical.value
          ? groups.value.filter(group => isParentActive(group)).map(group => group.value)
          : selectedValues.value
        publishedConfig = {
          ...filterConfig.value,
          secondaryAttributeKey: null,
        }
      } else {
        selectedKeys = isHierarchical.value
          ? selectedPairs.value
          : selectedValues.value
      }

      mapStore.setLayerFilterSelection(props.layerId, {
        selectedKeys,
        filterConfig: publishedConfig,
        dimMode: dimMode.value,
      })
      return
    }

    // Classic hide-filter behaviour
    mapStore.clearLayerFilterSelection(props.layerId)

    if (isHierarchical.value) {
      const allKeys = allPairKeys(groups.value)
      setLayerFilterFromSelection(allKeys.length, selectedPairs.value, selected =>
        selected.map(key => {
          const [ primary, secondary ] = parsePairKey(key)
          return buildPairCondition(primary, secondary, filterConfig.value)
        }),
      )
      return
    }

    setLayerFilterFromSelection(options.value.length, selectedValues.value, selected =>
      selected.map(value =>
        buildTokenMatchExpression(props.attributeKey, value, props.delimiter),
      ),
    )
  }

  watch(selectedValues, publishSelection)
  watch(selectedPairs, () => {
    publishSelection()
    if (!isHierarchical.value) return
    const next = new Set(expandedGroups.value)
    for (const group of groups.value) {
      if (!isParentActive(group)) next.delete(group.value)
    }
    expandedGroups.value = next
  })

  onMounted(() => {
    loadOptions()
  })

  onBeforeUnmount(() => {
    mapStore.setLayerFilter(props.layerId, null)
    mapStore.clearLayerFilterSelection(props.layerId)
  })
</script>

<style scoped>
.card-title-compact {
  font-size: 0.8rem;
  line-height: 1.2;
}

.filter-item {
  min-height: 18px;
}

.filter-item--dimmed .filter-item-title,
.filter-item--dimmed .filter-expand-icon {
  opacity: 0.45;
}

.filter-item--parent {
  padding-right: 4px !important;
}

.filter-item--parent :deep(.v-list-item__append) {
  align-self: center;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  margin-inline-start: 4px !important;
  padding-inline-start: 0 !important;
}

.filter-item--child {
  padding-left: 20px !important;
}

.filter-expand-icon {
  cursor: pointer;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
  line-height: 1;
  margin-inline-end: 6px;
}

.filter-expand-icon--expanded {
  transform: rotate(0deg);
}

.filter-item-title {
  white-space: normal;
  line-height: 1;
}

.filter-category-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.filter-item :deep(.v-selection-control) {
  transform: scale(0.82);
  transform-origin: left center;
  margin-top: -10px;
  margin-bottom: -10px;
}

.attribute-filter-card {
  max-height: 220px;
  overflow: hidden;
}

.filter-scroll-content {
  max-height: 180px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.35) transparent;
}

.filter-scroll-content::-webkit-scrollbar {
  width: 6px;
}

.filter-scroll-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 999px;
}

.filter-scroll-content::-webkit-scrollbar-track {
  background: transparent;
}

.filter-title-sticky {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: rgb(var(--v-theme-grey-lighten-3));
}
</style>
