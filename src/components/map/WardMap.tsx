"use client";

import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { WardHeatmapData } from "@/types/ticket";
import {useEffect} from "react";
import {latLngBounds,geoJSON} from "leaflet";
import type { PathOptions } from "leaflet";

interface WardMapProps {
  wards: WardHeatmapData[];
  center?:[number,number];
  onSelectWard: (ward: WardHeatmapData) => void;
}

function healthColor(score: number): string {
  if (score >= 70) return "#16a34a";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function Focus({wards,center}:{wards:WardHeatmapData[];center?:[number,number]}){const map=useMap();useEffect(()=>{if(center){map.setView(center,14);return;}const bounds=latLngBounds([]);for(const ward of wards){try{bounds.extend(geoJSON(JSON.parse(ward.boundary_geojson)).getBounds());}catch{}}if(bounds.isValid())map.fitBounds(bounds,{padding:[20,20],maxZoom:15});},[wards,center,map]);return null;}
export default function WardMap({ wards, center, onSelectWard }: WardMapProps) {
  return (
    <MapContainer center={[13.0827, 80.2707]} zoom={12} className="w-full h-full">
      <Focus wards={wards} center={center}/>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      {wards.map((ward) => {
        let geoJson;
        try {
          geoJson = JSON.parse(ward.boundary_geojson);
        } catch {
          return null;
        }

        const style: PathOptions = {
          fillColor: healthColor(ward.health_score),
          fillOpacity: 0.5,
          color: healthColor(ward.health_score),
          weight: 2,
        };

        return (
          <GeoJSON
            key={ward.ward_id}
            data={geoJson}
            style={style}
            eventHandlers={{
              click: () => onSelectWard(ward),
            }}
          />
        );
      })}
    </MapContainer>
  );
}
