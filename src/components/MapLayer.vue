<template>
  <MapboxLayer
    v-if="layer"
    :id="layer.id"
    :options="layer"
    @mb-click="onLayerClicked"
    @mb-mouseenter="onMouseenter"
    @mb-mouseleave="onMouseleave"
  />
</template>

<script setup>
  import { MapboxLayer, useMap } from '@studiometa/vue-mapbox-gl'
  import { computed, ref, unref, onMounted, onUnmounted, nextTick } from 'vue'
  import { useMapStore } from '@/stores/map'

  const props = defineProps({
    layer: {
      type: Object,
      default: () => ({}),
    },
  })

  const emit = defineEmits(['click'])

  const { map } = useMap()
  const mapStore = useMapStore()

  // Highlight & hover logic below is intended for vector WMTS tile sources
  // built via `build-wmts-layer`, where features support Mapbox feature-state.
  // It deliberately uses the feature's actual `source` / `sourceLayer` from
  // Mapbox click events instead of using the layer id of the config, so it remains
  // correct even if source IDs or layer is not passed correctly.

  const isClickable = computed(() => mapStore.isLayerClickable(props.layer.id))
  const layerId = computed(() => props.layer?.id)
  const sourceLayer = computed(() => props.layer?.['source-layer'])

  const selectedId = ref(null)
  const selectedSource = ref(null)
  const selectedSourceLayer = ref(null)

  const hoveredId = ref(null)
  const hoveredSource = ref(null)
  const hoveredSourceLayer = ref(null)

  function setHighlight(mapInstance, source, sourceLayerName, id, selected) {
    if (!mapInstance || source == null || sourceLayerName == null || id == null) return
    mapInstance.setFeatureState(
      { source, sourceLayer: sourceLayerName, id },
      { selected }
    )
  }

  function setHover(mapInstance, source, sourceLayerName, id, hover) {
    if (!mapInstance || source == null || sourceLayerName == null || id == null) return
    mapInstance.setFeatureState(
      { source, sourceLayer: sourceLayerName, id },
      { hover }
    )
  }

  function onLayerClicked(e) {
    if (!isClickable.value) return

    const feature = e.features?.[0]
    if (!feature) return

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
        selectedId.value = null
        selectedSource.value = null
        selectedSourceLayer.value = null
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

  function onMapClick(e) {
    if (!isClickable.value || selectedId.value === null) return
    if (selectedSource.value == null || selectedSourceLayer.value == null) return

    const mapInstance = unref(map)
    if (!mapInstance) return

    const features = mapInstance.queryRenderedFeatures(e.point, {
      layers: [layerId.value],
    })
    if (!features.length) {
      setHighlight(mapInstance, selectedSource.value, selectedSourceLayer.value, selectedId.value, false)
      selectedId.value = null
      selectedSource.value = null
      selectedSourceLayer.value = null
      emit('click', null)
    }
  }

  onMounted(() => {
    const mapInstance = unref(map)
    if (!mapInstance) return
    if (isClickable.value) {
      mapInstance.on('click', onMapClick)
      nextTick(() => {
        if (layerId.value && mapInstance.getLayer(layerId.value)) {
          mapInstance.on('mousemove', layerId.value, onMousemove)
        }
      })
    }
  })

  onUnmounted(() => {
    const mapInstance = unref(map)
    if (mapInstance) {
      mapInstance.off('click', onMapClick)
      if (layerId.value) mapInstance.off('mousemove', layerId.value, onMousemove)
    }
  })

  function onMousemove(e) {
    if (!isClickable.value) return

    const mapInstance = unref(map)
    const feature = e.features?.[0]
    if (!mapInstance || !feature || feature.id == null) return

    const source = feature.source
    const sourceLayerName = feature.sourceLayer ?? sourceLayer.value
    if (source == null || sourceLayerName == null) return

    if (hoveredId.value !== null && hoveredSource.value != null && hoveredSourceLayer.value != null) {
      setHover(mapInstance, hoveredSource.value, hoveredSourceLayer.value, hoveredId.value, false)
    }

    hoveredId.value = feature.id
    hoveredSource.value = source
    hoveredSourceLayer.value = sourceLayerName
    setHover(mapInstance, source, sourceLayerName, feature.id, true)
  }

  function onMouseenter() {
    if (isClickable.value) {
      unref(map).getCanvas().style.cursor = 'pointer'
    }
  }

  function onMouseleave() {
    const mapInstance = unref(map)
    if (isClickable.value && hoveredId.value !== null && hoveredSource.value != null && hoveredSourceLayer.value != null) {
      setHover(mapInstance, hoveredSource.value, hoveredSourceLayer.value, hoveredId.value, false)
      hoveredId.value = null
      hoveredSource.value = null
      hoveredSourceLayer.value = null
    }
    if (mapInstance) mapInstance.getCanvas().style.cursor = ''
  }
</script>
