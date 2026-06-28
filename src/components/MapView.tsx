import { useEffect, useRef } from "react";
import L from "leaflet";

type BaseLayer = "osm" | "satellite" | "topo";

interface MapViewProps {
  base: BaseLayer;
  showCadastre: boolean;
  cadastreOpacity?: number;
  showOrtho: boolean;
  orthoOpacity?: number;
  onCoords?: (lat: number, lng: number) => void;
}

// Fix default marker icons in Leaflet (CDN)
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

const BASE_LAYERS: Record<BaseLayer, { url: string; attribution: string; subdomains?: string }> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenTopoMap (CC-BY-SA)",
    subdomains: "abc",
  },
};

export default function MapView({ base, showCadastre, cadastreOpacity = 0.85, showOrtho, orthoOpacity = 0.95, onCoords }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const cadastreRef = useRef<L.TileLayer.WMS | null>(null);
  const orthoRef = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [49.27, 19.3],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
    });
    mapRef.current = map;

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 160 }).addTo(map);

    map.on("mousemove", (e) => onCoords?.(e.latlng.lat, e.latlng.lng));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    const cfg = BASE_LAYERS[base];
    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      subdomains: cfg.subdomains ?? "abc",
      maxZoom: 19,
    });
    layer.addTo(map);
    layer.bringToBack();
    baseLayerRef.current = layer;
  }, [base]);

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
        }
      );
      wms.addTo(map);
      cadastreRef.current = wms;
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
        }
      );
      wms.addTo(map);
      orthoRef.current = wms;
    } else if (!showOrtho && orthoRef.current) {
      map.removeLayer(orthoRef.current);
      orthoRef.current = null;
    } else if (showOrtho && orthoRef.current) {
      orthoRef.current.setOpacity(orthoOpacity);
    }
  }, [showOrtho, orthoOpacity]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
