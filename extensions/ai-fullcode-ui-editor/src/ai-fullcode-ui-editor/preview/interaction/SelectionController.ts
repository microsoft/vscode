/**
 * SelectionController.ts
 *
 * Cursor 2.x-style Selection controller for the Preview Webview.
 *
 * Responsibilities:
 *  - Hit-test a selectable element in the preview DOM
 *  - Maintain SelectionState (selectedElementId + viewport bounds)
 *  - Emit selection updates via callback
 *
 * Non-responsibilities:
 *  - NO DOM mutation of preview content (except reading attributes)
 *  - NO drag/drop logic
 *  - NO overlay rendering
 */

export type SelectionState = {
  selectedElementId: string; // '' means nothing selected
  bounds: DOMRect | null; // viewport coordinates (getBoundingClientRect)
};

export type SelectionControllerOptions = {
  /** The root element that contains the preview DOM (NOT the overlay root). */
  previewRoot: HTMLElement;
  /** Optional element registry used by the runtime. */
  elementRegistry?: {
    has(id: string): boolean;
    getElementById?(id: string): HTMLElement | null;
  };
  /** Called whenever selection changes (including clear). */
  onSelectionChange?: (state: SelectionState) => void;
  /** If true, selection can be changed by hover (defaults to false). */
  hoverSelect?: boolean;
};

const SKIP_TAGS = new Set([
  'HTML',
  'HEAD',
  'BODY',
  'SCRIPT',
  'STYLE',
  'META',
  'LINK',
  'TITLE',
]);

export class SelectionController {
  private readonly previewRoot: HTMLElement;
  private readonly elementRegistry?: SelectionControllerOptions['elementRegistry'];
  private readonly onSelectionChange?: (state: SelectionState) => void;
  private readonly hoverSelect: boolean;

  private state: SelectionState = { selectedElementId: '', bounds: null };
  private disposed = false;

  private onClickCapture?: (e: MouseEvent) => void;
  private onMoveCapture?: (e: MouseEvent) => void;
  private onKeyDownCapture?: (e: KeyboardEvent) => void;

  constructor(options: SelectionControllerOptions) {
    this.previewRoot = options.previewRoot;
    this.elementRegistry = options.elementRegistry;
    this.onSelectionChange = options.onSelectionChange;
    this.hoverSelect = Boolean(options.hoverSelect);
  }

  /** Initialize listeners. Safe to call once. */
  init(): void {
    if (this.disposed) return;

    // Capture phase so we still receive events even if the app stops propagation.
    this.onClickCapture = (e) => {
      if (this.disposed) return;
      const target = e.target as HTMLElement | null;
      const hit = this.hitTest(target);
      if (hit) {
        this.setSelected(hit.id, hit.element);
      } else {
        this.clear();
      }
    };

    this.onMoveCapture = (e) => {
      if (!this.hoverSelect) return;
      if (this.disposed) return;
      const target = e.target as HTMLElement | null;
      const hit = this.hitTest(target);
      if (hit) {
        // Avoid spamming updates if element does not change.
        if (hit.id !== this.state.selectedElementId) {
          this.setSelected(hit.id, hit.element);
        }
      }
    };

    this.onKeyDownCapture = (e) => {
      if (this.disposed) return;
      // ESC clears selection (Cursor-like)
      if (e.key === 'Escape') {
        this.clear();
      }
    };

    document.addEventListener('click', this.onClickCapture, true);
    if (this.hoverSelect) {
      document.addEventListener('mousemove', this.onMoveCapture, true);
    }
    document.addEventListener('keydown', this.onKeyDownCapture, true);

    // Ensure initial callback is consistent
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.onClickCapture) {
      document.removeEventListener('click', this.onClickCapture, true);
    }
    if (this.onMoveCapture) {
      document.removeEventListener('mousemove', this.onMoveCapture, true);
    }
    if (this.onKeyDownCapture) {
      document.removeEventListener('keydown', this.onKeyDownCapture, true);
    }
  }

  getState(): SelectionState {
    return this.state;
  }

  clear(): void {
    if (this.state.selectedElementId === '' && this.state.bounds === null) return;
    this.state = { selectedElementId: '', bounds: null };
    this.emit();
  }

  /** Force-select by id (used by other systems). */
  selectById(elementId: string): void {
    if (!elementId) {
      this.clear();
      return;
    }

    const elFromRegistry = this.elementRegistry?.getElementById
      ? this.elementRegistry.getElementById(elementId)
      : null;

    const el =
      elFromRegistry ??
      (this.previewRoot.querySelector(`[data-element-id="${cssEscape(elementId)}"]`) as HTMLElement | null);

    if (!el) {
      this.clear();
      return;
    }

    this.setSelected(elementId, el);
  }

  // -----------------------------
  // Internals
  // -----------------------------

  private emit(): void {
    try {
      this.onSelectionChange?.(this.state);
    } catch {
      // never crash selection loop
    }
  }

  private setSelected(elementId: string, element: HTMLElement): void {
    // Bounds are in viewport coordinates. Overlays can convert as needed.
    const rect = element.getBoundingClientRect();

    // Defensive: avoid NaN/Infinity
    const safeRect =
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height)
        ? rect
        : null;

    this.state = {
      selectedElementId: elementId,
      bounds: safeRect,
    };

    this.emit();
  }

  /**
   * Hit-test from an event target.
   * Prefers `[data-element-id]` ancestry and keeps strict containment within previewRoot.
   *
   * IMPORTANT: We MUST work even when ElementRegistry exists but is empty.
   * So we treat registry as an enhancement, not a gate.
   */
  private hitTest(target: HTMLElement | null): { id: string; element: HTMLElement } | null {
    if (!target) return null;

    // Ignore clicks outside previewRoot
    if (!this.previewRoot.contains(target)) return null;

    // Ignore overlay nodes (we tag overlays with data-preview-overlay if present)
    const overlayHost = target.closest('[data-preview-overlay="true"]');
    if (overlayHost) return null;

    let el: HTMLElement | null = target;
    while (el && el !== this.previewRoot && el !== document.body) {
      if (SKIP_TAGS.has(el.tagName)) {
        el = el.parentElement;
        continue;
      }

      const id = el.getAttribute('data-element-id');
      if (id && id.trim().length > 0) {
        // Registry is a hint; do NOT block selection if registry is empty.
        if (this.elementRegistry && this.elementRegistry.has(id)) {
          return { id, element: el };
        }

        // If registry does not have it (or registry missing), still accept.
        return { id, element: el };
      }

      el = el.parentElement;
    }

    // If the root itself is selectable
    const rootId = this.previewRoot.getAttribute('data-element-id');
    if (rootId && rootId.trim().length > 0) {
      return { id: rootId, element: this.previewRoot };
    }

    return null;
  }
}

// -----------------------------
// Utils
// -----------------------------

function cssEscape(value: string): string {
  // Minimal escape for attribute selector usage.
  // This is not a full CSS.escape polyfill, but sufficient for our element-id format.
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
