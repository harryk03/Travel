// MapLibre's strict-CSP build has the same API as the main package.
declare module 'maplibre-gl/dist/maplibre-gl-csp' {
  import maplibregl from 'maplibre-gl';
  export default maplibregl;
}
