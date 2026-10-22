/** Request-time clock for server components (keeps impure calls out of render bodies). */
export function nowMs(): number {
  return Date.now();
}
