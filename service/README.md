# Pointkit points service

A minimal HTTP + SQLite service for sharing selected DOM context. Requires Node.js 24+. No runtime npm dependencies.

## Local run

```sh
cp .env.example .env
# Set a random POINTKIT_UPLOAD_KEY in .env. Keep PUBLIC_URL local for local testing.
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:8080`, connect with the upload key, press Cmd+C / Ctrl+C with no text selected, and click the demo element. Review the image, add an optional memo in the bottom composer, then click **공유 링크 복사**. The resulting link can be opened without logging in.

## API

### Create

`POST /api/points` with `Authorization: Bearer UPLOAD_KEY` and JSON:

```json
{
  "context": {
    "schema": "pointkit.element.v1",
    "page": "https://your-app.example/settings",
    "selector": "#save",
    "tag": "button",
    "attributes": { "aria-label": "Save" },
    "text": "Save"
  },
  "expires_in": 604800
}
```

Returns HTTP 201:

```json
{
  "id": "2910fa2d90a164ad937be6b783ca0e71",
  "url": "https://pointkit.dev/points/2910fa2d90a164ad937be6b783ca0e71",
  "api_url": "https://pointkit.dev/api/points/2910fa2d90a164ad937be6b783ca0e71",
  "created_at": "2026-11-01T00:00:00.000Z",
  "expires_at": "2026-11-08T00:00:00.000Z",
  "delete_token": "SAVE_THIS_SEPARATELY"
}
```

The deletion token is returned only once. Public reads never include it. The browser UI stores receipts and deletion tokens locally; the upload key itself is not placed in localStorage.

### Read

- `GET /points/{id}`: human-readable, safely escaped HTML.
- `GET /points/{id}` with `Accept: application/json`: full JSON.
- `GET /api/points/{id}`: full JSON regardless of Accept.

No key is needed to read. The 128-bit random URL is a bearer capability: anyone who obtains the link can retrieve the context. There is no public list endpoint. Links are marked noindex, use no-referrer, and responses are not cacheable.

### Image and memo

Add an optional `note` string (up to 4,000 characters) inside `context`. Add an optional top-level `image` with `{ "data_url": "data:image/png;base64,..." }`. Only bounded PNG uploads are accepted; dimensions are read from the PNG header instead of trusting client metadata. SVG uploads are rejected.

Receipts and public JSON include `image: { url, mime_type, width, height, bytes }` when an image exists. `GET /api/points/{id}/image` returns the raw PNG without a login; the same unguessable point ID grants access. It is unavailable immediately after point deletion or expiry. Public JSON does not contain base64 image bytes. Both the memo and PNG appear on the human-readable point page.

Images are stored as SQLite BLOBs in the same row as point context, so deletion and expiry remove them together. Startup adds nullable image columns to existing databases without changing prior points. Old points continue to work without images.

### Delete

`DELETE /api/points/{id}` with `Authorization: Bearer DELETE_TOKEN`. The upload administrator key or a connected browser session can also delete points. The endpoint returns 204 on success and 404 after deletion.

### Expiry and limits

- Default expiry: 7 days; configurable from 60 seconds to 30 days.
- Expired content is unavailable immediately. Expired URLs return 410 or 404 after cleanup.
- Cleanup deletes expired database rows once a minute and before new writes.
- Context: 64 KiB; note: 4,000 characters; optional PNG: 1 MiB and at most 1,600 × 1,600 pixels. Combined JSON request: 1,500,000 bytes. Maximum active points: 5,000, capped at 256 MiB of context/image content.
- Upload/login rate: 60 requests per minute per socket address. Behind a shared reverse proxy this is a conservative shared limit. Caller-supplied forwarding headers are not trusted.
- With sharing enabled, the composer captures a redacted PNG of the selected DOM element. Input/editable values and private subtrees are excluded or masked. No full-screen or browser-tab capture is performed.
- Page URL credentials, query strings and fragments are dropped again at the service boundary.
- Context extensions are supplied by the application; do not include secrets in them.

## Browser sessions

The home page connects through `POST /api/session` with `{ "key": "UPLOAD_KEY" }`. A signed HttpOnly, SameSite=Strict cookie is used for subsequent same-site requests; production cookies are Secure. Sessions expire after 30 days. Logging out clears this browser's cookie. Rotating the upload key invalidates all existing sessions. Direct API callers should use the upload key in the Authorization header.

## Configuration

| Variable | Meaning |
| --- | --- |
| `POINTKIT_UPLOAD_KEY` | Required random upload/admin credential, minimum 24 characters. |
| `PUBLIC_URL` | Canonical service origin, e.g. `https://pointkit.dev`. Local default uses the actual loopback port. |
| `POINTKIT_ALLOWED_ORIGINS` | Comma-separated allowed browser write origins. Canonical origin is automatically allowed. |
| `POINTKIT_DB_PATH` | SQLite file (default `data/points.sqlite3`). |
| `PORT` | HTTP port (default 8080). |

A browser upload key is visible to that browser's user. Use an application-owned backend proxy to protect a server upload credential in a public application. The service does not fetch the page URL or any user-supplied URL.

## GKE deployment

`deploy/deploy.sh` targets the existing `coders-497813` GKE infrastructure, uses a dedicated PVC and Secret, and waits for the exact deployment, certificate, ingress and health check. `deploy/connect-domain.py` is a one-time domain setup for the existing owned `pointkit.dev` Cloudflare zone; it refuses to overwrite a different existing apex address. Cloudflare credentials stay in their existing Kubernetes Secret and are never copied into the image or this repository.

The point service uses a single replica with a persistent SQLite file. Back up the PVC before replacing or migrating the storage. Scaling to multiple replicas requires a shared database design.
