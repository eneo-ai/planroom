import type { ComponentProps } from "react";
import type { ApiReferenceReact } from "@scalar/api-reference-react";

/** Every request made by the reference uses its own explicit authentication. */
export function createApiReferenceFetch(
  origin: string,
  send: typeof fetch = fetch,
): typeof fetch {
  const installation = new URL(origin);
  return async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      installation,
    );
    if (
      url.origin !== installation.origin ||
      url.username ||
      url.password ||
      !(url.pathname === "/api" || url.pathname.startsWith("/api/"))
    ) {
      throw new Error(
        "API-dokumentationen kan bara anropa den här Planroom-installationens /api-adresser.",
      );
    }
    const request = new Request(input instanceof Request ? input : url, {
      ...init,
      credentials: "omit",
      redirect: "error",
      mode: "same-origin",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    return send(request);
  };
}

export function apiReferenceConfiguration(
  origin: string,
): ComponentProps<typeof ApiReferenceReact>["configuration"] {
  return {
    url: "/api/openapi.json",
    customFetch: createApiReferenceFetch(origin),
    persistAuth: false,
    authentication: { preferredSecurityScheme: "bearerAuth" },
    hideClientButton: true,
    telemetry: false,
    agent: { disabled: true },
    withDefaultFonts: false,
    showDeveloperTools: "never",
    hideDarkModeToggle: true,
    darkMode: false,
    layout: "modern",
    showSidebar: true,
    documentDownloadType: "json",
  };
}
