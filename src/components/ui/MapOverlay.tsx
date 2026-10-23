"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pinIcon = L.divIcon({
  html: `<div style="font-size: 32px; transform: translate(-50%, -100%);">📍</div>`,
  className: "",
  iconSize: [0, 0],
});

interface DraggablePinProps {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

function DraggableMarker({ lat, lng, onChange, readOnly }: DraggablePinProps) {
  const [position, setPosition] = useState<[number, number]>([lat, lng]);

  useMapEvents({
    click(e) {
      if (readOnly) return;
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      onChange?.(lat, lng);
    },
  });

  return (
    <Marker
      position={position}
      icon={pinIcon}
      draggable={!readOnly}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          setPosition([pos.lat, pos.lng]);
          onChange?.(pos.lat, pos.lng);
        },
      }}
    />
  );
}

interface MapOverlayProps {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

export default function MapOverlay({ lat, lng, onChange, readOnly }: MapOverlayProps) {
  return (
    <div className="w-full h-48 rounded-lg overflow-hidden border">
      <MapContainer center={[lat, lng]} zoom={17} className="w-full h-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <DraggableMarker lat={lat} lng={lng} onChange={onChange} readOnly={readOnly} />
      </MapContainer>
    </div>
  );
}
