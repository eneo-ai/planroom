import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Serve the pinned SDK's fonts locally and preserve its license in Docker.
const source = new URL(
  "../node_modules/@excalidraw/excalidraw/dist/prod/fonts/",
  import.meta.url,
);
const destination = new URL("../public/excalidraw/fonts/", import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(fileURLToPath(source), fileURLToPath(destination), {
  recursive: true,
});
await cp(
  new URL("../third-party/excalidraw/LICENSE", import.meta.url),
  new URL("../public/excalidraw/LICENSE", import.meta.url),
);
