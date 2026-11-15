// Compara "x.y.z" por partes numéricas — un string.localeCompare fallaría
// en casos como "1.9.0" vs "1.10.0" (10 < 9 alfabéticamente).
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export const isVersionLower = (current: string, other: string) => compareVersions(current, other) < 0;
