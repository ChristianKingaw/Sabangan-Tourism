"use client";

import { useEffect } from "react";
import embeddedTrailGeoJson from "../assets/data/gagayam-trail-run.json";

const ROUTE_JSON_URLS = ["/assets/data/gagayam-trail-run.json", "/gagayam-trail-run.json"];
const ROUTE_KML_URLS = ["/assets/data/gagayam-trail-run.kml", "/Gagayam Trail Run.kml"];
const START_COORD = [16.93309, 120.90237];
const END_COORD = [17.0055525, 120.922315];
const TRAIL_BOUNDS = [
  [16.93309, 120.8983725], // Southwest
  [17.0055525, 120.922315] // Northeast
];

function safeRemoveMap(mapInstance) {
  if (!mapInstance) {
    return null;
  }

  try {
    mapInstance.off();
  } catch {}

  try {
    mapInstance.eachLayer((layer) => {
      try {
        if (layer && typeof layer.off === "function") {
          layer.off();
        }
      } catch {}

      try {
        mapInstance.removeLayer(layer);
      } catch {}
    });
  } catch {}

  try {
    mapInstance.remove();
  } catch {}

  return null;
}

function appendUniquePoint(segment, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  const previousPoint = segment[segment.length - 1];
  if (previousPoint && previousPoint[0] === latitude && previousPoint[1] === longitude) {
    return;
  }

  segment.push([latitude, longitude]);
}

function addNamedMarker(leaflet, map, latLng, label, color) {
  const markerHtml = [
    '<div style="position: relative; display: inline-flex; align-items: center; gap: 8px;">',
    `<span style="width: 16px; height: 16px; border-radius: 999px; background: ${color}; border: 3px solid #ffffff; box-shadow: 0 0 0 2px rgba(0,0,0,0.35);"></span>`,
    `<span style="padding: 2px 8px; border-radius: 999px; background: rgba(17,24,39,0.9); color: #ffffff; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: 0.04em; text-transform: uppercase;">${label}</span>`,
    "</div>"
  ].join("");

  return leaflet
    .marker(latLng, {
      icon: leaflet.divIcon({
        className: "trail-run-point-marker",
        html: markerHtml,
        iconSize: [84, 20],
        iconAnchor: [8, 10]
      }),
      keyboard: false
    })
    .addTo(map);
}

function parseTrailGeoJson(geoJsonData) {
  const segments = [];
  const features = Array.isArray(geoJsonData && geoJsonData.features) ? geoJsonData.features : [];

  features.forEach((feature) => {
    const geometry = feature && feature.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) {
      return;
    }

    if (geometry.type === "LineString") {
      const segment = [];
      geometry.coordinates.forEach((coordinatePair) => {
        if (!Array.isArray(coordinatePair)) {
          return;
        }
        appendUniquePoint(segment, Number(coordinatePair[1]), Number(coordinatePair[0]));
      });
      if (segment.length > 1) {
        segments.push(segment);
      }
      return;
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((lineCoordinates) => {
        if (!Array.isArray(lineCoordinates)) {
          return;
        }
        const segment = [];
        lineCoordinates.forEach((coordinatePair) => {
          if (!Array.isArray(coordinatePair)) {
            return;
          }
          appendUniquePoint(segment, Number(coordinatePair[1]), Number(coordinatePair[0]));
        });
        if (segment.length > 1) {
          segments.push(segment);
        }
      });
    }
  });

  return segments;
}

