"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

const DEFAULT_CENTER = [16.95, 120.9];
const KML_URLS = ["/Gagayam Trail Run.kml", "/assets/data/gagayam-trail-run.kml"];

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return undefined;
    }

    let isDisposed = false;

    // Fix default marker icons when Leaflet runs inside Next.js bundling.
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
    });

    const map = L.map(mapContainerRef.current).setView(DEFAULT_CENTER, 13);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const loadKml = async () => {
      const omnivoreModule = await import("leaflet-omnivore");
      const omnivore = omnivoreModule.default || omnivoreModule;

      for (const kmlUrl of KML_URLS) {
        if (isDisposed || !mapRef.current) {
          return;
        }

        const kmlLayer = omnivore.kml(kmlUrl);

        await new Promise((resolve, reject) => {
          kmlLayer
            .on("ready", function onReady() {
              const bounds = this.getBounds();
              if (bounds && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [24, 24] });
              }
              resolve();
            })
            .on("error", reject);
          kmlLayer.addTo(map);
        }).catch(() => {
          map.removeLayer(kmlLayer);
        });

        if (map.hasLayer(kmlLayer)) {
          return;
        }
      }
    };

    loadKml().catch(() => {
      // Keep the basemap visible even when KML fails.
    });

    return () => {
      isDisposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={mapContainerRef} style={{ height: "600px", width: "100%" }} />;
}
