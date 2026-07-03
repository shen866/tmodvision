import path from 'path';

/**
 * Reject names containing path separators or traversal sequences.
 * Used for user-controlled segments that end up in filesystem paths.
 */
export function assertSafeName(name: string, label = 'name'): void {
  if (!name) throw new Error(`${label} is required`);
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`${label} contains invalid characters`);
  }
  if (name.includes('..')) {
    throw new Error(`${label} contains invalid sequence`);
  }
  if (name.includes('\0')) {
    throw new Error(`${label} contains invalid characters`);
  }
}

/**
 * Steam workshop IDs are purely numeric.
 */
export function assertWorkshopId(id: string): void {
  if (!/^\d+$/.test(id)) {
    throw new Error('Invalid workshop ID');
  }
}

/**
 * Ensure a resolved path stays inside the given base directory.
 */
export function assertWithinBase(target: string, base: string): void {
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes allowed directory');
  }
}

/**
 * Restrict a user-supplied relative directory so it cannot escape `base`
 * via absolute paths or `..` traversal. Returns the resolved absolute path.
 */
export function resolveSubPath(base: string, input: string | undefined, fallback: string): string {
  const raw = input || fallback;
  // Block absolute paths — they would ignore `base` entirely.
  if (path.isAbsolute(raw)) {
    throw new Error('Absolute paths are not allowed');
  }
  const resolved = path.resolve(base, raw);
  assertWithinBase(resolved, base);
  return resolved;
}
