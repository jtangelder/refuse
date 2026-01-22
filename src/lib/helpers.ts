const debugEnabled = window.location.toString().includes('debug');

export function debug(...args: unknown[]) {
  if (debugEnabled) {
    console.debug(...args);
  }
}
