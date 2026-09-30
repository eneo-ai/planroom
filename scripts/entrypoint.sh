#!/bin/sh
set -eu

node scripts/wait-for-db.mjs
./node_modules/.bin/tsx scripts/migrate.ts
./node_modules/.bin/tsx scripts/seed.ts
exec "$@"
