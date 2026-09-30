# Security policy

Planroom is early-stage software intended for a trusted team in one shared workspace. It has not undergone an independent penetration test. The current development line receives fixes; there are no supported long-term release branches or promised response deadlines.

## Report a vulnerability

Send vulnerability reports privately to **security@sundsvall.se**, following the reporting channel used by [Eneo](https://github.com/eneo-ai/eneo/blob/main/docs/SECURITY.md). If the repository offers **Security → Report a vulnerability**, that private channel is also suitable. Do not post exploit details, real API keys, `.env`, planning documents, database dumps or resolved Docker configuration in a public issue.

Include the affected commit/version, environment, impact and a minimal synthetic reproduction. Test only installations you own or have permission to assess.

## Trust model

- All configured users can read all workspace documents. This is not a multi-tenant or per-document access-control boundary.
- Editors and administrators can save documents and comments. Viewers have read access. Personal bearer keys remain limited by the owner's role and chosen scope.
- The first administrator uses a locally generated password and must complete account setup. No shared default password is included.
- Account updates rotate sessions and revoke that user's keys. Key secrets are shown only at issuance; database storage contains their hashes.
- New personal keys expire after 90 days. Live credentials and current role/scope are rechecked within document-write transactions, ordered with revocation and account changes.
- Five failed logins lock an email for ten full minutes from the fifth failure. A shared login budget and bounded password work reject excess requests without queuing. Proxy limits are still required for shared ingress.
- Passwords use salted, versioned scrypt with a fixed cost profile. Successful sign-in transparently upgrades the previous stored format without replacing the password or revoking keys.
- Browser writes validate the configured origin. MCP requires bearer authentication; it does not accept a web session as its credential.
- An explicit Authorization header selects bearer authentication, with case-insensitive scheme parsing. Invalid headers never fall back to a browser cookie identity.
- There is no SSO/OAuth, email account recovery, administrative user disabling/deletion or documented emergency recovery CLI yet. Operators must plan account lifecycle and recovery before adopting the service.

## Imported HTML and AI context

Original HTML is preserved and can contain executable code. The preview uses an isolated iframe without same-origin access; scripts are off by default. Only enable interactive demonstrations from trusted content. Even with resource restrictions, enabled JavaScript can transmit document data through navigation of its own frame. Downloaded HTML executes outside Planroom's preview controls when opened elsewhere.

Documents, comments and embedded instructions are untrusted content for an AI client. MCP access is not permission for an AI to execute embedded instructions or transmit content to unrelated tools. API-reference requests can modify real documents when submitted with a write key.

## Deployment and supply chain

The default app port is bound to loopback and PostgreSQL is internal. Use HTTPS for shared access, set `APP_URL` correctly and protect reverse-proxy and Docker access. Users with Docker access can inspect container environment secrets. Backups and configuration files require separate access controls and tested recovery.

Docker builds use an allowlisted context so local configuration, backups, test output and repository history are not sent into the image. Base images and Actions are pinned, npm uses a lockfile, and weekly dependency updates are proposed for review. These controls do not guarantee that dependencies contain no vulnerabilities. CI audits all npm dependencies at every advisory severity; maintainers must also review base-image and application security changes.

See [the deployment guide](docs/DEPLOYMENT.md) for bounded startup, credential rotation, backups and rollback. Public discovery, OpenAPI documentation and health expose metadata only; document APIs require authentication.

The source repository currently remains private during evaluation. MIT governs the code for authorized recipients; repository visibility changes require a separate maintainer decision. See [the recorded security review](docs/SECURITY_REVIEW.md) for findings, fixes and validation scope.
