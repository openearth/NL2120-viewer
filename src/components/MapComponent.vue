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
        :key="`${layer.id}-${layer.type}`"
        :layer="layer"
        @click="onFeatureClick"
      />
      <MapZoomControl :feature="mapStore.activeRegion?.feature" />
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
  import { computed, ref } from 'vue'
  const mapStore = useMapStore()
  const appStore = useAppStore()
  const accessToken = import.meta.env.VITE_MAPBOX_TOKEN
  const activeStyleTitle = ref(MAP_BASELAYER_DEFAULT.title)
  const activeStyleUri = computed(() => MAP_BASELAYERS.find(style => style.title === activeStyleTitle.value).uri)
  const mapInstance = ref(null)

  function onMapCreated (map) {
    mapInstance.value = map
    mapStore.initializeMapboxLayers()
  }

  function onFeatureClick (feature) {
    if (feature == null) {
      mapStore.clearActiveRegion()
      return
    }
    if (!feature?.layer?.id) return
    const layerId = feature.layer.id
    const selection = appStore.selections.userCaseSelection
    const regionIdProperty =
      selection != null &&
      typeof selection === 'object' &&
      selection.layerName === layerId
        ? selection.regionIdProperty
        : null
    mapStore.setActiveRegion(layerId, feature, regionIdProperty ?? undefined)
  }

</script>
<style>
.map-wrapper,
.map-wrapper .mapboxgl-map {
  width: 100%;
  height: 100%;
}
</style>
