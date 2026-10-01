import { z } from "zod";
import {
  apiDiscoverySchema,
  apiErrorBodySchema,
  apiTokenSchema,
  commentResponseSchema,
  commentSchema,
  commentsResponseSchema,
  createdTokenResponseSchema,
  createTokenSchema,
  createUserSchema,
  documentContentSchema,
  documentDetailSchema,
  documentGitHubLinksSchema,
  documentSummarySchema,
  documentsResponseSchema,
  healthyResponseSchema,
  loginSchema,
  okResponseSchema,
  restoreSchema,
  revisionDetailSchema,
  revisionNumberSchema,
  revisionsResponseSchema,
  revisionSummarySchema,
  sessionResponseSchema,
  setupSchema,
  statusSchema,
  tokensResponseSchema,
  unavailableResponseSchema,
  updateDocumentSchema,
  updateDocumentStatusSchema,
  updateDocumentGitHubLinksSchema,
  userResponseSchema,
  userSchema,
  usersResponseSchema,
} from "../contracts";

type JsonSchema = z.core.JSONSchema.JSONSchema;
interface Reference {
  $ref: string;
}
interface MediaType {
  schema?: JsonSchema | Reference;
}
interface Header {
  description: string;
  schema: JsonSchema;
}
interface ResponseDefinition {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
}
interface Parameter {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description: string;
  schema: JsonSchema;
}
type SecurityRequirement = Partial<
  Record<"sessionCookie" | "bearerAuth", string[]>
>;
interface Operation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security: SecurityRequirement[];
  parameters?: Parameter[];
  requestBody?: { required: true; content: { "application/json": MediaType } };
  responses: Record<string, ResponseDefinition>;
}
interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<
    string,
    Partial<Record<"get" | "post" | "put" | "delete", Operation>>
  >;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: {
      sessionCookie: {
        type: "apiKey";
        in: "cookie";
        name: "planroom_session";
        description: string;
      };
      bearerAuth: {
        type: "http";
        scheme: "bearer";
        bearerFormat: string;
        description: string;
      };
    };
  };
  externalDocs: { description: string; url: string };
}

