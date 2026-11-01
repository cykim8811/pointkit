# Pointkit

Point at UI elements. Give your AI coding agent precise context.

With nothing selected, press **⌘C** on macOS or **Ctrl+C** elsewhere to start picking. Click an element to copy its CSS selector, label, and DOM context as JSON. Paste it into your agent and describe the change you want.

Selected text and focused text editors keep their normal copy behavior. **Esc** cancels. Picking never executes the target's click action.

- No runtime dependencies or framework requirement
- TypeScript types, ESM, CommonJS, and a standalone browser bundle
- No network requests, telemetry, backend, or automatic agent connection
- Explicit lifecycle, custom context hooks, ignored and private areas

## Install

```sh
npm install @cykim8811/pointkit
```

```js
import { createPointkit } from '@cykim8811/pointkit';

const picker = createPointkit({
  getContext: element => ({
    app: 'my-app',
    related_files: element.closest('#settings')
      ? ['src/settings.js']
      : ['src/app.js'],
  }),
  onModeChange: active => {
    // Optional: show your own "Click an element / Esc to cancel" hint.
  },
  onCopy: ({ text, context, element }) => {
    console.log('Copied:', context.selector);
  },
  onError: error => console.error(error.message),
});

// Remove every listener, highlight, and injected style when your app unmounts.
picker.destroy();
```

Importing the main entry does nothing to the page. Call `createPointkit()` in the browser after your document exists. Mount it only in the environments where you want the shortcut.

### Quick start with defaults

```js
import '@cykim8811/pointkit/auto';
```

The `auto` entry installs once when a browser document is available. In server rendering it does nothing. To clean it up:

```js
import { pointkit } from '@cykim8811/pointkit/auto';
pointkit?.destroy();
```

### Plain HTML without a bundler

Copy `dist/pointkit.global.js` from the package into your application's static files, then load it:

```html
<script src="/vendor/pointkit.global.js"></script>
<script src="/app.js"></script>
```

```js
// app.js
const picker = Pointkit.createPointkit();
```

This bundle exposes the same functions under `window.Pointkit`; it does not automatically install a picker.

### React (optional)

Pointkit does not use React internals. Install it in a mount effect and clean it up:

```jsx
import { useEffect } from 'react';
import { createPointkit } from '@cykim8811/pointkit';

export function DevTools() {
  useEffect(() => {
    const picker = createPointkit();
    return () => picker.destroy();
  }, []);
  return null;
}
```

## Copied context

```json
{
  "schema": "pointkit.element.v1",
  "page": "https://example.com/settings",
  "selector": "#save-settings",
  "tag": "button",
  "attributes": { "id": "save-settings", "type": "submit" },
  "text": "Save settings"
}
```

A unique ID is preferred. Otherwise Pointkit builds an ancestor path with `:nth-child()` segments. A selector identifies the current DOM structure, not a permanent application identifier; stable IDs make context more useful across rerenders. Nested icons inside buttons or links resolve to their enclosing action element.

For an element inside an open shadow root, `shadow_hosts` lists the selectors of its hosts in order. Start in the document, find each host and enter its `.shadowRoot`, then resolve `selector` in the last root. Closed shadow roots are represented by the visible host. Each iframe is a separate document and needs its own installation; the parent picker cannot inspect a cross-origin frame.

File locations are **application-provided hints** through `getContext`; Pointkit does not claim to discover JavaScript source locations from rendered HTML.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `document` | Current document | Install in a specific browser document. |
| `shortcut` | Cmd+C / Ctrl+C | Set to `false` to enable only programmatic picking. |
| `styles` | `true` | Set to `false` to supply the stylesheet yourself. |
| `nonce` | None | CSP nonce applied to injected styles. |
| `filter(element)` | All elements | Return `false` to exclude a target. |
| `getContext(element, base)` | None | Add synchronous fields to the copied JSON. |
| `onModeChange(active)` | None | Display your own selection-mode status. |
| `onCopy({element, context, text})` | None | Runs after the clipboard write succeeds. |
| `onError(error)` | None | Handle clipboard or extension errors. |

`getContext` is synchronous so a click's clipboard permission is preserved across browsers. Add information already available in your app rather than fetching during the click. Core context fields take precedence over extra fields.

One instance is shared per document. Calling `createPointkit` again returns that existing instance without changing its options. Call `destroy()` before installing different options. Avoid mixing independently bundled copies of the library in the same document.

## API

```js
picker.activate();
picker.deactivate();
picker.isActive();
await picker.copy(document.querySelector('#save-settings'));
picker.destroy(); // Safe to call more than once.
```

`copy(element)` needs a user gesture and clipboard permission, just like picking. It rejects on failure; handle errors when calling it directly. Shortcut and click handlers report failures through `onError`. Without `onError`, failed writes have no built-in UI.

For context without clipboard access:

```js
import { describeElement, getSelector } from '@cykim8811/pointkit';
const context = describeElement(element);
const selector = getSelector(element);
```

### Ignored and private areas

```html
<div data-pointkit-ignore>Do not pick this area</div>
<div data-pointkit-private>Do not include this text in copied context</div>
```

Input, textarea, and select values are omitted. Script/style text and descendants marked private are removed from text excerpts; excerpts are limited to 600 characters. URL query strings and fragments are omitted. Visible page text and allowlisted labels/attributes are still part of the context, so mark sensitive sections explicitly. Attributes supplied in your own `getContext` are under your control.

### Content Security Policy

Under strict `style-src 'self'`, load the stylesheet using your bundler or host it yourself, then disable style injection:

```js
import '@cykim8811/pointkit/style.css';
const picker = createPointkit({ styles: false });
```

Or supply a nonce that your CSP permits: `createPointkit({ nonce: 'your-style-nonce' })`. No inline scripts or `eval` are required. External stylesheets must also be loaded into any shadow root you want to highlight when `styles:false`.

### Browser behavior

Requires a modern browser with `navigator.clipboard.writeText` and an HTTPS page (localhost also works). Browser clipboard permission must allow the write. Normal text copying stays native when any selection exists or an input, textarea, select, or contenteditable editor has focus. With no selection/editor, Cmd+C and Ctrl+C become the picker shortcut; disable the shortcut if that conflicts with your app. A second shortcut press copies the hovered element; Escape or leaving the window cancels.

## Development

```sh
npm ci
npm run build
npx playwright install chromium
npm test
npm run typecheck
npm run dev
```

The demo runs at `http://127.0.0.1:4173`. Tests cover native copy, picker interception, unique selectors, redaction, lifecycle, denied clipboard access, strict CSP, and SSR-safe ESM/CommonJS imports.

## Publishing

The npm package is `@cykim8811/pointkit`; the repository is `cykim8811/pointkit`.

For the first release, log in as an npm account authorized for the scope and run:

```sh
npm login
npm test
npm run typecheck
npm publish --access public
```

After the first package is published, configure its npm trusted publisher for GitHub owner `cykim8811`, repository `pointkit`, and workflow `publish.yml`. Future `v*` tags run the included publish workflow with OIDC and provenance. The workflow verifies that the tag matches `package.json` before publishing. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

MIT © cykim8811
