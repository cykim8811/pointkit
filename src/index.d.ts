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
  context: ElementContext;
  text: string;
}
export interface PointkitOptions {
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