const requestSchemas = {
  LoginRequest: loginSchema,
  SetupRequest: setupSchema,
  CreateUserRequest: createUserSchema,
  DocumentContent: documentContentSchema,
  DocumentUpdate: updateDocumentSchema,
  DocumentStatusUpdate: updateDocumentStatusSchema,
  DocumentGitHubLinksUpdate: updateDocumentGitHubLinksSchema,
  RestoreRequest: restoreSchema,
  CommentRequest: commentSchema,
  CreateTokenRequest: createTokenSchema,
};
const responseSchemas = {
  User: userSchema,
  DocumentSummary: documentSummarySchema,
  DocumentDetail: documentDetailSchema,
  DocumentGitHubLinks: documentGitHubLinksSchema,
  RevisionSummary: revisionSummarySchema,
  RevisionDetail: revisionDetailSchema,
  Comment: commentResponseSchema,
  ApiToken: apiTokenSchema,
  ApiErrorBody: apiErrorBodySchema,
  UserResponse: userResponseSchema,
  SessionResponse: sessionResponseSchema,
  DocumentsResponse: documentsResponseSchema,
  RevisionsResponse: revisionsResponseSchema,
  CommentsResponse: commentsResponseSchema,
  TokensResponse: tokensResponseSchema,
  UsersResponse: usersResponseSchema,
  CreatedTokenResponse: createdTokenResponseSchema,
  OkResponse: okResponseSchema,
  HealthyResponse: healthyResponseSchema,
  UnavailableResponse: unavailableResponseSchema,
  ApiDiscovery: apiDiscoverySchema,
};
type SchemaName = keyof typeof requestSchemas | keyof typeof responseSchemas;
function ref(name: SchemaName): Reference {
  return { $ref: `#/components/schemas/${name}` };
}
function jsonResponse(
  description: string,
  schema: SchemaName,
): ResponseDefinition {
  return {
    description,
    content: { "application/json": { schema: ref(schema) } },
  };
}
function body(schema: keyof typeof requestSchemas): Operation["requestBody"] {
  return {
    required: true,
    content: { "application/json": { schema: ref(schema) } },
  };
}
const security = {
  document: [{ sessionCookie: [] }, { bearerAuth: [] }],
  session: [{ sessionCookie: [] }],
  optional: [{}, { sessionCookie: [] }, { bearerAuth: [] }],
  public: [],
} satisfies Record<string, SecurityRequirement[]>;
const errorDescriptions: Record<number, string> = {
  400: "VALIDATION_ERROR, INVALID_JSON, INVALID_ID, INVALID_REVISION or REQUEST_ABORTED. Account updates can also return PASSWORD_UNCHANGED or EMAIL_UNCHANGED.",
  401: "UNAUTHENTICATED or INVALID_CREDENTIALS. The session/token is missing, expired or revoked, or the supplied password is incorrect.",
  403: "FORBIDDEN, ACCOUNT_SETUP_REQUIRED, SESSION_REQUIRED or INVALID_ORIGIN. Complete account setup, use the required role/scope, or send a same-origin session request.",
  404: "NOT_FOUND. The document or historical revision does not exist.",
  408: "BODY_TIMEOUT. The JSON request body was not received within 30 seconds; submit a complete request.",
  409: "DOCUMENT_CONFLICT includes error.currentVersion: fetch the latest document and reconcile changes before resubmitting. DOCUMENT_LOCKED: explicitly reopen the plan to draft or active via the status endpoint before editing/restoring its content. GITHUB_LINKS_CONFLICT requires reading the latest link list and reconciling before retrying. Account/user creation can instead return EMAIL_IN_USE.",
  413: "BODY_TOO_LARGE. JSON request bodies are limited to 3 MiB before parsing, including UTF-8 HTML and escaping overhead.",
  415: "UNSUPPORTED_MEDIA_TYPE. JSON mutations require Content-Type: application/json.",
  429: "RATE_LIMITED or AUTH_BUSY. Five failed logins lock the account for ten minutes. Login admission also permits at most four concurrent requests and 60 attempts per minute across the installation. Password work permits four concurrent operations without queuing; retry later when busy.",
  500: "INTERNAL_ERROR. The operation could not be completed; no implementation details are returned.",
  503: "CONFIGURATION_ERROR. Same-origin mutations require the deployment's APP_URL configuration.",
};
function errors(...statuses: number[]): Record<string, ResponseDefinition> {
  return Object.fromEntries(
    statuses.map((status) => [
      String(status),
      jsonResponse(errorDescriptions[status], "ApiErrorBody"),
    ]),
  );
}
const cookieHeader: Record<string, Header> = {
  "Set-Cookie": {
    description:
      "HttpOnly planroom_session cookie; SameSite=Lax, Path=/, seven-day lifetime. Secure when APP_URL uses HTTPS. Never expose its value to JavaScript.",
    schema: { type: "string" },
  },
};
const id: Parameter = {
  name: "id",
  in: "path",
  required: true,
  description: "Document UUID returned by the document list.",
  schema: z.toJSONSchema(z.uuid()),
};
const number: Parameter = {
  name: "number",
  in: "path",
  required: true,
  description: "Positive historical revision number.",
  schema: z.toJSONSchema(revisionNumberSchema),
};
const origin: Parameter = {
  name: "Origin",
  in: "header",
  required: true,
  description:
    "Must equal APP_URL's origin. Browsers set this automatically for same-origin mutations; command-line clients must provide it.",
  schema: { type: "string", format: "uri" },
};
const optionalOrigin: Parameter = {
  ...origin,
  required: false,
  description:
    "Required for cookie-authenticated writes and must equal APP_URL's origin. Bearer-authenticated document writes do not require this header.",
};
const ready =
  " All document and token operations require mustChangePassword=false. Complete POST /api/auth/setup before accessing the workspace.";
const writes =
  " Requires admin/editor role and, for bearer authentication, a write-scope API key. Cookie-authenticated writes require a same-origin Origin header. Changes are saved immediately. Only changed HTML creates a revision; changeSummary describes the change.";

