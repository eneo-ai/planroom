import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Serve the pinned SDK's fonts/icons/translations locally, including in Docker.
const source = new URL("../node_modules/@tldraw/assets/", import.meta.url);
const destination = new URL("../public/tldraw/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const directory of ["fonts", "icons", "translations", "embed-icons"]) {
  await cp(
    fileURLToPath(new URL(directory, source)),
    fileURLToPath(new URL(directory, destination)),
    { recursive: true },
  );
}
