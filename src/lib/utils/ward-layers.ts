import type { WardHeatmapData } from "@/types/ticket";
/** Hide the confirmed city-wide demo overlay, without changing real ward colours or data. */
export function visibleWardLayers(wards: WardHeatmapData[]): WardHeatmapData[] {
  return wards.filter(ward => !(ward.ward_id === 104 && ward.ward_name === "Demo Ward — Live Zone" && ward.zone_name === "Live Demo"));
}
