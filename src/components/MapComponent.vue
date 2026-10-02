<template>
  <div class="map-wrapper">
    <mapbox-map
      v-model:map="mapInstance"
      :access-token="accessToken"
      :map-style="activeStyleUri"
      :center="MAP_CENTER"
      :zoom="MAP_ZOOM"
      @mb-created="onMapCreated"
    >
      <MapLayer
        v-for="layer in mapStore.visibleMapboxLayers"
        :key="layerKey(layer)"
        :layer="layer"
        @click="onFeatureClick"
      />
      <RelatedGeometry />
      <MapZoomControl
        v-if="!relatedGeometryHandlesZoom"
        :feature="zoomFeature"
      />
      <MapboxNavigationControl position="bottom-right" />
    </mapbox-map>
  </div>
</template>

<script setup>
  import { MapboxMap, MapboxNavigationControl } from '@studiometa/vue-mapbox-gl'
  import { MAP_CENTER, MAP_ZOOM, MAP_BASELAYERS, MAP_BASELAYER_DEFAULT } from '@/lib/constant'
  import { useMapStore } from '@/stores/map'
  import { useAppStore } from '@/stores/app'
  import MapLayer from '@/components/MapLayer.vue'
  import MapZoomControl from '@/components/MapZoomControl.vue'
  import RelatedGeometry from '@/components/RelatedGeometry.vue'
  import { findWorkflowLayer } from '@/lib/find-workflow-layer'
  import { computed, ref } from 'vue'

  const mapStore = useMapStore()
  const appStore = useAppStore()
  const accessToken = import.meta.env.VITE_MAPBOX_TOKEN
  const activeStyleTitle = ref(MAP_BASELAYER_DEFAULT.title)
  const activeStyleUri = computed(() => MAP_BASELAYERS.find(style => style.title === activeStyleTitle.value).uri)
  const mapInstance = ref(null)

  const relatedGeometryHandlesZoom = computed(() => {
    const related = findWorkflowLayer(mapStore.activeRegion?.layerId)?.relatedGeometry
    return Boolean(related && related.fitBounds !== false)
  })

  const zoomFeature = computed(() => {
    const region = mapStore.activeRegion
    if (!region?.feature) return null
    const workflowLayer = findWorkflowLayer(region.layerId)
    if (workflowLayer?.fitBoundsOnSelect === false) return null
    return region.feature
  })

  function onMapCreated (map) {
    mapInstance.value = map
    mapStore.initializeMapboxLayers()
  }

  function layerKey (layer) {
    const tile = layer?.source?.tiles?.[0] || layer?.source || ''
    return `${ layer.id }-${ layer.type }-${ tile }`
  }

  function onFeatureClick (feature) {
    if (feature == null) {
      const prev = mapStore.activeRegion
      const selection = appStore.selections.userCaseSelection
      const isRegionLayer = Boolean(
        selection != null
          && typeof selection === 'object'
          && selection.layerName
          && prev?.layerId === selection.layerName,
      )
      mapStore.clearActiveRegion({ clearRegionId: isRegionLayer })
      return
    }
    if (!feature?.layer?.id) return
    let layerId = feature.layer.id
    // Clicks on category outline companions count as the fill layer
    if (layerId.endsWith('__outline')) {
      layerId = layerId.replace(/__outline$/, '')
    }
    const workflowLayer = findWorkflowLayer(layerId)
    // Only region-selection layers set activeRegionId for process inputs
    const selection = appStore.selections.userCaseSelection
    const regionIdProperty =
      selection != null &&
      typeof selection === 'object' &&
      selection.layerName === layerId
        ? selection.regionIdProperty
        : null
    mapStore.setActiveRegion(layerId, feature, regionIdProperty ?? undefined)

    // Optional per-layer zoom suppress (e.g. NbS hexagon clicks)
    if (workflowLayer?.fitBoundsOnSelect === false) {
      return
    }
  }

</script>
<style>
.map-wrapper,
.map-wrapper .mapboxgl-map {
  width: 100%;
  height: 100%;
}
</style>
