"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "600px", width: "100%", display: "grid", placeItems: "center" }}>
      Loading map...
    </div>
  )
});

export default function MapNoSSR() {
  return <Map />;
}
