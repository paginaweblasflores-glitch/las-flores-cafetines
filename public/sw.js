// Service worker mínimo: hace que el sistema se pueda instalar como aplicativo.
// No guarda nada en caché: todo se pide siempre al servidor (los datos deben estar al día).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
