import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import slovakiaGeo from "@/data/slovakia.geo.json";

type BaseLayer = "osm" | "satellite" | "topo" | "ortofoto";

export interface MapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  clearParcel: () => void;
}

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  zoom?: number;
}

export interface ParcelInfo {
  parcelNo: string;
  ku: string;
  lv: string | null;
  vymera: string | null;
  druh: string | null;
  layer: string;
  lat: number;
  lng: number;
  zbgisUrl: string;
  rawAttributes: Record<string, unknown>;
}

interface MapViewProps {
  base: BaseLayer;
  showCadastre?: boolean;
  cadastreOpacity?: number;
  marker?: MapMarker | null;
  onCoords?: (lat: number, lng: number) => void;
  onParcelSelect?: (info: ParcelInfo) => void;
  selectionMode?: boolean;
  onAreaSelect?: (bbox: { south: number; west: number; north: number; east: number }) => void;
}

const DEFAULT_ICON = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DEFAULT_ICON;

// Slovakia bounding box (with small margin so users can pan a bit around the border)
const SK_BOUNDS = L.latLngBounds(L.latLng(47.4, 16.4), L.latLng(49.9, 22.9));

interface BaseLayerConfig {
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom?: number;
  maxNativeZoom?: number;
}

const BASE_LAYERS: Record<BaseLayer, BaseLayerConfig> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenTopoMap (CC-BY-SA)",
    subdomains: "abc",
    maxZoom: 19,
    maxNativeZoom: 17,
  },
  ortofoto: {
    url: "https://ofmozaika.tiles.freemap.sk/{z}/{x}/{y}.jpg",
    attribution: "© ÚGKK SR — Ortofotomozaika (freemap.sk)",
    maxZoom: 20,
    maxNativeZoom: 20,
  },
};

// Build a "blind-map" mask: a giant world polygon with Slovakia cut out as a hole.
function getSlovakiaRing(): [number, number][] {
  // GeoJSON Polygon coords: [ [ [lon, lat], ... ] ]
  // Leaflet wants [lat, lon]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fc = slovakiaGeo as any;
  const coords: [number, number][] = fc.features[0].geometry.coordinates[0];
  return coords.map(([lon, lat]) => [lat, lon] as [number, number]);
}

// Highlight layer for a clicked parcel
let parcelHighlight: L.GeoJSON | null = null;
let parcelMarker: L.Marker | null = null;
let parcelSelectCallback: ((info: ParcelInfo) => void) | null = null;

async function identifyParcel(map: L.Map, latlng: L.LatLng) {
  try {
    const size = map.getSize();
    const point = map.latLngToContainerPoint(latlng);
    const b = map.getBounds();
    const url =
      "/api/public/kataster/identify" +
      "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo" +
      "&LAYERS=5,8&QUERY_LAYERS=5,8" +
      `&I=${Math.round(point.x)}&J=${Math.round(point.y)}` +
      `&WIDTH=${Math.round(size.x)}&HEIGHT=${Math.round(size.y)}` +
      `&BBOX=${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}` +
      "&CRS=EPSG:4326&INFO_FORMAT=application/geo%2Bjson&FEATURE_COUNT=3";

    const res = await fetch(url);
    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = data?.features || [];
    const feature = features.find((f) => /parcel/i.test(f.properties?.LAYER_NAME || "")) || features[0];
    if (!feature) return;

    if (parcelHighlight) {
      map.removeLayer(parcelHighlight);
      parcelHighlight = null;
    }
    if (parcelMarker) {
      map.removeLayer(parcelMarker);
      parcelMarker = null;
    }
    if (feature.geometry) {
      parcelHighlight = L.geoJSON(feature, {
        style: {
          color: "#dc2626",
          weight: 2.5,
          fillColor: "#fca5a5",
          fillOpacity: 0.35,
        },
        interactive: false,
      }).addTo(map);
    }
    parcelMarker = L.marker([latlng.lat, latlng.lng], { zIndexOffset: 1100 }).addTo(map);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props: Record<string, any> = feature.properties || {};
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        for (const key of Object.keys(props)) {
          if (key.toLowerCase().includes(k.toLowerCase()) && props[key] != null && String(props[key]).trim() !== "") {
            return String(props[key]);
          }
        }
      }
      return null;
    };
    const parcelNo = pick("číslo parcely", "parcelné číslo", "cislo_parcely", "parcelné", "parcelne") || "—";
    const ku = pick("názov katastrálneho", "názov_ku", "nazov_ku") || "—";
    const lv = pick("list vlastníctva", "listu vlastníctva", "číslo listu", "cislo_lv", "list vlast");
    const vymera = pick("vymera", "výmera");
    const druh = pick("druh pozemku", "druh_pozemku", "druh");
    const layer = feature.properties?.LAYER_NAME || feature.properties?.layerName || "Parcela";
    const zbgisUrl = `https://zbgis.skgeodesy.sk/mkzbgis/sk/kataster?pos=${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)},19&bm=zbgis&sc_p=kn`;

    parcelSelectCallback?.({
      parcelNo: parcelNo ?? "—",
      ku: ku ?? "—",
      lv,
      vymera,
      druh,
      layer: layer ?? "—",
      lat: latlng.lat,
      lng: latlng.lng,
      zbgisUrl,
      rawAttributes: props,
    });
  } catch (err) {
    console.error("identify failed", err);
  }
}


