/** Configuration examples contain placeholders only; real tokens never enter this module. */
export function mcpConfiguration(origin: string) {
  const url = new URL("/api/mcp", origin);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("MCP-adressen måste använda HTTP eller HTTPS.");
  const endpoint = url.toString();
  return {
    endpoint,
    codexCli: `[mcp_servers.planroom]\nurl = ${JSON.stringify(endpoint)}\nbearer_token_env_var = "PLANROOM_API_KEY"`,
    codexDesktop: `[mcp_servers.planroom]\nurl = ${JSON.stringify(endpoint)}\nhttp_headers = { Authorization = "Bearer <DIN_PLANROOM_NYCKEL>" }`,
    claudeCode: JSON.stringify(
      {
        mcpServers: {
          planroom: {
            type: "http",
            url: endpoint,
            headers: { Authorization: "Bearer ${PLANROOM_API_KEY}" },
          },
        },
      },
      null,
      2,
    ),
    claudeDesktop: JSON.stringify(
      {
        mcpServers: {
          planroom: {
            command: "docker",
            args: [
              "compose",
              "--project-directory",
              "<ABSOLUT_SÖKVÄG_TILL_PLANROOM>",
              "run",
              "--rm",
              "--no-deps",
              "-T",
              "-e",
              "PLANROOM_API_KEY",
              "mcp-bridge",
            ],
            env: { PLANROOM_API_KEY: "<DIN_PLANROOM_NYCKEL>" },
          },
        },
      },
      null,
      2,
    ),
    codexLaunch: `export PLANROOM_API_KEY='<DIN_PLANROOM_NYCKEL>'\ncodex`,
    claudeLaunch: `export PLANROOM_API_KEY='<DIN_PLANROOM_NYCKEL>'\nclaude`,
  };
}
