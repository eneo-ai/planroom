import { z } from "zod";
import {
  updateCanvasSchema,
  documentCanvasSchema,
  projectSharingSchema,
  updateProjectSharingSchema,
  publicShareTokenSchema,
  sharedProjectSchema,
  sharedDocumentSchema,
  sharedDocumentsResponseSchema,
  apiDiscoverySchema,
  createDocumentSchema,
  createProjectSchema,
  namedEntityInputSchema,
  updateNamedEntitySchema,
  setTeamMemberSchema,
  teamSchema,
  teamsResponseSchema,
  projectSchema,
  projectsResponseSchema,
  membersResponseSchema,
  apiErrorBodySchema,
  apiTokenSchema,
  commentResponseSchema,
  commentSchema,
  commentsResponseSchema,
  createdTokenResponseSchema,
  createTokenSchema,
  createUserSchema,
  passwordResetResponseSchema,
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
  ProjectSharingUpdate: updateProjectSharingSchema,
  CanvasUpdate: updateCanvasSchema,
  LoginRequest: loginSchema,
  SetupRequest: setupSchema,
  CreateUserRequest: createUserSchema,
  DocumentContent: documentContentSchema,
  DocumentCreate: createDocumentSchema,
  CreateProject: createProjectSchema,
  NamedEntityInput: namedEntityInputSchema,
  NamedEntityUpdate: updateNamedEntitySchema,
  SetTeamMember: setTeamMemberSchema,

  DocumentUpdate: updateDocumentSchema,
  DocumentStatusUpdate: updateDocumentStatusSchema,
  DocumentGitHubLinksUpdate: updateDocumentGitHubLinksSchema,
  RestoreRequest: restoreSchema,
  CommentRequest: commentSchema,
  CreateTokenRequest: createTokenSchema,
};
const responseSchemas = {
  ProjectSharing: projectSharingSchema,
  SharedProject: sharedProjectSchema,
  SharedDocument: sharedDocumentSchema,
  SharedDocumentsResponse: sharedDocumentsResponseSchema,
  DocumentCanvas: documentCanvasSchema,
  User: userSchema,
  Team: teamSchema,
  TeamsResponse: teamsResponseSchema,
  Project: projectSchema,
  ProjectsResponse: projectsResponseSchema,
  MembersResponse: membersResponseSchema,

  DocumentSummary: documentSummarySchema,
  DocumentDetail: documentDetailSchema,
  DocumentGitHubLinks: documentGitHubLinksSchema,
  RevisionSummary: revisionSummarySchema,
  RevisionDetail: revisionDetailSchema,
  Comment: commentResponseSchema,
  ApiToken: apiTokenSchema,
  ApiErrorBody: apiErrorBodySchema,
  UserResponse: userResponseSchema,
  PasswordResetResponse: passwordResetResponseSchema,
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
  400: "VALIDATION_ERROR, INVALID_JSON, INVALID_ID, INVALID_REVISION, INVALID_CANVAS_OPERATION or REQUEST_ABORTED. Multi-file export without fileId returns FILE_REQUIRED. Account updates can also return PASSWORD_UNCHANGED or EMAIL_UNCHANGED.",
  401: "UNAUTHENTICATED or INVALID_CREDENTIALS. The session/token is missing, expired or revoked, or the supplied password is incorrect.",
  403: "FORBIDDEN, ACCOUNT_SETUP_REQUIRED, SESSION_REQUIRED or INVALID_ORIGIN. Complete account setup, use the required role/scope, or send a same-origin session request.",
  404: "NOT_FOUND. The document, planning file or historical revision does not exist.",
  408: "BODY_TIMEOUT. The JSON request body was not received within 30 seconds; submit a complete request.",
  409: "DOCUMENT_CONFLICT includes error.currentVersion: fetch the latest document and reconcile changes before resubmitting. DOCUMENT_LOCKED: explicitly reopen the plan to draft or active via the status endpoint before editing/restoring its content. GITHUB_LINKS_CONFLICT requires reading the latest link list and reconciling before retrying. Account/user creation can instead return EMAIL_IN_USE.",
  413: "BODY_TOO_LARGE. JSON request bodies are limited to 3 MiB before parsing, including UTF-8 sources and escaping overhead.",
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
const publicShareToken: Parameter = {
  name: "token",
  in: "path",
  required: true,
  description:
    "Public project bearer link; never use as an API key. Invalid, disabled and replaced links return NOT_FOUND.",
  schema: z.toJSONSchema(publicShareTokenSchema),
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
  " Requires owner/editor team membership or globaladmin oversight and, for bearer authentication, a write-scope key bound to that team. Cookie-authenticated writes require a same-origin Origin header. Changes are saved immediately. Changed file collections or canvas content create a revision; changeSummary describes the change.";

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
    description: `A shared HTML and Markdown planning workspace with immutable document revisions. This REST API uses plain JSON objects and structured errors. Bearer keys inherit the user's current role; read keys cannot write. Browser cookies are HttpOnly and require same-origin Origin validation for writes. Request bodies have a 3 MiB limit. HTML is preserved as authored and must be rendered in an isolated sandbox.\n\nAI clients can separately use ${apiDiscovery.mcp.protocol} at ${apiDiscovery.mcp.endpoint}. MCP is a Streamable HTTP protocol endpoint, not a REST JSON operation, and is intentionally excluded from these paths. Client setup and key creation are available in [Settings → AI and API](${apiDiscovery.mcp.documentation}).`,
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
      description: "Current plans and original HTML/Markdown files.",
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
        "Installation accounts; globaladmin browser session required.",
    },
    {
      name: "Service",
      description: "Public service metadata and database health.",
    },
  ],
  paths: {
    "/api/projects/{id}/sharing": {
      get: {
        operationId: "getProjectSharing",
        summary: "Read project sharing settings",
        description:
          "Team owner or globaladmin browser session required. Returns the current share path and independent sharing version; never included in ordinary project listings.",
        tags: ["Projects"],
        security: security.session,
        parameters: [id],
        responses: {
          "200": jsonResponse("Current sharing settings.", "ProjectSharing"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      put: {
        operationId: "updateProjectSharing",
        summary: "Enable, rotate or disable public project access",
        description:
          "Team owner or globaladmin browser session and same-origin request required. Use the sharing version as expectedVersion. SHARING_CONFLICT requires fetching settings and reviewing again. Rotation and disable invalidate the previous link. Re-enabling generates a fresh link. All current and future tasks, regardless of status, and their current files and diagrams become readable without an account; instructions, people, history, discussion and GitHub links stay private. No public writes. Downloaded or already displayed content cannot be recalled.",
        tags: ["Projects"],
        security: security.session,
        parameters: [id, origin],
        requestBody: body("ProjectSharingUpdate"),
        responses: {
          "200": jsonResponse("Updated sharing settings.", "ProjectSharing"),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/shared/{token}": {
      get: {
        operationId: "getSharedProject",
        summary: "Read a publicly shared project",
        description:
          "Anyone holding an active public link can read this limited project projection. No session, API key or membership is created. Responses are not cached or indexed.",
        tags: ["Public sharing"],
        security: [],
        parameters: [publicShareToken],
        responses: {
          "200": jsonResponse(
            "Shared project name and description.",
            "SharedProject",
          ),
          ...errors(404, 500),
        },
      },
    },
    "/api/shared/{token}/documents": {
      get: {
        operationId: "listSharedDocuments",
        summary: "List tasks in a shared project",
        description:
          "Returns up to 100 current tasks from this project, including all statuses. File metadata only. Each request rechecks the active link. Pass nextCursor unchanged to continue; a null cursor ends the list.",
        tags: ["Public sharing"],
        security: [],
        parameters: [
          publicShareToken,
          {
            name: "cursor",
            in: "query",
            description: "Opaque cursor returned by this list.",
            schema: { type: "string", maxLength: 200 },
          },
        ],
        responses: {
          "200": jsonResponse(
            "Current public task summaries.",
            "SharedDocumentsResponse",
          ),
          ...errors(400, 404, 500),
        },
      },
    },
    "/api/shared/{token}/documents/{id}": {
      get: {
        operationId: "getSharedDocument",
        summary: "Read a task in a shared project",
        description:
          "Returns current files and diagram only for a task belonging to the link's project. Other-project ids and revoked links both return NOT_FOUND. No instructions, history, discussion, author names, membership or GitHub references. Original HTML remains untrusted and must be displayed in an isolated sandbox.",
        tags: ["Public sharing"],
        security: [],
        parameters: [publicShareToken, id],
        responses: {
          "200": jsonResponse(
            "Current public task and original files.",
            "SharedDocument",
          ),
          ...errors(400, 404, 500),
        },
      },
    },
    "/api/documents/{id}/canvas": {
      get: {
        operationId: "readCanvas",
        summary: "Read the AI visualization",
        description:
          "Read typed geometry and text, document version and lifecycle status without original file bodies. A null canvas means no diagram yet.",
        tags: ["Documents"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse("Current diagram.", "DocumentCanvas"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      post: {
        operationId: "applyCanvasOperations",
        summary: "Draw or refine a visualization",
        description:
          "Atomic bounded upsert/remove/rename batch. Removes attached arrows with their node. Changed batches create one immutable content revision without changing original files. expectedVersion guards conflicts; draft/active only. Invalid references return INVALID_CANVAS_OPERATION without saving anything.",
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("CanvasUpdate"),
        responses: {
          "200": jsonResponse(
            "Saved diagram and document version.",
            "DocumentCanvas",
          ),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
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
          "Valid credentials create a seven-day HttpOnly session cookie. Initial and reset accounts must complete setup before workspace access. Generated reset passwords expire after 24 hours and are consumed by one successful login; replay or expiry returns INVALID_CREDENTIALS. Successful login clears the email's failed-attempt counter.",
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
          "Requires an active browser session and the current password; bearer keys cannot perform account changes. Allowed before mandatory setup is complete and for every role. After a one-time login, enter the generated password as currentPassword. The password must change; admin@planroom.local must be replaced with a real email during setup. Clears reset metadata, rotates all sessions and revokes all API keys atomically, then returns a new session cookie.",
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
    "/api/teams": {
      get: {
        operationId: "listTeams",
        summary: "List accessible teams",
        description:
          "Members see their teams. Globaladmin sees all. Bearer keys see only their bound team.",
        tags: ["Teams"],
        security: security.document,
        responses: {
          "200": jsonResponse(
            "Accessible teams and effective roles.",
            "TeamsResponse",
          ),
          ...errors(401, 403, 500),
        },
      },
      post: {
        operationId: "createTeam",
        summary: "Create a team",
        description:
          "Globaladmin browser session required. The creator becomes the first owner.",
        tags: ["Teams"],
        security: security.session,
        parameters: [origin],
        requestBody: body("NamedEntityInput"),
        responses: {
          "201": jsonResponse("Created team.", "Team"),
          ...errors(400, 401, 403, 408, 413, 415, 500, 503),
        },
      },
    },
    "/api/teams/{id}": {
      get: {
        operationId: "getTeam",
        summary: "Read a team",
        description:
          "Nonmembers receive NOT_FOUND. Globaladmin can read all teams.",
        tags: ["Teams"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse("Team metadata.", "Team"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      put: {
        operationId: "updateTeam",
        summary: "Rename or describe a team",
        description:
          "Team owner or globaladmin browser session required. expectedVersion rejects stale writes with VERSION_CONFLICT. Parent relationships cannot change.",
        tags: ["Teams"],
        security: security.session,
        parameters: [id, origin],
        requestBody: body("NamedEntityUpdate"),
        responses: {
          "200": jsonResponse("Updated team.", "Team"),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/teams/{id}/members": {
      get: {
        operationId: "listMembers",
        summary: "List team members",
        description:
          "Team owner or globaladmin browser session required. Ordinary editors/viewers cannot inspect account emails.",
        tags: ["Teams"],
        security: security.session,
        parameters: [id],
        responses: {
          "200": jsonResponse("Team members.", "MembersResponse"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      put: {
        operationId: "setMember",
        summary: "Add a member or change their role",
        description:
          "Team owner or globaladmin browser session required. Uses an existing account email; unknown accounts return USER_NOT_FOUND. LAST_TEAM_OWNER prevents demoting the final owner.",
        tags: ["Teams"],
        security: security.session,
        parameters: [id, origin],
        requestBody: body("SetTeamMember"),
        responses: {
          "200": jsonResponse("Membership saved.", "OkResponse"),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/teams/{id}/members/{userId}": {
      delete: {
        operationId: "removeMember",
        summary: "Remove team membership",
        description:
          "Team owner or globaladmin browser session required. LAST_TEAM_OWNER protects the final owner. Globaladmin retains their explicit installation-wide access.",
        tags: ["Teams"],
        security: security.session,
        parameters: [
          id,
          { ...id, name: "userId", description: "Member account UUID." },
          origin,
        ],
        responses: {
          "200": jsonResponse("Membership removed.", "OkResponse"),
          ...errors(400, 401, 403, 404, 409, 500, 503),
        },
      },
    },
    "/api/projects": {
      get: {
        operationId: "listProjects",
        summary: "List accessible projects",
        description:
          "Only projects in authorized teams are returned; bearer keys are team-bound.",
        tags: ["Projects"],
        security: security.document,
        parameters: [
          {
            name: "teamId",
            in: "query",
            description: "Optional authorized team UUID.",
            schema: z.toJSONSchema(z.uuid()),
          },
        ],
        responses: {
          "200": jsonResponse("Accessible projects.", "ProjectsResponse"),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      post: {
        operationId: "createProject",
        summary: "Create a project",
        description:
          "Requires explicit teamId and owner/editor membership or globaladmin." +
          writes,
        tags: ["Projects"],
        security: security.document,
        parameters: [optionalOrigin],
        requestBody: body("CreateProject"),
        responses: {
          "201": jsonResponse("Created project.", "Project"),
          ...errors(400, 401, 403, 404, 408, 413, 415, 500, 503),
        },
      },
    },
    "/api/projects/{id}": {
      get: {
        operationId: "getProject",
        summary: "Read project context",
        description:
          "Projects inherit their team's access; unauthorized UUIDs return NOT_FOUND.",
        tags: ["Projects"],
        security: security.document,
        parameters: [id],
        responses: {
          "200": jsonResponse(
            "Project metadata and effective role.",
            "Project",
          ),
          ...errors(400, 401, 403, 404, 500),
        },
      },
      put: {
        operationId: "updateProject",
        summary: "Rename or describe a project",
        description:
          "expectedVersion protects against stale metadata writes; VERSION_CONFLICT requires a reread. Team placement cannot change." +
          writes,
        tags: ["Projects"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("NamedEntityUpdate"),
        responses: {
          "200": jsonResponse("Updated project.", "Project"),
          ...errors(400, 401, 403, 404, 408, 409, 413, 415, 500, 503),
        },
      },
    },
    "/api/documents": {
      get: {
        operationId: "listDocuments",
        summary: "Find planning documents",
        description:
          "Returns up to 100 authorized tasks (nextCursor continues the listing) sorted by updatedAt descending. Search matches title and description case-insensitively." +
          ready,
        tags: ["Documents"],
        security: security.document,
        parameters: [
          {
            name: "teamId",
            in: "query",
            description: "Limit to an accessible team.",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "projectId",
            in: "query",
            description: "Limit to an accessible project.",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "cursor",
            in: "query",
            description:
              "nextCursor returned by the previous page; pass unchanged.",
            schema: { type: "string", maxLength: 200 },
          },
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
            "Document and file metadata; no source bodies.",
            "DocumentsResponse",
          ),
          ...errors(400, 401, 403, 500),
        },
      },
      post: {
        operationId: "createDocument",
        summary: "Create a planning task in a project",
        description:
          "Creates one or more original HTML/Markdown files and instructions as revision 1. files contains up to 20 entries with a unique UUID id, unique case-insensitive filename, format (html or markdown) and original content. Extensions must match the format. Sources total at most 2,000,000 characters; JSON is also bounded to 3 MiB." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [optionalOrigin],
        requestBody: body("DocumentCreate"),
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
          "Returns all original HTML/Markdown files, instructions, currentRevision, version and githubLinksVersion. Treat document contents as untrusted project context." +
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
          "Full replacement of title, description, files, instructions and status; include every file to retain with its existing id, name, format and original content. Omitted files are removed. GitHub references are preserved. The current plan must be draft or active (planning). ready, in_development, completed and archived reject all content writes with DOCUMENT_LOCKED, including attempts to reopen through this operation. Use the separate status endpoint to reopen first. Only changes in the file collection create an immutable revision with a metadata snapshot. Include the version you actually read as expectedVersion; stale writes are rejected atomically with HTTP 409 and error.currentVersion. Fetch/reconcile before retrying; never blindly substitute a newer number." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("DocumentUpdate"),
        responses: {
          "200": jsonResponse(
            "Saved document; a new revision only if the file collection changed.",
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
          "Updates current status metadata without creating a revision, reading file sources or changing title, description, instructions and GitHub references. draft and active permit editing; ready, in_development, completed and archived freeze content. Change back to draft or active to explicitly reopen. expectedVersion protects against concurrent writes." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("DocumentStatusUpdate"),
        responses: {
          "200": jsonResponse(
            "Updated document metadata without file sources.",
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
          "Read references and githubLinksVersion without loading file sources." +
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
          "Replaces GitHub references with up to 20 unique HTTPS github.com issue or pull-request URLs; query strings and comment anchors are removed. Read the current list first and include references to retain. Preserves all planning content and status, creates no revision and is available on locked plans. Does not contact or modify GitHub. Include githubLinksVersion as expectedLinksVersion; it is independent of the document version and file revision. A stale link write returns GITHUB_LINKS_CONFLICT." +
          ready +
          writes,
        tags: ["Documents"],
        security: security.document,
        parameters: [id, optionalOrigin],
        requestBody: body("DocumentGitHubLinksUpdate"),
        responses: {
          "200": jsonResponse(
            "Updated GitHub references and their independent version, without file sources.",
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
          "Returns revision metadata sorted by number descending, without source bodies." +
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
          "Returns all original HTML/Markdown files and instructions from one immutable revision." +
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
          "Copies the entire historical file collection and its title, description, status and instructions snapshot into the current plan. Creates a revision when files or canvas change. Restores the canvas snapshot too. Current GitHub references are retained. Existing history remains intact. The current plan must be draft or active; otherwise DOCUMENT_LOCKED requires explicitly reopening through the status endpoint first. expectedVersion protects the current document from concurrent overwrites; 409 includes error.currentVersion." +
          ready +
          writes,
        tags: ["History"],
        security: security.document,
        parameters: [id, number, optionalOrigin],
        requestBody: body("RestoreRequest"),
        responses: {
          "200": jsonResponse(
            "Restored document; new revision when files or canvas change.",
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
        summary: "Download an original planning file",
        description:
          "Downloads the selected current HTML/Markdown file without changing its original source. Supply fileId when the plan has multiple files; omitting it for a single-file plan selects that file. Does not include separate instructions or comments. Serve/render downloaded content only in an isolated context." +
          ready,
        tags: ["Documents"],
        security: security.document,
        parameters: [
          id,
          {
            name: "fileId",
            in: "query",
            required: false,
            description:
              "UUID of the file in the current revision. Required for multi-file plans; unknown files return 404, missing selection returns 400 FILE_REQUIRED.",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Original file attachment, UTF-8 encoded.",
            content: {
              "text/html": { schema: { type: "string" } },
              "text/markdown": { schema: { type: "string" } },
            },
            headers: {
              "Content-Disposition": {
                description:
                  "attachment with a safe readable ASCII filename and the original UTF-8 filename in filename*",
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
          "Requires an active browser session and same-origin Origin. teamId is required. Team viewers can create read keys; owners/editors and globaladmin can create read or write keys. Keys expire 90 days after creation; expiresAt and maskedToken (eight asterisks plus the last four secret characters) are included in record. Create a replacement before expiry and update your client. The complete secret appears only in this response; keep it outside source control. Keys inherit the current membership in their bound team on every request, and document writes revalidate credentials inside their transaction." +
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
    "/api/admin/users/{id}/reset-password": {
      post: {
        operationId: "resetUserPassword",
        summary: "Generate a one-time password for another user",
        description:
          "Requires an active globaladmin browser session with completed setup and same-origin Origin. Replaces the target user's password and revokes all their sessions and API keys atomically. The generated secret is returned only in this response, expires after 24 hours and permits one login to choose a new password through account setup. It cannot be retrieved later. An uncertain response requires a new explicitly confirmed reset. Self-reset is forbidden; use account setup for your own password. Existing login rate limits still apply.",
        tags: ["Administration"],
        security: security.session,
        parameters: [{ ...id, description: "Target user UUID." }, origin],
        responses: {
          "200": jsonResponse(
            "One-time password and expiry; user has mustChangePassword=true. Cache-Control: no-store.",
            "PasswordResetResponse",
          ),
          ...errors(400, 401, 403, 404, 429, 500, 503),
        },
      },
    },
    "/api/admin/users": {
      get: {
        operationId: "listUsers",
        summary: "List workspace users",
        description:
          "Requires a globaladmin browser session with completed setup. Bearer API keys cannot administer users. Returns users ordered by account creation.",
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
          "Requires an active globaladmin browser session with completed setup and same-origin Origin. New users must replace their temporary password on first sign-in. Email addresses are normalized to lowercase and must be unique.",
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
          "Send Authorization: Bearer <key>. Create keys in Settings → AI and API. Read keys permit reads only; write keys also require owner/editor membership or globaladmin oversight in their bound team. Account setup must already be complete. Bearer keys cannot change accounts, create/revoke keys or administer users.",
      },
    },
  },
  externalDocs: {
    description: "Interactive REST API reference",
    url: apiDiscovery.documentation,
  },
};
