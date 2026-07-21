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
            <v-list-item-title class="text-caption filter-item-title">
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
            <v-list-item class="px-0 filter-item filter-item--parent">
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
              <v-list-item-title class="text-caption filter-item-title">
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

  const props = defineProps({
    layerId: { type: String, required: true },
    title: { type: String, default: 'Filter' },
    attributeKey: { type: String, required: true },
    secondaryAttributeKey: { type: String, default: null },
    /** true → secondary lists start collapsed; false → expanded */
    defaultCollapse: { type: Boolean, default: false },
    /** Shown (and matched) when a feature has no usable secondary value */
    emptySecondaryLabel: { type: String, default: 'Geen categorie' },
    wfsUrl: { type: String, required: true },
    delimiter: { type: String, default: ';' },
    flashWhenEnabled: { type: Boolean, default: false },
  })

  const mapStore = useMapStore()
  const isLoading = ref(false)
  const errorMessage = ref('')
  const options = ref([])
  const groups = ref([])
  const selectedValues = ref([])
  const selectedPairs = ref([])
  const expandedGroups = ref(new Set())

  const isHierarchical = computed(() => Boolean(props.secondaryAttributeKey))

  const hasOptions = computed(() => {
    return isHierarchical.value
      ? groups.value.length > 0
      : options.value.length > 0
  })

  const isReady = computed(() => {
    return mapStore.layerVisibility[props.layerId] === true && hasOptions.value
  })

  function parseDelimitedValues (rawValue) {
    if (typeof rawValue !== 'string' || rawValue.length === 0) return []
    return rawValue
      .split(props.delimiter)
      .map(v => v.trim())
      .filter(v => v.length > 0)
  }

  /** Stable key for a (primary, secondary) selection pair */
  function pairKey (primary, secondary) {
    return JSON.stringify([ primary, secondary ])
  }

  function parsePairKey (key) {
    return JSON.parse(key)
  }

  function allPairKeys (groupList) {
    return groupList.flatMap(group =>
      group.children.map(child => pairKey(group.value, child.value)),
    )
  }

  function childPairKeys (group) {
    return group.children.map(child => pairKey(group.value, child.value))
  }

  function resolveSecondaries (rawSecondary) {
    const values = parseDelimitedValues(rawSecondary)
    return values.length > 0 ? values : [ props.emptySecondaryLabel ]
  }

  function resetLocalState () {
    options.value = []
    groups.value = []
    selectedValues.value = []
    selectedPairs.value = []
    expandedGroups.value = new Set()
  }

  async function loadOptions () {
    isLoading.value = true
    errorMessage.value = ''
    try {
      const response = await fetch(props.wfsUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${ response.status }`)
      }
      const data = await response.json()
      const features = Array.isArray(data?.features) ? data.features : []

      if (isHierarchical.value) {
        loadHierarchicalOptions(features)
      } else {
        loadFlatOptions(features)
      }
    } catch (error) {
      console.error(`[LayerAttributeFilter] Failed to load options for ${ props.layerId }:`, error)
      errorMessage.value = 'Unable to load filter options.'
      resetLocalState()
    } finally {
      isLoading.value = false
    }
  }

  function loadFlatOptions (features) {
    const counts = new Map()

    for (const feature of features) {
      const values = parseDelimitedValues(feature?.properties?.[props.attributeKey])
      for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }

    resetLocalState()
    options.value = Array.from(counts.entries())
      .map(([ value, count ]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
    selectedValues.value = options.value.map(o => o.value)
  }

  function loadHierarchicalOptions (features) {
    const parentCounts = new Map()
    const childCounts = new Map()

    for (const feature of features) {
      const primaries = parseDelimitedValues(feature?.properties?.[props.attributeKey])
      if (primaries.length === 0) continue

      const secondaries = resolveSecondaries(feature?.properties?.[props.secondaryAttributeKey])

      for (const primary of primaries) {
        parentCounts.set(primary, (parentCounts.get(primary) ?? 0) + 1)

        if (!childCounts.has(primary)) {
          childCounts.set(primary, new Map())
        }
        const children = childCounts.get(primary)
        for (const secondary of secondaries) {
          children.set(secondary, (children.get(secondary) ?? 0) + 1)
        }
      }
    }

    const nextGroups = Array.from(parentCounts.entries())
      .map(([ value, count ]) => {
        const childrenMap = childCounts.get(value) ?? new Map()
        const children = Array.from(childrenMap.entries())
          .map(([ childValue, childCount ]) => ({ value: childValue, count: childCount }))
          .sort((a, b) => {
            if (a.value === props.emptySecondaryLabel) return 1
            if (b.value === props.emptySecondaryLabel) return -1
            return a.value.localeCompare(b.value)
          })
        return { value, count, children }
      })
      .sort((a, b) => a.value.localeCompare(b.value))

    resetLocalState()
    groups.value = nextGroups
    selectedPairs.value = allPairKeys(nextGroups)
    expandedGroups.value = props.defaultCollapse
      ? new Set()
      : new Set(nextGroups.map(group => group.value))
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
    const next = new Set(expandedGroups.value)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    expandedGroups.value = next
  }

  function isParentChecked (group) {
    return childPairKeys(group).every(key => selectedPairs.value.includes(key))
  }

  function isParentIndeterminate (group) {
    const keys = childPairKeys(group)
    const selectedCount = keys.filter(key => selectedPairs.value.includes(key)).length
    return selectedCount > 0 && selectedCount < keys.length
  }

  function toggleParent (group, checked) {
    const current = new Set(selectedPairs.value)
    for (const key of childPairKeys(group)) {
      checked ? current.add(key) : current.delete(key)
    }
    selectedPairs.value = Array.from(current)
  }

  function buildPairCondition (primary, secondary) {
    const primaryMatch = [
      'in',
      primary,
      [ 'coalesce', [ 'get', props.attributeKey ], '' ],
    ]

    // emptySecondaryLabel ↔ missing/empty secondary attribute on the feature
    if (secondary === props.emptySecondaryLabel) {
      return [
        'all',
        primaryMatch,
        [ '==', [ 'coalesce', [ 'get', props.secondaryAttributeKey ], '' ], '' ],
      ]
    }

    return [
      'all',
      primaryMatch,
      [
        'in',
        secondary,
        [ 'coalesce', [ 'get', props.secondaryAttributeKey ], '' ],
      ],
    ]
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

  function applyFilterToLayer () {
    if (isHierarchical.value) {
      const allKeys = allPairKeys(groups.value)
      setLayerFilterFromSelection(allKeys.length, selectedPairs.value, selected =>
        selected.map(key => {
          const [ primary, secondary ] = parsePairKey(key)
          return buildPairCondition(primary, secondary)
        }),
      )
      return
    }

    setLayerFilterFromSelection(options.value.length, selectedValues.value, selected =>
      selected.map(value => [
        'in',
        value,
        [ 'coalesce', [ 'get', props.attributeKey ], '' ],
      ]),
    )
  }

  watch(selectedValues, applyFilterToLayer)
  watch(selectedPairs, applyFilterToLayer)

  onMounted(() => {
    loadOptions()
  })

  onBeforeUnmount(() => {
    mapStore.setLayerFilter(props.layerId, null)
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
