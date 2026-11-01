export interface ElementContext {
  schema: 'pointkit.element.v1';
  page: string;
  selector: string;
  /** Select each host in order, enter its .shadowRoot, then resolve selector. */
  shadow_hosts?: string[];
  tag: string;
  attributes: Record<string, string>;
  text: string;
  [key: string]: unknown;
}
export interface CopyEvent {
  element: Element;
  receipt?: PointReceipt;
  context: ElementContext;
  text: string;
}
export interface PointReceipt {
  id: string;
  url: string;
  api_url: string;
  expires_at: string;
  delete_token: string;
}
export interface ShareOptions {
  endpoint: string;
  /** Upload-only credential. Do not use a server administrator key in public apps. */
  token?: string;
  expiresIn?: number;
  credentials?: RequestCredentials;
}
export declare function uploadPoint(context: ElementContext, options: ShareOptions): Promise<PointReceipt>;
export interface PointkitOptions {
  /** Upload context and copy a link instead of JSON. Omit to keep local-only copying. */
  share?: ShareOptions;
  /** Preserve this receipt if you need the delete token or clipboard access fails. */
  onUpload?: (receipt: PointReceipt) => void;
  document?: Document;
  /** Disable automatic Cmd+C / Ctrl+C; activate() remains available. */
  shortcut?: false;
  /** Disable injected CSS; load pointkit/style.css yourself instead. */
  styles?: boolean;
  nonce?: string;
  filter?: (element: Element) => boolean;
  /** Synchronous additions to the default JSON context. */
  getContext?: (element: Element, context: ElementContext) => Record<string, unknown>;
  onCopy?: (event: CopyEvent) => void;
  onModeChange?: (active: boolean) => void;
  onError?: (error: Error) => void;
}
export interface Pointkit {
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
  copy(element: Element): Promise<ElementContext>;
  destroy(): void;
}
export declare function createPointkit(options?: PointkitOptions): Pointkit;
export declare function describeElement(element: Element): ElementContext;
export declare function getSelector(element: Element): string;
