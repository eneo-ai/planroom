import { describe, expect, it } from "vitest";
import {
  apiReferenceConfiguration,
  createApiReferenceFetch,
} from "../src/client/api-reference";

const origin = "https://planroom.example:8443";

describe("API reference transport", () => {
  it("preserves the explicit bearer and body while omitting cookies and rejecting redirects", async () => {
    const sent: Request[] = [];
    const send: typeof fetch = async (input, init) => {
      sent.push(new Request(input, init));
      return new Response("{}", {
        headers: { "Content-Type": "application/json" },
      });
    };
    const request = new Request(`${origin}/api/documents`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user-supplied-key",
        "Content-Type": "application/json",
      },
      body: '{"title":"Plan"}',
      credentials: "include",
      redirect: "follow",
    });
    await createApiReferenceFetch(origin, send)(request, {
      credentials: "include",
      redirect: "follow",
    });
    expect(sent[0]?.url).toBe(`${origin}/api/documents`);
    expect(sent[0]?.credentials).toBe("omit");
    expect(sent[0]?.redirect).toBe("error");
    expect(sent[0]?.mode).toBe("same-origin");
    expect(sent[0]?.referrerPolicy).toBe("no-referrer");
    expect(sent[0]?.headers.get("Authorization")).toBe(
      "Bearer user-supplied-key",
    );
    expect(await sent[0]?.text()).toBe('{"title":"Plan"}');
  });

  it("resolves the OpenAPI definition on the current installation without session cookies", async () => {
    const sent: Request[] = [];
    const send: typeof fetch = async (input, init) => {
      sent.push(new Request(input, init));
      return new Response("{}");
    };
    await createApiReferenceFetch(origin, send)("/api/openapi.json");
    expect(sent[0]?.url).toBe(`${origin}/api/openapi.json`);
    expect(sent[0]?.credentials).toBe("omit");
    expect(sent[0]?.headers.has("Authorization")).toBe(false);
  });

  it.each([
    "https://other.example/api/documents",
    "http://planroom.example:8443/api/documents",
    "https://planroom.example/api/documents",
    "/settings",
    "/api/../settings",
    "/api-other/documents",
    "https://name:secret@planroom.example:8443/api/documents",
  ])(
    "rejects an unsafe destination before sending credentials: %s",
    async (destination) => {
      let sent = false;
      const send: typeof fetch = async () => {
        sent = true;
        return new Response();
      };
      await expect(
        createApiReferenceFetch(origin, send)(destination, {
          headers: { Authorization: "Bearer user-supplied-key" },
        }),
      ).rejects.toThrow("API-dokumentationen kan bara anropa");
      expect(sent).toBe(false);
    },
  );

  it("keeps authentication in memory and disables external Scalar services", () => {
    expect(apiReferenceConfiguration(origin)).toMatchObject({
      url: "/api/openapi.json",
      persistAuth: false,
      authentication: { preferredSecurityScheme: "bearerAuth" },
      hideClientButton: true,
      telemetry: false,
      withDefaultFonts: false,
      agent: { disabled: true },
      showDeveloperTools: "never",
    });
    expect(apiReferenceConfiguration(origin)).not.toHaveProperty("proxyUrl");
    expect(apiReferenceConfiguration(origin)).not.toHaveProperty("mcp");
    expect(apiReferenceConfiguration(origin)).not.toHaveProperty("pluginUrls");
    expect(apiReferenceConfiguration(origin)).toHaveProperty("authentication", {
      preferredSecurityScheme: "bearerAuth",
    });
  });
});
