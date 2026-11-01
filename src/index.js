import css from './style.css';
import { uploadPoint } from './share.js';
export { uploadPoint } from './share.js';

const instances = new WeakMap();
const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
const actionSelector = 'button, a, input, textarea, select, [role="button"]';
const attributeNames = ['id', 'role', 'aria-label', 'title', 'type', 'name', 'data-testid', 'data-action', 'data-view'];

function selectionExists(doc) {
  const selection = doc.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

function editing(doc) {
  let focused = doc.activeElement;
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
  return Boolean(focused?.matches(editableSelector) || focused?.isContentEditable);
}

/** A unique CSS selector within the element's document or shadow root. */
export function getSelector(element) {
  const root = element.getRootNode();
  const escape = element.ownerDocument.defaultView.CSS.escape;
  const parts = [];
  let current = element;
  while (current) {
    if (current.id) {
      const candidate = '#' + escape(current.id);
      if (root.querySelectorAll(candidate).length === 1) {
        parts.unshift(candidate);
        break;
      }
    }
    const tag = current.localName;
    // nth-child also handles mixed HTML/SVG siblings without namespace ambiguity.
    const index = current.parentElement ? [...current.parentElement.children].indexOf(current) + 1 : 0;
    parts.unshift(index ? `${tag}:nth-child(${index})` : tag);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/** Describe the DOM node without input values, URL query strings, or private text. */
export function describeElement(element) {
  if (!element || element.nodeType !== 1) throw new TypeError('Pointkit requires a DOM element.');
  const doc = element.ownerDocument;
  const url = new URL(doc.URL);
  const attributes = {};
  for (const name of attributeNames) {
    if (element.hasAttribute(name)) attributes[name] = element.getAttribute(name);
  }
  let text = '';
  if (!element.closest('[data-pointkit-private], input, textarea, select')) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('script, style, template, input, textarea, select, [data-pointkit-private]').forEach(node => node.remove());
    text = (clone.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  }
  const shadowHosts = [];
  let root = element.getRootNode();
  while (root.host) {
    shadowHosts.unshift(getSelector(root.host));
    root = root.host.getRootNode();
  }
  return {
    schema: 'pointkit.element.v1',
    page: url.origin === 'null' ? url.protocol : url.origin + url.pathname,
    selector: getSelector(element),
    ...(shadowHosts.length ? { shadow_hosts: shadowHosts } : {}),
    tag: element.localName,
    attributes,
    text
  };
}

/** Install one picker per document. Importing this module alone has no effects. */
export function createPointkit(options = {}) {
  const doc = options.document ?? globalThis.document;
  if (!doc?.defaultView) throw new Error('Create Pointkit in a browser (for example, inside a mount effect).');
  if (instances.has(doc)) return instances.get(doc);
  const win = doc.defaultView;
  let active = false, hovered = null, previousFocus = null, destroyed = false;
  let markerAdded = false, originalTargetMarked = false;
  const events = new win.AbortController();
  const shadowStyles = new Map();
  let style = null;
  if (options.styles !== false) {
    style = doc.createElement('style');
    if (options.nonce) style.nonce = options.nonce;
    style.dataset.pointkitStyle = '';
    style.textContent = css;
    (doc.head || doc.documentElement).append(style);
  }
  const emitError = error => { options.onError?.(error instanceof Error ? error : new Error(String(error))); };
  const emitMode = state => { try { options.onModeChange?.(state); } catch (error) { emitError(error); } };
  function highlight(element) {
    if (hovered && !originalTargetMarked) hovered.classList.remove('pointkit-target');
    hovered = element;
    const root = hovered?.getRootNode();
    if (root?.host && options.styles !== false && !shadowStyles.has(root)) {
      const shadowStyle=doc.createElement('style');
      if(options.nonce) shadowStyle.nonce=options.nonce;
      shadowStyle.textContent=css; shadowStyle.dataset.pointkitStyle='';
      root.append(shadowStyle); shadowStyles.set(root,shadowStyle);
    }
    originalTargetMarked = Boolean(hovered?.classList.contains('pointkit-target'));
    hovered?.classList.add('pointkit-target');
  }
  function deactivate() {
    if (!active) return;
    active = false;
    highlight(null);
    if (markerAdded) doc.documentElement.classList.remove('pointkit-active');
    markerAdded = false;
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    previousFocus = null;
    emitMode(false);
  }
  function activate() {
    if (destroyed || active) return;
    active = true;
    previousFocus = doc.activeElement;
    markerAdded = !doc.documentElement.classList.contains('pointkit-active');
    doc.documentElement.classList.add('pointkit-active');
    emitMode(true);
  }
  function candidate(event) {
    // Open-shadow targets retain an explicit host chain in copied context.
    const element = event.composedPath().find(node => node?.nodeType === 1);
    if (!element || element.closest('[data-pointkit-ignore]') || element.getRootNode().host?.closest('[data-pointkit-ignore]')) return null;
    const action = element.closest(actionSelector) || element;
    return options.filter && !options.filter(action) ? null : action;
  }
  async function copy(element) {
    if (destroyed) throw new Error('This Pointkit instance has been destroyed.');
    if (!element || element.ownerDocument !== doc) throw new Error('The element must belong to this Pointkit document.');
    const base = describeElement(element);
    const extra = options.getContext?.(element, base) ?? {};
    if (extra && typeof extra.then === 'function') throw new TypeError('getContext must return synchronously to preserve clipboard user activation.');
    const context = { ...extra, ...base };
    deactivate();
    if (!win.navigator.clipboard?.writeText) throw new Error('Clipboard access requires HTTPS or localhost and a user gesture.');
    let text = JSON.stringify(context, null, 2), receipt;
    if (options.share) {
      const shared = uploadPoint(context, { ...options.share, endpoint:new URL(options.share.endpoint, doc.URL).href }).then(result => {
        receipt=result; text=result.url; options.onUpload?.(result); return text;
      });
      // Start clipboard permission inside the click, before waiting for the server.
      // Promise-backed ClipboardItem preserves user activation on Safari as well.
      const writing = win.ClipboardItem && win.navigator.clipboard.write
        ? win.navigator.clipboard.write([new win.ClipboardItem({'text/plain':shared.then(value => new win.Blob([value], {type:'text/plain'}))})])
        : shared.then(value => win.navigator.clipboard.writeText(value));
      const [uploaded, written] = await Promise.allSettled([shared, writing]);
      if(uploaded.status==='rejected') throw uploaded.reason;
      if(written.status==='rejected') throw written.reason;
    } else await win.navigator.clipboard.writeText(text);
    options.onCopy?.({ element, context, text, ...(receipt ? {receipt} : {}) });
    return context;
  }
  function intercept(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { intercept(event); deactivate(); return; }
    if (options.shortcut === false || event.key.toLowerCase() !== 'c' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing || event.repeat || event.defaultPrevented) return;
    if (selectionExists(doc) || editing(doc)) { deactivate(); return; }
    intercept(event);
    if (active && hovered) void copy(hovered).catch(emitError);
    else activate();
  }, { capture: true, signal: events.signal });
  doc.addEventListener('pointerover', event => {
    if (active) { try { highlight(candidate(event)); } catch (error) { emitError(error); } }
  }, { capture: true, signal: events.signal });
  doc.addEventListener('pointerdown', event => { if (active && event.button === 0) intercept(event); }, { capture: true, signal: events.signal });
  doc.addEventListener('click', event => {
    if (!active || event.button !== 0) return;
    intercept(event);
    try {
      const element = candidate(event);
      if (element) void copy(element).catch(emitError);
    } catch (error) { emitError(error); }
  }, { capture: true, signal: events.signal });
  win.addEventListener('blur', deactivate, { signal: events.signal });
  win.addEventListener('pagehide', deactivate, { signal: events.signal });
  const api = {
    activate, deactivate, copy,
    isActive: () => active,
    destroy() {
      if (destroyed) return;
      deactivate();
      destroyed = true;
      events.abort();
      style?.remove();
      for (const shadowStyle of shadowStyles.values()) shadowStyle.remove();
      shadowStyles.clear();
      instances.delete(doc);
    }
  };
  instances.set(doc, api);
  return api;
}
