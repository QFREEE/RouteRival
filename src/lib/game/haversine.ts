const EARTH_RADIUS_METERS = 6371e3;
const METERS_PER_MILE = 1609.344;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const phi1 = toRadians(aLat);
  const phi2 = toRadians(bLat);
  const deltaPhi = toRadians(bLat - aLat);
  const deltaLambda = toRadians(bLng - aLng);

  const h =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return haversineMeters(aLat, aLng, bLat, bLng) / METERS_PER_MILE;
}
