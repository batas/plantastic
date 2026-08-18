---
name: coolify-deploy
description: Use when the user says "deploy", "redeploy", "build", or "push to production". Deploys applications to Coolify via REST API. Covers finding app UUID, triggering deploy, and checking status.
---

# Coolify Deploy

Deploy applications to Coolify via REST API.

## Configuration

Read API credentials from `~/.config/opencode/opencode.json` → `mcp.coolify.environment`:
- `COOLIFY_BASE_URL` — API base URL (e.g. `https://coolify.home.sabat.biz/api/v1`)
- `COOLIFY_TOKEN` — Bearer token

## Step 1: Find application UUID

If the user names an app, search for it. If not specified, deploy **plants** (this project).

```bash
curl -s "$COOLIFY_BASE_URL/applications" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json"
```

Returns `[{ uuid, name, git_repository, git_branch, ... }]`.

**plants UUID: `feg3jlndbxfhc4ni5i1bauyl`**

## Step 2: Trigger deploy

The deploy endpoint is **`POST /api/v1/deploy`** with query params — NOT `/api/v1/applications/{uuid}/deploy` (that returns 404).

```bash
curl -s -X POST "$COOLIFY_BASE_URL/deploy?uuid=$APP_UUID" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

With force rebuild (no cache):
```bash
curl -s -X POST "$COOLIFY_BASE_URL/deploy?uuid=$APP_UUID&force=true" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

Response:
```json
{ "deployments": [{ "message": "...", "resource_uuid": "...", "deployment_uuid": "..." }] }
```

## Step 3: Check status (optional)

```bash
curl -s "$COOLIFY_BASE_URL/deployments/$DEPLOYMENT_UUID" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json"
```

`status` field: `queued` → `running` → `finished` | `failed`

## Important

- Endpoint: `/api/v1/deploy` (GET or POST)
- Query params: `uuid` (required), `force` (optional), `pr` (optional, PR ID), `tag` (optional)
- `tag` and `pr` cannot be used together
- For this project, always deploy from `develop` branch
