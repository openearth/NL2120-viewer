<template>
  <div />
</template>

<script setup>
  import { useMap } from '@studiometa/vue-mapbox-gl'
  import { watch, unref } from 'vue'
  import bbox from '@turf/bbox'

  const props = defineProps({
    feature: {
      type: Object,
      default: null,
    },
    padding: {
      type: Number,
      default: 100,
    },
    maxZoom: {
      type: Number,
      default: 12,
    },
  })

  const { map } = useMap()

  function zoomToFeature(feature) {
    const mapInstance = unref(map)
    if (!mapInstance || !feature?.geometry) return

    const [west, south, east, north] = bbox(feature)
    mapInstance.fitBounds(
      [[west, south], [east, north]],
      { padding: props.padding, maxZoom: props.maxZoom },
    )
  }

  watch(() => props.feature, (feature) => {
    if (feature) {
      zoomToFeature(feature)
    }
  })
</script>
