import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../apps/web/dist/", import.meta.url);
async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) results.push(...(await walk(new URL(`${relative}/`, root), `${relative}/`)));
    else if (entry.name !== "sw.js") results.push(relative);
  }
  return results.sort();
}
const files = await walk(root);
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(new URL(file, root)));
const name = `strazh-sim-${hash.digest("hex").slice(0, 16)}`;
const shell = ["./", ...files.map((file) => `./${file}`)];
const worker = `const PREFIX = "strazh-sim-" + new URL(self.registration.scope).pathname + "-";
const CACHE = PREFIX + ${JSON.stringify(name)};
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL.map(path => new URL(path, self.registration.scope).href));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return await cache.match(event.request, { ignoreVary: true }) || (event.request.mode === 'navigate' ? await cache.match(new URL('./index.html', self.registration.scope).href, { ignoreVary: true }) : undefined) || Response.error();
    }
  })());
});
`;
await writeFile(new URL("sw.js", root), worker);
console.log(`Offline shell: ${files.length} files, cache ${name}`);