const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView({
  base,
  showCadastre,
  cadastreOpacity = 0.85,
  marker,
  onCoords,
  onParcelSelect,
  selectionMode,
  onAreaSelect,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const cadastreRef = useRef<L.TileLayer.WMS | null>(null);
  const esknOverlayRef = useRef<L.TileLayer | null>(null);
  const uoRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const borderRef = useRef<L.Polyline | null>(null);
  const selRectRef = useRef<L.Rectangle | null>(null);
  const selStartRef = useRef<L.LatLng | null>(null);
  const selModeRef = useRef(false);
  const ignoreClickRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [48.7, 19.5],
      zoom: 10,
      minZoom: 7,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: true,
      maxBounds: SK_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      fadeAnimation: false,
    });
    mapRef.current = map;

    L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 160 }).addTo(map);

    map.on("mousemove", (e) => onCoords?.(e.latlng.lat, e.latlng.lng));
    map.on("click", (e) => {
      if (selModeRef.current) return;
      if (ignoreClickRef.current) { ignoreClickRef.current = false; return; }
      identifyParcel(map, e.latlng);
    });

    return () => {
      parcelSelectCallback = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the module-level callback in sync with the prop across re-renders
  useEffect(() => {
    parcelSelectCallback = onParcelSelect ?? null;
  }, [onParcelSelect]);

  // Keep selection mode ref in sync and toggle dragging
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    selModeRef.current = !!selectionMode;
    if (selectionMode) {
      map.getContainer().style.cursor = "crosshair";
      map.dragging.disable();
    } else {
      map.getContainer().style.cursor = "";
      map.dragging.enable();
    }
  }, [selectionMode]);

  // Rectangle selection mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!selectionMode) return;
      selStartRef.current = e.latlng;
      if (selRectRef.current) { map.removeLayer(selRectRef.current); selRectRef.current = null; }
      selRectRef.current = L.rectangle([e.latlng, e.latlng], {
        color: "#3b82f6",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.08,
        dashArray: "6 4",
        interactive: false,
      }).addTo(map);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!selStartRef.current || !selRectRef.current) return;
      const bounds = L.latLngBounds(selStartRef.current, e.latlng);
      selRectRef.current.setBounds(bounds);
    };

    const onMouseUp = () => {
      if (!selStartRef.current || !selRectRef.current) return;
      const bounds = selRectRef.current.getBounds();
      const rect = selRectRef.current;
      selStartRef.current = null;
      selRectRef.current = null;
      ignoreClickRef.current = true;
      onAreaSelect?.({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    if (selectionMode) {
    } else {
      if (selRectRef.current) { map.removeLayer(selRectRef.current); selRectRef.current = null; }
      selStartRef.current = null;
    }

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
    };
  }, [selectionMode, onAreaSelect]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    clearParcel: () => {
      const map = mapRef.current;
      if (!map) return;
      if (parcelHighlight) { map.removeLayer(parcelHighlight); parcelHighlight = null; }
      if (parcelMarker) { map.removeLayer(parcelMarker); parcelMarker = null; }
    },
  }), []);

  // Base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    const cfg = BASE_LAYERS[base];
    baseLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      subdomains: cfg.subdomains ?? "abc",
      maxZoom: cfg.maxZoom ?? 19,
      maxNativeZoom: cfg.maxNativeZoom,
      noWrap: true,
      updateWhenIdle: false,
      keepBuffer: 4,
    });
    baseLayerRef.current.addTo(map);
    baseLayerRef.current.bringToBack();

    // Cadastre overlay on orthophoto
    if (esknOverlayRef.current) {
      map.removeLayer(esknOverlayRef.current);
      esknOverlayRef.current = null;
    }
    if (base === "ortofoto") {
      esknOverlayRef.current = L.tileLayer(
        "https://kataster.skgeodesy.sk/eskn/rest/services/NR/kn_wmts_norm_wm/MapServer/WMTS/tile/1.0.0/NR_kn_wmts_norm_wm/default/GoogleMapsCompatible/{z}/{y}/{x}.png",
        {
          attribution: "© ÚGKK SR — KN",
          minZoom: 14,
          maxNativeZoom: 18,
          maxZoom: 22,
          updateWhenIdle: false,
          keepBuffer: 8,
        },
      );
      esknOverlayRef.current.addTo(map);
    }

    // Register E (UO) overlay — historical parcels on orthofoto
    if (uoRef.current) {
      map.removeLayer(uoRef.current);
      uoRef.current = null;
    }
    if (base === "ortofoto") {
      uoRef.current = L.tileLayer(
        "https://kataster.skgeodesy.sk/eskn/rest/services/NR/uo_wmts_orto_wm/MapServer/WMTS/tile/1.0.0/NR_uo_wmts_orto_wm/default/GoogleMapsCompatible/{z}/{y}/{x}.png",
        {
          attribution: "© ÚGKK SR — UO",
          minZoom: 14,
          maxNativeZoom: 18,
          maxZoom: 22,
          updateWhenIdle: false,
          keepBuffer: 8,
          opacity: 0.6,
        },
      );
      uoRef.current.addTo(map);
    }
  }, [base]);

  // Blind-map mask + Slovakia outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (borderRef.current) {
      map.removeLayer(borderRef.current);
      borderRef.current = null;
    }

    const skRing = getSlovakiaRing();
    const border = L.polyline(skRing, {
      color: "#15803d",
      weight: 2.5,
      opacity: 1,
      interactive: false,
    });
    border.addTo(map);
    borderRef.current = border;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showCadastre && !cadastreRef.current) {
      const wms = L.tileLayer.wms(
        "https://kataster.skgeodesy.sk/eskn/services/NR/kn_wms_norm/MapServer/WMSServer",
        {
          layers: "0,1,2,3,4,5,6,7,8,9,10,11,12",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          attribution: "© ÚGKK SR — Kataster nehnuteľností",
          opacity: cadastreOpacity,
        },
      );
      wms.addTo(map);
      cadastreRef.current = wms;
      // Make sure base stays under the cadastre overlay
      if (baseLayerRef.current) baseLayerRef.current.bringToBack();
    } else if (!showCadastre && cadastreRef.current) {
      map.removeLayer(cadastreRef.current);
      cadastreRef.current = null;
    } else if (showCadastre && cadastreRef.current) {
      cadastreRef.current.setOpacity(cadastreOpacity);
    }
  }, [showCadastre, cadastreOpacity]);

  // Keep border on top of base tiles but below markers
  useEffect(() => {
    if (borderRef.current) borderRef.current.bringToFront();
    if (markerRef.current) markerRef.current.setZIndexOffset(1000);
    if (uoRef.current) uoRef.current.bringToFront();
  }, [base, showCadastre]);

  // Search marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (marker) {
      const m = L.marker([marker.lat, marker.lng], { zIndexOffset: 1000 }).addTo(map);
      if (marker.label) m.bindPopup(marker.label).openPopup();
      markerRef.current = m;
      map.flyTo([marker.lat, marker.lng], marker.zoom ?? 16, { duration: 0.8 });
    }
  }, [marker]);

  return <div ref={containerRef} className="absolute inset-0" />;
});

export default MapView;
