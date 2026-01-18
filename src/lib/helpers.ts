let debugEnabled = window.location.toString().includes("debug");

export function debug(...args: any[]) {
    if (debugEnabled) {
        console.debug(...args);
    }
}