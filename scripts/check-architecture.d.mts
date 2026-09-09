export const LAYERS: Record<string, { prefix: string; allowed: string[] }>;
export const PURE: string[];
export function layerOf(rel: string): string | null;
export function evaluateImport(fromRel: string, specifier: string): string | null;
export function specifiersOf(source: string): string[];
export function checkArchitecture(root?: string): Promise<string[]>;
