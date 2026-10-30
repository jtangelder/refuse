export function isDebugEnabled(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
}

export function debug(msg: string | (() => string), ...args: unknown[]): void {
  if (isDebugEnabled()) {
    const resolved = typeof msg === 'function' ? msg() : msg;
    console.log(resolved, ...args);
  }
}
