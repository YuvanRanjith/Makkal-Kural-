export interface BrowseArea {wardId?:number;lat?:number;lng?:number;all?:boolean;}
// Roughly 3 km in each direction. Used only for discovery, never to authorize reports.
export function nearbyBounds(lat:number,lng:number){
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new Error('Invalid browsing location');
 const dy=3/111,dx=Math.min(180,3/(111*Math.max(0.01,Math.cos(lat*Math.PI/180))));
 return {south:Math.max(-90,lat-dy),north:Math.min(90,lat+dy),west:Math.max(-180,lng-dx),east:Math.min(180,lng+dx)};
}
