// Preview basemap: do not depend on OSM's volunteer tile servers in an iframe.
// World Street Map is a legacy reference map; it is not live transport data.
export const BASEMAP_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
export const BASEMAP_OPTIONS = {
  maxZoom: 18,
  referrerPolicy: 'strict-origin-when-cross-origin' as const,
  attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> | Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, GIS User Community',
};
