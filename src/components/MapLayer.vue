<template>
  <MapboxLayer
    v-if="layer"
    :id="layer.id"
    :options="layer"
    @mb-click="onLayerClicked"
    @mb-mouseleave="onMouseleave"
  />
</template>

<script setup>
  import { MapboxLayer, useMap } from '@studiometa/vue-mapbox-gl'
  import { computed, ref, unref, onMounted, onUnmounted, onBeforeUnmount, nextTick, watch } from 'vue'
  import { useMapStore } from '@/stores/map'
  import {
    buildCategoryOutlineStyle,
    buildCommittedOutlineStyle,
    categoryOutlineLayerId,
  } from '@/lib/category-style'

  const props = defineProps({
    layer: {
      type: Object,
      default: () => ({}),
    },
  })

  const emit = defineEmits(['click'])

  const { map } = useMap()
  const mapStore = useMapStore()

  // Highlight & hover logic below is intended for vector WMTS/WMS tile sources
  // where features support Mapbox feature-state. It uses the feature's actual
  // `source` / `sourceLayer` from Mapbox events so it stays correct for both
  // GWC WMTS and WMS MVT layers.

  const isClickable = computed(() => mapStore.isLayerClickable(props.layer.id))
  const layerId = computed(() => props.layer?.id)
  const sourceLayer = computed(() => props.layer?.['source-layer'])
  const outlineLayerId = computed(() => (
    layerId.value ? categoryOutlineLayerId(layerId.value) : null
  ))
  const layerConfig = computed(() =>
    mapStore.layersConfig.find(cfg => cfg.id === layerId.value),
  )

  const selectedId = ref(null)
  const selectedSource = ref(null)
  const selectedSourceLayer = ref(null)

  const hoveredId = ref(null)
  const hoveredSource = ref(null)
  const hoveredSourceLayer = ref(null)

  const appliedCommittedId = ref(null)
  const appliedCommittedSource = ref(null)
  const appliedCommittedSourceLayer = ref(null)

  function isInteractiveFeature (feature) {
    if (!feature) return false
    return mapStore.isFeatureInteractive(layerId.value, feature.properties || {})
  }

  function wantsCategoryOutline () {
    const cfg = layerConfig.value
    if (!cfg?.categoryStyle) return false
    return props.layer?.type === 'fill' || cfg.vectorType === 'fill'
  }

  function wantsCommittedOutline () {
    const cfg = layerConfig.value
    if (!cfg?.selectionStyle?.outline) return false
    return props.layer?.type === 'fill' || cfg.vectorType === 'fill'
  }

  function wantsOutlineLayer () {
    return wantsCategoryOutline() || wantsCommittedOutline()
  }

  function resolveOutlineStyle () {
    const cfg = layerConfig.value
    if (wantsCategoryOutline()) {
      return buildCategoryOutlineStyle(cfg.categoryStyle)
    }
    if (wantsCommittedOutline()) {
      return buildCommittedOutlineStyle(cfg.selectionStyle)
    }
    return null
  }

  function removeOutlineLayer (mapInstance) {
    const oid = outlineLayerId.value
    if (!mapInstance || !oid) return
    if (mapInstance.getLayer(oid)) {
      mapInstance.removeLayer(oid)
    }
  }

  function syncOutlineLayer () {
    const mapInstance = unref(map)
    const id = layerId.value
    const oid = outlineLayerId.value
    if (!mapInstance || !id || !oid) return

    const outlineStyle = resolveOutlineStyle()
    if (!outlineStyle || !wantsOutlineLayer()) {
      removeOutlineLayer(mapInstance)
      return
    }

    // Fill MapboxLayer must have created the source (source id === layer id)
    if (!mapInstance.getLayer(id) || !mapInstance.getSource(id)) return

    const filter = props.layer?.filter

    if (mapInstance.getLayer(oid)) {
      for (const [ key, value ] of Object.entries(outlineStyle.paint || {})) {
        try {
          mapInstance.setPaintProperty(oid, key, value)
        } catch (error) {
          console.warn(`[MapLayer] outline setPaintProperty ${ key } failed:`, error)
        }
      }
      for (const [ key, value ] of Object.entries(outlineStyle.layout || {})) {
        try {
          mapInstance.setLayoutProperty(oid, key, value)
        } catch (error) {
          console.warn(`[MapLayer] outline setLayoutProperty ${ key } failed:`, error)
        }
      }
      try {
        mapInstance.setFilter(oid, filter ?? null)
      } catch (error) {
        console.warn('[MapLayer] outline setFilter failed:', error)
      }
      return
    }

    mapInstance.addLayer({
      id: oid,
      type: 'line',
      source: id,
      ...(props.layer?.['source-layer']
        ? { 'source-layer': props.layer['source-layer'] }
        : {}),
      paint: outlineStyle.paint,
      layout: outlineStyle.layout,
      ...(filter ? { filter } : {}),
    })
  }

  function setFeatureStateFlag (mapInstance, source, sourceLayerName, id, patch) {
    if (!mapInstance || source == null || id == null) return
    const spec = sourceLayerName != null
      ? { source, sourceLayer: sourceLayerName, id }
      : { source, id }
    try {
      mapInstance.setFeatureState(spec, patch)
    } catch (error) {
      console.warn('[MapLayer] setFeatureState failed:', error)
    }
  }

  function setHighlight (mapInstance, source, sourceLayerName, id, selected) {
    setFeatureStateFlag(mapInstance, source, sourceLayerName, id, { selected })
  }

  function setHover (mapInstance, source, sourceLayerName, id, hover) {
    setFeatureStateFlag(mapInstance, source, sourceLayerName, id, { hover })
  }

  function clearAppliedCommitted (mapInstance) {
    if (
      appliedCommittedId.value != null
      && appliedCommittedSource.value != null
    ) {
      setFeatureStateFlag(
        mapInstance,
        appliedCommittedSource.value,
        appliedCommittedSourceLayer.value,
        appliedCommittedId.value,
        { committed: false },
      )
    }
    appliedCommittedId.value = null
    appliedCommittedSource.value = null
    appliedCommittedSourceLayer.value = null
  }

  function syncCommittedFeatureState () {
    const mapInstance = unref(map)
    if (!mapInstance) return

    clearAppliedCommitted(mapInstance)

    if (!mapStore.isCommittedOutlineVisible) return
    const committed = mapStore.committedSelection
    if (!committed || committed.layerId !== layerId.value) return
    if (committed.featureId == null || committed.source == null) return

    const sourceLayerName = committed.sourceLayer ?? sourceLayer.value
    setFeatureStateFlag(
      mapInstance,
      committed.source,
      sourceLayerName,
      committed.featureId,
      { committed: true },
    )
    appliedCommittedId.value = committed.featureId
    appliedCommittedSource.value = committed.source
    appliedCommittedSourceLayer.value = sourceLayerName
  }

  function clearLocalSelection (mapInstance) {
    if (selectedId.value !== null && selectedSource.value != null && selectedSourceLayer.value != null) {
      setHighlight(mapInstance, selectedSource.value, selectedSourceLayer.value, selectedId.value, false)
    }
    selectedId.value = null
    selectedSource.value = null
    selectedSourceLayer.value = null
  }

  function clearLocalHover (mapInstance) {
    if (hoveredId.value !== null && hoveredSource.value != null && hoveredSourceLayer.value != null) {
      setHover(mapInstance, hoveredSource.value, hoveredSourceLayer.value, hoveredId.value, false)
    }
    hoveredId.value = null
    hoveredSource.value = null
    hoveredSourceLayer.value = null
  }

  function onLayerClicked (e) {
    if (!isClickable.value) return

    const feature = e.features?.[0]
    if (!feature) return
    if (!isInteractiveFeature(feature)) return

    const mapInstance = unref(map)
    const source = feature.source
    const sourceLayerName = feature.sourceLayer ?? sourceLayer.value

    if (source != null && sourceLayerName != null) {
      const clickedId = feature.id
      if (clickedId == null) {
        console.warn('No feature id found — check promoteId', feature.properties)
        return
      }

      if (!mapInstance) return

      if (selectedId.value !== null && selectedSource.value != null && selectedSourceLayer.value != null) {
        setHighlight(mapInstance, selectedSource.value, selectedSourceLayer.value, selectedId.value, false)
      }

      if (selectedId.value === clickedId && selectedSource.value === source) {
        clearLocalSelection(mapInstance)
        emit('click', null)
        return
      }

      selectedId.value = clickedId
      selectedSource.value = source
      selectedSourceLayer.value = sourceLayerName
      setHighlight(mapInstance, source, sourceLayerName, clickedId, true)
    }

    emit('click', feature)
  }

  function onMapClick (e) {
    if (!isClickable.value || selectedId.value === null) return
    if (selectedSource.value == null || selectedSourceLayer.value == null) return

    const mapInstance = unref(map)
    if (!mapInstance) return

    const features = mapInstance.queryRenderedFeatures(e.point, {
      layers: [ layerId.value ],
    }).filter(isInteractiveFeature)

    if (!features.length) {
      clearLocalSelection(mapInstance)
      emit('click', null)
    }
  }

  function bindPointerHandlers () {
    const mapInstance = unref(map)
    if (!mapInstance || !isClickable.value) return
    mapInstance.on('click', onMapClick)
    nextTick(() => {
      if (layerId.value && mapInstance.getLayer(layerId.value)) {
        mapInstance.on('mousemove', layerId.value, onMousemove)
      }
    })
  }

  function unbindPointerHandlers () {
    const mapInstance = unref(map)
    if (!mapInstance) return
    mapInstance.off('click', onMapClick)
    if (layerId.value) mapInstance.off('mousemove', layerId.value, onMousemove)
  }

  onMounted(() => {
    const mapInstance = unref(map)
    if (!mapInstance) return

    const cfg = layerConfig.value
    if (cfg?.categoryStyle) {
      mapStore.ensureLayerCategories(layerId.value)
    }

    bindPointerHandlers()
    nextTick(() => {
      syncOutlineLayer()
      syncCommittedFeatureState()
    })
  })

  onBeforeUnmount(() => {
    const mapInstance = unref(map)
    clearAppliedCommitted(mapInstance)
    // Remove outline before MapboxLayer tears down the shared source
    removeOutlineLayer(mapInstance)
  })

  onUnmounted(() => {
    unbindPointerHandlers()
  })

  // Attach handlers when the layer becomes clickable after mount (e.g. step opens later)
  watch(isClickable, (clickable, wasClickable) => {
    if (clickable && !wasClickable) {
      bindPointerHandlers()
    } else if (!clickable && wasClickable) {
      unbindPointerHandlers()
      const mapInstance = unref(map)
      clearLocalHover(mapInstance)
      // Clear interactive yellow only; committed outline uses feature-state `committed`
      clearLocalSelection(mapInstance)
    }
  })

  function onMousemove (e) {
    if (!isClickable.value) return

    const mapInstance = unref(map)
    const feature = e.features?.find(isInteractiveFeature)
    if (!mapInstance || !feature || feature.id == null) {
      if (hoveredId.value !== null) {
        clearLocalHover(mapInstance)
        if (mapStore.hoveredFeature?.layerId === layerId.value) {
          mapStore.clearHoveredFeature()
        }
        if (mapInstance) mapInstance.getCanvas().style.cursor = ''
      }
      return
    }

    const source = feature.source
    const sourceLayerName = feature.sourceLayer ?? sourceLayer.value
    if (source == null || sourceLayerName == null) return

    const isNewHover = hoveredId.value !== feature.id

    if (isNewHover && hoveredId.value !== null && hoveredSource.value != null && hoveredSourceLayer.value != null) {
      setHover(mapInstance, hoveredSource.value, hoveredSourceLayer.value, hoveredId.value, false)
    }

    hoveredId.value = feature.id
    hoveredSource.value = source
    hoveredSourceLayer.value = sourceLayerName
    setHover(mapInstance, source, sourceLayerName, feature.id, true)
    mapInstance.getCanvas().style.cursor = 'pointer'

    if (isNewHover) {
      mapStore.setHoveredFeature(layerId.value, feature)
    }
  }

  function onMouseleave () {
    const mapInstance = unref(map)
    if (isClickable.value) {
      clearLocalHover(mapInstance)
    }
    if (mapStore.hoveredFeature?.layerId === layerId.value) {
      mapStore.clearHoveredFeature()
    }
    if (mapInstance) mapInstance.getCanvas().style.cursor = ''
  }

  watch(
    () => props.layer?.filter,
    (nextFilter) => {
      const mapInstance = unref(map)
      const id = layerId.value
      if (!mapInstance || !id || !mapInstance.getLayer(id)) return
      mapInstance.setFilter(id, nextFilter ?? null)
      syncOutlineLayer()
    },
  )

  // MapboxLayer options are not reactive after creation — push paint/layout updates
  watch(
    () => [ props.layer?.paint, props.layer?.layout ],
    ([ paint, layout ]) => {
      const mapInstance = unref(map)
      const id = layerId.value
      if (!mapInstance || !id || !mapInstance.getLayer(id)) return

      if (paint && typeof paint === 'object') {
        for (const [ key, value ] of Object.entries(paint)) {
          try {
            mapInstance.setPaintProperty(id, key, value)
          } catch (error) {
            console.warn(`[MapLayer] setPaintProperty ${ key } failed:`, error)
          }
        }
      }

      if (layout && typeof layout === 'object') {
        for (const [ key, value ] of Object.entries(layout)) {
          try {
            mapInstance.setLayoutProperty(id, key, value)
          } catch (error) {
            console.warn(`[MapLayer] setLayoutProperty ${ key } failed:`, error)
          }
        }
      }

      syncOutlineLayer()
    },
    { deep: true },
  )

  // Keep local highlight in sync when selection is cleared elsewhere (e.g. info panel / dim)
  watch(
    () => mapStore.activeRegion,
    (region) => {
      if (region != null && region.layerId === props.layer?.id) return
      if (selectedId.value === null) return

      const mapInstance = unref(map)
      clearLocalSelection(mapInstance)
    },
  )

  // Durable committed outline (independent of interactive yellow / activeRegion)
  watch(
    () => [
      mapStore.committedSelection,
      mapStore.isCommittedOutlineVisible,
    ],
    () => {
      const mapInstance = unref(map)
      const committed = mapStore.committedSelection
      // Confirming a selection clears interactive yellow on that layer
      if (committed?.layerId === layerId.value) {
        clearLocalSelection(mapInstance)
      }
      nextTick(() => {
        syncOutlineLayer()
        syncCommittedFeatureState()
      })
    },
    { deep: true },
  )

  // Clear local hover/selection when the feature becomes dimmed
  watch(
    () => mapStore.layerFilterSelection[layerId.value],
    () => {
      const mapInstance = unref(map)
      const region = mapStore.activeRegion
      if (
        region?.layerId === layerId.value
        && !mapStore.isFeatureInteractive(layerId.value, region.properties)
      ) {
        clearLocalSelection(mapInstance)
      }

      if (
        mapStore.hoveredFeature?.layerId === layerId.value
        && !mapStore.isFeatureInteractive(
          layerId.value,
          mapStore.hoveredFeature.properties,
        )
      ) {
        clearLocalHover(mapInstance)
        mapStore.clearHoveredFeature()
        if (mapInstance) mapInstance.getCanvas().style.cursor = ''
      }
    },
  )
</script>