async function loadTrailSegments() {
  const bundledSegments = parseTrailGeoJson(embeddedTrailGeoJson);
  if (bundledSegments.length) {
    return bundledSegments;
  }

  if (typeof window !== "undefined" && window.GAGAYAM_TRAIL_GEOJSON) {
    const embeddedSegments = parseTrailGeoJson(window.GAGAYAM_TRAIL_GEOJSON);
    if (embeddedSegments.length) {
      return embeddedSegments;
    }
  }

  let lastError = null;
  for (const routeUrl of ROUTE_JSON_URLS) {
    try {
      const response = await fetch(routeUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const jsonData = await response.json();
      const segments = parseTrailGeoJson(jsonData);
      if (!segments.length) {
        throw new Error(`No route coordinates found in ${routeUrl}.`);
      }
      return segments;
    } catch (error) {
      lastError = error;
    }
  }

  for (const routeUrl of ROUTE_KML_URLS) {
    try {
      const response = await fetch(routeUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const kmlText = await response.text();
      const coordinateBlocks = [...kmlText.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/gi)];
      const segments = [];

      coordinateBlocks.forEach((coordinateBlock) => {
        const rawCoordinates = (coordinateBlock[1] || "").trim().split(/\s+/);
        const segment = [];

        rawCoordinates.forEach((point) => {
          const [longitudeText, latitudeText] = point.split(",");
          appendUniquePoint(segment, Number(latitudeText), Number(longitudeText));
        });

        if (segment.length > 1) {
          segments.push(segment);
        }
      });

      if (!segments.length) {
        throw new Error(`No route coordinates found in ${routeUrl}.`);
      }

      return segments;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load trail route data.");
}

export default function GagayamTrailLeafletMount() {
  useEffect(() => {
    const trailMapEl = document.querySelector("#trail-map-canvas");
    const trailMapStatusEl = document.querySelector("[data-trail-map-status]");
    const trailDistanceEl = document.querySelector("[data-trail-distance]");
    const trailMapToggleEl = document.querySelector("[data-trail-map-toggle]");
    const trailMapModalEl = document.querySelector("#trailMapModal");

    if (!trailMapEl) {
      return undefined;
    }

    if (trailMapEl.dataset.mapControllerAttached === "true") {
      return undefined;
    }
    trailMapEl.dataset.mapControllerAttached = "true";

    const setTrailMapStatus = (message, state) => {
      if (!trailMapStatusEl) {
        return;
      }
      trailMapStatusEl.textContent = message;
      if (state) {
        trailMapStatusEl.setAttribute("data-state", state);
      } else {
        trailMapStatusEl.removeAttribute("data-state");
      }
    };

    let isDisposed = false;
    let trailMap = null;
    let trailBounds = null;
    let isMapLoading = false;
    let isMapLoaded = false;

    const revealMapCanvas = () => {
      trailMapEl.classList.add("is-visible");
      trailMapEl.setAttribute("aria-hidden", "false");
    };

    const syncTrailViewport = () => {
      if (
        !trailMap ||
        !trailBounds ||
        !trailMapEl.isConnected ||
        typeof trailBounds.isValid !== "function" ||
        !trailBounds.isValid()
      ) {
        return;
      }

      trailMap.invalidateSize();
      trailMap.fitBounds(trailBounds, { padding: [24, 24] });
    };

    const handleViewportResize = () => {
      window.requestAnimationFrame(() => {
        syncTrailViewport();
      });
    };

    const handleModalShown = () => {
      if (trailMapToggleEl) {
        trailMapToggleEl.setAttribute("aria-expanded", "true");
      }
      window.requestAnimationFrame(() => {
        syncTrailViewport();
      });
    };

    const handleModalHidden = () => {
      if (trailMapToggleEl) {
        trailMapToggleEl.setAttribute("aria-expanded", "false");
      }
    };

    const setToggleState = ({ text, disabled = false, loading = false, loaded = false }) => {
      if (!trailMapToggleEl) {
        return;
      }
      // Always keep the button text as 'view interactive map'
      trailMapToggleEl.textContent = 'view interactive map';
      trailMapToggleEl.disabled = disabled;
      trailMapToggleEl.classList.toggle("is-loading", loading);
      trailMapToggleEl.classList.toggle("is-loaded", loaded);
    };

    const loadMapPreview = async () => {
      if (isDisposed || isMapLoading) {
        return;
      }

      if (isMapLoaded) {
        revealMapCanvas();
        syncTrailViewport();
        return;
      }

      isMapLoading = true;
      setToggleState({ text: "Loading Map...", disabled: true, loading: true });

      const leafletModule = await import("leaflet");
      const leaflet = leafletModule.default || leafletModule;

      setTrailMapStatus("Loading trail route...", "loading");
      trailMapEl.classList.remove("is-error");
      trailMapEl.textContent = "";
      revealMapCanvas();

      const segments = await loadTrailSegments();
      if (isDisposed || !trailMapEl.isConnected) {
        isMapLoading = false;
        return;
      }

      trailMap = leaflet.map(trailMapEl, {
        scrollWheelZoom: false,
        preferCanvas: true
      });

      if (isDisposed) {
        trailMap = safeRemoveMap(trailMap);
        isMapLoading = false;
        return;
      }

      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(trailMap);

      const trailLayerGroup = leaflet.featureGroup();
      let pointCount = 0;
      let distanceMeters = 0;

      segments.forEach((segment) => {
        pointCount += segment.length;

        for (let index = 1; index < segment.length; index += 1) {
          const previousPoint = leaflet.latLng(segment[index - 1][0], segment[index - 1][1]);
          const currentPoint = leaflet.latLng(segment[index][0], segment[index][1]);
          distanceMeters += previousPoint.distanceTo(currentPoint);
        }

        leaflet.polyline(segment, {
          color: "#f08a24",
          weight: 4,
          opacity: 0.95
        }).addTo(trailLayerGroup);
      });

      if (isDisposed || !trailMap) {
        trailMap = safeRemoveMap(trailMap);
        return;
      }

      trailLayerGroup.addTo(trailMap);

      const firstPoint = START_COORD;
      const lastPoint = END_COORD;

      addNamedMarker(leaflet, trailMap, firstPoint, "Start", "#22c55e");
      addNamedMarker(leaflet, trailMap, lastPoint, "Finish", "#f97316");

      if (!isDisposed && trailMap) {
        try {
          trailMap.fitBounds(TRAIL_BOUNDS, { padding: [24, 24] });
          trailBounds = leaflet.latLngBounds(TRAIL_BOUNDS);
        } catch {
          const layerBounds = trailLayerGroup.getBounds();
          const hasValidBounds = layerBounds && typeof layerBounds.isValid === "function" && layerBounds.isValid();
          if (hasValidBounds) {
            trailMap.fitBounds(layerBounds, { padding: [24, 24] });
            trailBounds = layerBounds;
          } else {
            trailMap.setView(firstPoint, 13);
            trailBounds = leaflet.latLngBounds([firstPoint, lastPoint]);
          }
        }
      }

      if (trailDistanceEl) {
        trailDistanceEl.textContent = '15';
        if (trailDistanceEl.parentElement) {
          trailDistanceEl.parentElement.style.display = '';
        }
      }

      setTrailMapStatus("Route loaded successfully.", "ready");
      isMapLoaded = true;
      isMapLoading = false;
      setToggleState({ text: "view interactive map", loaded: true });
      window.addEventListener("resize", handleViewportResize, { passive: true });
      window.requestAnimationFrame(() => {
        syncTrailViewport();
      });
    };

    const handleMapToggleClick = () => {
      loadMapPreview().catch((error) => {
        console.error("Trail map load failed:", error);
        isMapLoading = false;
        isMapLoaded = false;
        trailBounds = null;
        trailMap = safeRemoveMap(trailMap);
        trailMapEl.classList.add("is-error");
        trailMapEl.textContent = "Unable to load the trail map route data.";
        setTrailMapStatus("Failed to load route data.", "error");
        setToggleState({ text: "Retry Map Preview" });
      });
    };

    if (trailMapToggleEl) {
      trailMapToggleEl.addEventListener("click", handleMapToggleClick);
    } else {
      handleMapToggleClick();
    }

    if (trailMapModalEl) {
      trailMapModalEl.addEventListener("shown.bs.modal", handleModalShown);
      trailMapModalEl.addEventListener("hidden.bs.modal", handleModalHidden);
    }

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", handleViewportResize);
      if (trailMapToggleEl) {
        trailMapToggleEl.removeEventListener("click", handleMapToggleClick);
      }
      if (trailMapModalEl) {
        trailMapModalEl.removeEventListener("shown.bs.modal", handleModalShown);
        trailMapModalEl.removeEventListener("hidden.bs.modal", handleModalHidden);
      }
      trailMap = safeRemoveMap(trailMap);
      trailBounds = null;
      delete trailMapEl.dataset.mapControllerAttached;
    };
  }, []);

  return null;
}
