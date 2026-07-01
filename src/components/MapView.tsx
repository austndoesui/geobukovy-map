import { useEffect, useRef } from "react";
import L from "leaflet";
import slovakiaGeo from "@/data/slovakia.geo.json";

type BaseLayer = "osm" | "satellite" | "topo";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  zoom?: number;
}

interface MapViewProps {
  base: BaseLayer;
  showCadastre: boolean;
  cadastreOpacity?: number;
  showOrtho: boolean;
  orthoOpacity?: number;
  marker?: MapMarker | null;
  onCoords?: (lat: number, lng: number) => void;
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

const BASE_LAYERS: Record<BaseLayer, { url: string; attribution: string; subdomains?: string; maxZoom?: number }> = {
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
    maxZoom: 17,
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

export default function MapView({
  base,
  showCadastre,
  cadastreOpacity = 0.85,
  showOrtho,
  orthoOpacity = 0.95,
  marker,
  onCoords,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const cadastreRef = useRef<L.TileLayer.WMS | null>(null);
  const orthoRef = useRef<L.TileLayer.WMS | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const maskRef = useRef<L.Polygon | null>(null);
  const borderRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [48.7, 19.5],
      zoom: 8,
      minZoom: 7,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
      maxBounds: SK_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    });
    mapRef.current = map;

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 160 }).addTo(map);

    map.fitBounds(SK_BOUNDS, { padding: [10, 10] });

    map.on("mousemove", (e) => onCoords?.(e.latlng.lat, e.latlng.lng));
    map.on("click", (e) => identifyParcel(map, e.latlng));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base tile layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    const cfg = BASE_LAYERS[base];
    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      subdomains: cfg.subdomains ?? "abc",
      maxZoom: cfg.maxZoom ?? 19,
      noWrap: true,
    });
    layer.addTo(map);
    layer.bringToBack();
    baseLayerRef.current = layer;
  }, [base]);

  // Blind-map mask + Slovakia outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (maskRef.current) {
      map.removeLayer(maskRef.current);
      maskRef.current = null;
    }
    if (borderRef.current) {
      map.removeLayer(borderRef.current);
      borderRef.current = null;
    }

    const skRing = getSlovakiaRing();
    // Outer ring covers the whole world (Leaflet [lat, lng])
    const worldRing: [number, number][] = [
      [-85, -180],
      [-85, 180],
      [85, 180],
      [85, -180],
    ];

    const mask = L.polygon([worldRing, skRing], {
      stroke: false,
      fillColor: "#9aa4ab",
      fillOpacity: 1,
      interactive: false,
    } as L.PolylineOptions & { fillRule?: string });
    // ensure even-odd fill so the SK ring punches a clean hole
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mask.options as any).fillRule = "evenodd";
    mask.addTo(map);
    maskRef.current = mask;

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
      // Make sure mask stays under the cadastre overlay
      if (maskRef.current) maskRef.current.bringToBack();
      if (baseLayerRef.current) baseLayerRef.current.bringToBack();
    } else if (!showCadastre && cadastreRef.current) {
      map.removeLayer(cadastreRef.current);
      cadastreRef.current = null;
    } else if (showCadastre && cadastreRef.current) {
      cadastreRef.current.setOpacity(cadastreOpacity);
    }
  }, [showCadastre, cadastreOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showOrtho && !orthoRef.current) {
      const wms = L.tileLayer.wms(
        "https://ortofoto.skgeodesy.sk/ortofoto2023/services/Ortofotomozaika/MapServer/WMSServer",
        {
          layers: "0",
          format: "image/jpeg",
          transparent: false,
          version: "1.3.0",
          attribution: "© ÚGKK SR — Ortofotomozaika",
          opacity: orthoOpacity,
        },
      );
      wms.addTo(map);
      orthoRef.current = wms;
      if (maskRef.current) maskRef.current.bringToBack();
      if (baseLayerRef.current) baseLayerRef.current.bringToBack();
    } else if (!showOrtho && orthoRef.current) {
      map.removeLayer(orthoRef.current);
      orthoRef.current = null;
    } else if (showOrtho && orthoRef.current) {
      orthoRef.current.setOpacity(orthoOpacity);
    }
  }, [showOrtho, orthoOpacity]);

  // Keep mask + border on top of base tiles but below markers
  useEffect(() => {
    if (maskRef.current) maskRef.current.bringToFront();
    if (borderRef.current) borderRef.current.bringToFront();
    if (markerRef.current) markerRef.current.setZIndexOffset(1000);
  }, [base, showCadastre, showOrtho]);

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
}