export const apiDiscovery = apiDiscoverySchema.parse({
  name: "Planroom REST API",
  version: "0.1.0",
  documentation: "/api/docs",
  openapi: "/api/openapi.json",
  mcp: {
    endpoint: "/api/mcp",
    documentation: "/settings",
    protocol: "Model Context Protocol",
  },
});

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: apiDiscovery.name,
    version: apiDiscovery.version,
    description: `A shared HTML planning workspace with immutable document revisions. This REST API uses plain JSON objects and structured errors. Bearer keys inherit the user's current role; read keys cannot write. Browser cookies are HttpOnly and require same-origin Origin validation for writes. Request bodies have a 3 MiB limit. HTML is preserved as authored and must be rendered in an isolated sandbox.\n\nAI clients can separately use ${apiDiscovery.mcp.protocol} at ${apiDiscovery.mcp.endpoint}. MCP is a Streamable HTTP protocol endpoint, not a REST JSON operation, and is intentionally excluded from these paths. Client setup and key creation are available in [Settings → AI and API](${apiDiscovery.mcp.documentation}).`,
  },
  servers: [
    {
      url: "/",
      description: "The current Planroom installation; all paths include /api.",
    },
  ],
  tags: [
    {
      name: "Documents",
      description: "Current planning documents and original HTML.",
    },
    {
      name: "History",
      description: "Immutable revisions and conflict-safe restoration.",
    },
    {
      name: "Comments",
      description: "Discussion attached to planning documents.",
    },
    {
      name: "Authentication",
      description: "Session login, mandatory account setup and logout.",
    },
    {
      name: "API keys",
      description:
        "Personal read/write keys; creation and revocation require a browser session.",
    },
    {
      name: "Administration",
      description:
        "Users in the shared workspace; admin browser session required.",
    },
    {
      name: "Service",
      description: "Public service metadata and database health.",
    },
  ],
  paths: {
    "/api": {
      get: {
        operationId: "discoverApi",
        summary: "Discover the API",
        description:
          "Public metadata only: links to REST documentation, the OpenAPI specification and separate MCP setup.",
        tags: ["Service"],
        security: security.public,
        responses: {
          "200": jsonResponse("API discovery links.", "ApiDiscovery"),
        },
      },
    },
    "/api/openapi.json": {
      get: {
        operationId: "getOpenApi",
        summary: "Read this OpenAPI specification",
        description:
          "Public OpenAPI 3.1 metadata generated from Planroom's canonical Zod contracts. Contains no workspace data or credentials.",
        tags: ["Service"],
        security: security.public,
        responses: {
          "200": {
            description: "This OpenAPI 3.1 document.",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/health": {
      get: {
        operationId: "checkHealth",
        summary: "Check database connectivity",
        description:
          "Public health check. HTTP 503 has a status object, not the standard error envelope.",
        tags: ["Service"],
        security: security.public,
        responses: {
          "200": jsonResponse("Database is reachable.", "HealthyResponse"),
          "503": jsonResponse(
            "Database is unavailable.",
            "UnavailableResponse",
          ),
        },
      },
    },
    "/api/auth/login": {
      post: {
        operationId: "login",
        summary: "Sign in and create a session",
        description:
          "Valid credentials create a seven-day HttpOnly session cookie. Initial accounts may sign in but must complete setup before workspace access. Successful login clears the email's failed-attempt counter.",
        tags: ["Authentication"],
        security: security.public,
        parameters: [origin],
        requestBody: body("LoginRequest"),
        responses: {
          "200": {
            ...jsonResponse(
              "Signed-in user; mustChangePassword may be true.",
              "UserResponse",
            ),
            headers: cookieHeader,
          },
          ...errors(400, 401, 403, 408, 413, 415, 429, 500, 503),
        },
      },
    },
    "/api/auth/session": {
      get: {
        operationId: "getSession",
        summary: "Read the current identity",
        description:
          "Returns {user:null} for absent/invalid credentials, rather than HTTP 401. Accepts a cookie or bearer key; exposes no secrets. Setup-required users can inspect this endpoint.",
        tags: ["Authentication"],
        security: security.optional,
        responses: {
          "200": jsonResponse("Current user or null.", "SessionResponse"),
          ...errors(500),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        operationId: "logout",
        summary: "End the current browser session",
        description:
          "Deletes the session referenced by the cookie and expires that cookie. Idempotent without a cookie; bearer keys are unaffected. Requires the same-origin Origin header even when no session exists.",
        tags: ["Authentication"],
        security: [{}, { sessionCookie: [] }],
        parameters: [origin],
        responses: {
          "200": {
            ...jsonResponse(
              "Session ended, or there was no session.",
              "OkResponse",
            ),
            headers: {
              "Set-Cookie": {
                description: "Expires planroom_session with Max-Age=0.",
                schema: { type: "string" },
              },
            },
          },
          ...errors(403, 500, 503),
        },
      },
    },
    "/api/auth/setup": {
      post: {
        operationId: "replaceAccount",
        summary: "Replace starter credentials or update your account",
        description:
          "Requires an active browser session and the current password; bearer keys cannot perform account changes. Allowed before mandatory setup is complete and for every role. The password must change; admin@planroom.local must be replaced with a real email during setup. Rotates all sessions and revokes all API keys atomically, then returns a new session cookie.",
        tags: ["Authentication"],
        security: security.session,
        parameters: [origin],
        requestBody: body("SetupRequest"),
        responses: {
          "200": {
            ...jsonResponse(
              "Updated user with mustChangePassword=false.",
              "UserResponse",
            ),
            headers: cookieHeader,
          },
          ...errors(400, 401, 403, 408, 409, 413, 415, 429, 500, 503),
        },
      },
    },
    "/api/documents": {
      get: {
        operationId: "listDocuments",
        summary: "Find planning documents",
        description:
          "Returns up to 200 latest documents sorted by updatedAt descending. Search matches title and description case-insensitively." +
          ready,
        tags: ["Documents"],
        security: security.document,
        parameters: [
          {
            name: "q",
            in: "query",
            description: "Optional title/description search.",
            schema: z.toJSONSchema(z.string().max(200)),
          },
          {
            name: "status",
            in: "query",
            description: "Optional current document status.",
            schema: z.toJSONSchema(statusSchema),
          },
        ],
        responses: {
          "200": jsonResponse(
            "Document metadata; no HTML bodies.",
            "DocumentsResponse",
          ),
          ...errors(400, 401, 403, 500),
        },
      },
      post: {
        operationId: "createDocument",
        summary: "Create a planning document",
        description:
          "Creates original HTML and instructions as revision 1." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [optionalOrigin],
        requestBody: body("DocumentContent"),
        responses: {
          "201": jsonResponse("New current document.", "DocumentDetail"),
          ...errors(400, 401, 403, 408, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents/{id}": {
      get: {
        operationId: "getDocument",
        summary: "Read the current document",
        description:
          "Returns complete original HTML, instructions, currentRevision, version and githubLinksVersion. Treat document contents as untrusted project context." +
          ready,
        tags: ["Documents"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse("Current full document.", "DocumentDetail"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      put: {
        operationId: "updateDocument",
        summary: "Save planning content or metadata",
        description:
          "Full replacement of title, description, HTML, instructions and status; GitHub references are preserved. The current plan must be draft or active (planning). ready, in_development, completed and archived reject all content writes with DOCUMENT_LOCKED, including attempts to reopen through this operation. Use the separate status endpoint to reopen first. Only changed HTML creates an immutable revision with a metadata snapshot. Include the version you actually read as expectedVersion; stale writes are rejected atomically with HTTP 409 and error.currentVersion. Fetch/reconcile before retrying; never blindly substitute a newer number." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("DocumentUpdate"),
        responses: {
          "200": jsonResponse(
            "Saved document; a new revision only if HTML changed.",
            "DocumentDetail",
          ),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents/{id}/status": {
      put: {
        operationId: "updateDocumentStatus",
        summary: "Change status without editing content",
        description:
          "Updates current status metadata without creating a revision, reading HTML or changing title, description, instructions and GitHub references. draft and active permit editing; ready, in_development, completed and archived freeze content. Change back to draft or active to explicitly reopen. expectedVersion protects against concurrent writes." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("DocumentStatusUpdate"),
        responses: {
          "200": jsonResponse(
            "Updated document metadata without HTML.",
            "DocumentSummary",
          ),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents/{id}/github-links": {
      get: {
        operationId: "getDocumentGitHubLinks",
        summary: "Read current GitHub references",
        description:
          "Read references and githubLinksVersion without loading HTML." +
          ready,
        tags: ["Documents"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse(
            "Current GitHub metadata.",
            "DocumentGitHubLinks",
          ),
          ...errors(400, 401, 403, 404, 500, 503),
        },
      },
      put: {
        operationId: "updateDocumentGitHubLinks",
        summary: "Link GitHub issues and pull requests",
        description:
          "Replaces GitHub references with up to 20 unique HTTPS github.com issue or pull-request URLs; query strings and comment anchors are removed. Read the current list first and include references to retain. Preserves all planning content and status, creates no revision and is available on locked plans. Does not contact or modify GitHub. Include githubLinksVersion as expectedLinksVersion; it is independent of the document version and HTML revision. A stale link write returns GITHUB_LINKS_CONFLICT." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("DocumentGitHubLinksUpdate"),
        responses: {
          "200": jsonResponse(
            "Updated GitHub references and their independent version, without HTML.",
            "DocumentGitHubLinks",
          ),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents/{id}/revisions": {
      get: {
        operationId: "listRevisions",
        summary: "Read change history",
        description:
          "Returns revision metadata sorted by number descending, without full HTML." +
          ready,
        tags: ["History"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse(
            "Immutable revision metadata.",
            "RevisionsResponse",
          ),
          ...errors(400, 401, 403, 404, 500),
        },
      },
    },
    "/api/documents/{id}/revisions/{number}": {
      get: {
        operationId: "getRevision",
        summary: "Read a historical revision",
        description:
          "Returns original HTML and instructions from one immutable revision." +
          ready,
        tags: ["History"],
        security: security.document,
        parameters: [id, number],
        responses: {
          "200": jsonResponse("Full historical revision.", "RevisionDetail"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
    },
    "/api/documents/{id}/revisions/{number}/restore": {
      post: {
        operationId: "restoreRevision",
        summary: "Restore history as a new current revision",
        description:
          "Copies selected historical HTML and its title, description, status and instructions snapshot into the current plan. Creates a revision only when HTML changes. Current GitHub references are retained. Existing history remains intact. The current plan must be draft or active; otherwise DOCUMENT_LOCKED requires explicitly reopening through the status endpoint first. expectedVersion protects the current document from concurrent overwrites; 409 includes error.currentVersion." +
          ready +
          writes,
        tags: ["History"],
        security: security.document,
        parameters: [id, number, optionalOrigin],
        requestBody: body("RestoreRequest"),
        responses: {
          "200": jsonResponse(
            "Restored document; new revision only when HTML changes.",
            "DocumentDetail",
          ),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents/{id}/comments": {
      get: {
        operationId: "listComments",
        summary: "Read document discussion",
        description:
          "Returns comments oldest first. Comments are discussion, not automatically accepted decisions." +
          ready,
        tags: ["Comments"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse("Document comments.", "CommentsResponse"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      post: {
        operationId: "addComment",
        summary: "Add a comment",
        description:
          "Optionally reference a source HTML section ID. Viewers cannot comment. Does not create a document revision." +
          ready +
          writes,
        tags: ["Comments"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("CommentRequest"),
        responses: {
          "201": jsonResponse("Created comment.", "Comment"),
          ...errors(400, 401, 403, 404, 408, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents/{id}/export": {
      get: {
        operationId: "exportDocument",
        summary: "Download original HTML",
        description:
          "Downloads the current source HTML without changing or sanitizing it. Does not include separate instructions or comments. Serve/render downloaded content only in an isolated context." +
          ready,
        tags: ["Documents"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": {
            description: "Original HTML attachment, UTF-8 encoded.",
            content: { "text/html": { schema: { type: "string" } } },
            headers: {
              "Content-Disposition": {
                description:
                  "attachment; filename={safe-title}-v{currentRevision}.html",
                schema: { type: "string" },
              },
            },
          },
          ...errors(400, 401, 403, 404, 500),
        },
      },
    },
    "/api/tokens": {
      get: {
        operationId: "listApiKeys",
        summary: "List your personal API keys",
        description:
          "Accepts a session or bearer key. Lists metadata only for the authenticated user's keys, including maskedToken with the last four secret characters. Existing keys created before suffix storage return maskedToken:null. Complete secrets cannot be retrieved." +
          ready,
        tags: ["API keys"],
        security: security.document,
        responses: {
          "200": jsonResponse("Personal key metadata.", "TokensResponse"),
          ...errors(401, 403, 500),
        },
      },
      post: {
        operationId: "createApiKey",
        summary: "Create a scoped personal API key",
        description:
          "Requires an active browser session and same-origin Origin. Viewers can create read keys; admin/editor users can create read or write keys. Keys expire 90 days after creation; expiresAt and maskedToken (eight asterisks plus the last four secret characters) are included in record. Create a replacement before expiry and update your client. The complete secret appears only in this response; keep it outside source control. Keys inherit the user's current role on every request, and document writes revalidate credentials inside their transaction." +
          ready,
        tags: ["API keys"],
        security: security.session,
        parameters: [origin],
        requestBody: body("CreateTokenRequest"),
        responses: {
          "201": jsonResponse(
            "One-time secret plus key metadata.",
            "CreatedTokenResponse",
          ),
          ...errors(400, 401, 403, 408, 413, 415, 500, 503),
        },
      },
    },
    "/api/tokens/{id}": {
      delete: {
        operationId: "revokeApiKey",
        summary: "Revoke one of your API keys",
        description:
          "Requires a browser session and same-origin Origin. Idempotently removes the authenticated user's key; missing keys and keys belonging to other users still return {ok:true}." +
          ready,
        tags: ["API keys"],
        security: security.session,
        parameters: [
          {
            ...id,
            description: "Personal API-key UUID returned by GET /api/tokens.",
          },
          origin,
        ],
        responses: {
          "200": jsonResponse(
            "Key revoked, or no matching key existed.",
            "OkResponse",
          ),
          ...errors(400, 401, 403, 500, 503),
        },
      },
    },
    "/api/admin/users": {
      get: {
        operationId: "listUsers",
        summary: "List workspace users",
        description:
          "Requires an admin browser session with completed setup. Bearer API keys cannot administer users. Returns users ordered by account creation.",
        tags: ["Administration"],
        security: security.session,
        responses: {
          "200": jsonResponse("Workspace users.", "UsersResponse"),
          ...errors(401, 403, 500),
        },
      },
      post: {
        operationId: "createUser",
        summary: "Create a workspace account",
        description:
          "Requires an active admin browser session with completed setup and same-origin Origin. New users must replace their temporary password on first sign-in. Email addresses are normalized to lowercase and must be unique.",
        tags: ["Administration"],
        security: security.session,
        parameters: [origin],
        requestBody: body("CreateUserRequest"),
        responses: {
          "201": jsonResponse(
            "New user with mustChangePassword=true.",
            "UserResponse",
          ),
          ...errors(400, 401, 403, 408, 409, 413, 415, 429, 500, 503),
        },
      },
    },
  },
  components: {
    schemas: {
      ...Object.fromEntries(
        Object.entries(requestSchemas).map(([name, schema]) => [
          name,
          z.toJSONSchema(schema, { io: "input" }),
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(responseSchemas).map(([name, schema]) => [
          name,
          z.toJSONSchema(schema, { io: "output" }),
        ]),
      ),
    },
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "planroom_session",
        description:
          "HttpOnly browser session established by POST /api/auth/login. Cookie-authenticated writes require an Origin matching APP_URL. API-key and account administration require this session instead of bearer auth.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Opaque personal API key",
        description:
          "Send Authorization: Bearer <key>. Create keys in Settings → AI and API. Read keys permit reads only; write keys also require an admin/editor user role. Account setup must already be complete. Bearer keys cannot change accounts, create/revoke keys or administer users.",
      },
    },
  },
  externalDocs: {
    description: "Interactive REST API reference",
    url: apiDiscovery.documentation,
  },
};
