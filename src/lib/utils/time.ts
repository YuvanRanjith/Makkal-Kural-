export function formatTimeLeft(deadline: string, now = Date.now()) {
  const diff = new Date(deadline).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return "Expired";
  const minutes = Math.ceil(diff / 60000);
  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm left';
}
