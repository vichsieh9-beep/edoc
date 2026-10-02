// Explicit DOM dependency; never install a Worker document on globalThis.
export const browserContext = () => ({document: document.implementation.createHTMLDocument('')});
