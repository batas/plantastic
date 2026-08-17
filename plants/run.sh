#!/bin/sh
set -e
echo "[addon] Starting Rośliny"
node /patch-basepath.mjs 2>/dev/null || true
exec node /app/server.js
