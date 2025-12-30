/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { AIAgentCommandInterceptorService } from '../../services/aiAgent/browser/aiAgentCommandInterceptorService.js';
import { IAIAgentCommandInterceptor } from '../../services/aiAgent/common/aiAgentCommandInterceptor.js';
import {
	AIAgentNativeEvent,
	AIAgentOverlayConfig,
	AIAgentOverlayPosition,
	ExtHostAIAgentShape,
	ExtHostContext,
	MainContext,
	MainThreadAIAgentShape
} from '../common/extHost.protocol.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from '../../../editor/browser/editorBrowser.js';
import { IPosition } from '../../../editor/common/core/position.js';

/**
 * Overlay widget instance for tracking in MainThread
 */
interface OverlayWidget {
	id: string;
	config: AIAgentOverlayConfig;
	domNode: HTMLElement;
	contentWidget: AIAgentContentWidget;
	editor: ICodeEditor | null;
}

/**
 * ContentWidget implementation for AI Agent overlays.
 * Provides line/column positioning with automatic scroll tracking.
 */
class AIAgentContentWidget implements IContentWidget {
	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;
	private _position: IPosition | null = null;

	constructor(
		private readonly _id: string,
		private readonly _domNode: HTMLElement
	) {}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._position) {
			return null;
		}
		return {
			position: this._position,
			preference: [
				ContentWidgetPositionPreference.BELOW,
				ContentWidgetPositionPreference.ABOVE
			]
		};
	}

	setPosition(line: number, column: number): void {
		this._position = { lineNumber: line, column };
	}

	hide(): void {
		this._position = null;
	}
}

/**
 * MainThread proxy for AI Agent functionality.
 *
 * This class handles the MainThread side of the AI Agent Internal API,
 * providing:
 * - Command interception integration (Phase 3.2)
 * - DOM overlay rendering (Phase 3.3)
 * - Native event forwarding (Phase 3.6)
 *
 * Communication flow:
 * ExtHostAIAgent ←──RPC──ↁEMainThreadAIAgent
 */
@extHostNamedCustomer(MainContext.MainThreadAIAgent)
export class MainThreadAIAgent implements MainThreadAIAgentShape {

	private readonly _proxy: ExtHostAIAgentShape;
	private readonly _disposables = new DisposableStore();
	private readonly _overlays = new Map<string, OverlayWidget>();
	private readonly _commandInterceptors = new DisposableMap<string>();
	private _overlayIdCounter = 0;

	// Phase 3.6: Native event handling
	private readonly _nativeEventDisposables = new DisposableStore();
	private _lastMouseMoveTime = 0;
	private readonly MOUSE_MOVE_THROTTLE_MS = 50; // 20fps throttle for mousemove

	constructor(
		extHostContext: IExtHostContext,
		@IAIAgentCommandInterceptor private readonly _interceptorService: IAIAgentCommandInterceptor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAIAgent);

		// Phase 3.6: Native event listeners will be set up here
		this._setupNativeEventListeners();
	}

	dispose(): void {
		// Clean up native event listeners (Phase 3.6)
		this._nativeEventDisposables.dispose();

		// Clean up all overlay widgets
		for (const [_id, widget] of this._overlays) {
			if (widget.editor) {
				widget.editor.removeContentWidget(widget.contentWidget);
			}
			widget.domNode.remove();
		}
		this._overlays.clear();

		this._commandInterceptors.dispose();
		this._disposables.dispose();
	}

	// ─────────────────────────────────────────────────────────────────
	// Overlay Methods (Phase 3.3 - Full Implementation)
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Create a new overlay widget in the editor area.
	 *
	 * Phase 3.3: Full DOM rendering with ContentWidget.
	 */
	async $createOverlay(config: AIAgentOverlayConfig): Promise<string> {
		const id = `ai-overlay-${++this._overlayIdCounter}`;

		// 1. Create DOM element
		const domNode = document.createElement('div');
		domNode.className = 'ai-agent-overlay';
		domNode.innerHTML = config.html;
		domNode.style.cssText = `
			background: var(--vscode-editorWidget-background);
			border: 1px solid var(--vscode-editorWidget-border);
			border-radius: 4px;
			padding: 8px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.15);
			z-index: 100;
			max-width: 400px;
			max-height: 300px;
			overflow: auto;
		`;

		// 2. Create ContentWidget
		const contentWidget = new AIAgentContentWidget(id, domNode);
		contentWidget.setPosition(config.line, config.column);

		// 3. Get active editor and add widget
		const editor = this._codeEditorService.getActiveCodeEditor();
		if (editor) {
			editor.addContentWidget(contentWidget);
		}

		// 4. Store widget reference
		const widget: OverlayWidget = {
			id,
			config,
			domNode,
			contentWidget,
			editor
		};

		this._overlays.set(id, widget);

		console.log(`[MainThreadAIAgent] Overlay ${id} created at ${config.line}:${config.column}`);

		return id;
	}

	/**
	 * Update the position of an existing overlay.
	 *
	 * Phase 3.3: Full position update with layout refresh.
	 */
	async $updateOverlayPosition(id: string, position: AIAgentOverlayPosition): Promise<void> {
		const widget = this._overlays.get(id);
		if (!widget) {
			console.warn(`[MainThreadAIAgent] Overlay ${id} not found for position update`);
			return;
		}

		// Update config
		widget.config.line = position.line;
		widget.config.column = position.column;

		// Update ContentWidget position
		widget.contentWidget.setPosition(position.line, position.column);

		// Trigger layout update in editor
		if (widget.editor) {
			widget.editor.layoutContentWidget(widget.contentWidget);
		}

		console.log(`[MainThreadAIAgent] Overlay ${id} position updated to ${position.line}:${position.column}`);
	}

	/**
	 * Update the HTML content of an existing overlay.
	 *
	 * Phase 3.3: Full content update with DOM refresh.
	 */
	async $updateOverlayContent(id: string, html: string): Promise<void> {
		const widget = this._overlays.get(id);
		if (!widget) {
			console.warn(`[MainThreadAIAgent] Overlay ${id} not found for content update`);
			return;
		}

		// Update config
		widget.config.html = html;

		// Update DOM element content
		// Note: innerHTML is used here for trusted content from the extension
		widget.domNode.innerHTML = html;

		console.log(`[MainThreadAIAgent] Overlay ${id} content updated`);
	}

	/**
	 * Destroy an overlay widget and remove from DOM.
	 *
	 * Phase 3.3: Full cleanup with DOM removal.
	 */
	async $destroyOverlay(id: string): Promise<void> {
		const widget = this._overlays.get(id);
		if (!widget) {
			console.warn(`[MainThreadAIAgent] Overlay ${id} not found for destruction`);
			return;
		}

		// 1. Remove from editor
		if (widget.editor) {
			widget.editor.removeContentWidget(widget.contentWidget);
		}

		// 2. Remove DOM element (safety cleanup)
		widget.domNode.remove();

		// 3. Remove from map
		this._overlays.delete(id);

		console.log(`[MainThreadAIAgent] Overlay ${id} destroyed`);
	}

	// ─────────────────────────────────────────────────────────────────
	// Command Interception Methods (Phase 3.2 - Full Implementation)
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Register a command interceptor.
	 * The interceptor will be consulted before the command executes.
	 *
	 * Phase 3.2: Full integration with CommandService via AIAgentCommandInterceptorService.
	 */
	$registerCommandInterceptor(commandId: string): void {
		if (this._commandInterceptors.has(commandId)) {
			console.warn(`[MainThreadAIAgent] Command interceptor for ${commandId} already registered`);
			return;
		}

		// Register with the interceptor service, which is consumed by CommandService
		const interceptorService = this._interceptorService as AIAgentCommandInterceptorService;
		const disposable = interceptorService.registerInterceptor(commandId, async (cmdId, args) => {
			// Delegate to ExtHost for the actual decision
			try {
				return await this._proxy.$shouldAllowCommand(cmdId, args);
			} catch (err) {
				console.error(`[MainThreadAIAgent] Error in ExtHost interceptor for ${cmdId}:`, err);
				return true; // Allow on error
			}
		});

		this._commandInterceptors.set(commandId, disposable);
		console.log(`[MainThreadAIAgent] Command interceptor registered for ${commandId}`);
	}

	/**
	 * Unregister a command interceptor.
	 */
	$unregisterCommandInterceptor(commandId: string): void {
		if (!this._commandInterceptors.has(commandId)) {
			console.warn(`[MainThreadAIAgent] No command interceptor found for ${commandId}`);
			return;
		}

		this._commandInterceptors.deleteAndDispose(commandId);
	}

	// ─────────────────────────────────────────────────────────────────
	// Native Event Methods (Phase 3.6 - Full Implementation)
	// ─────────────────────────────────────────────────────────────────


	/**
	 * Set up native DOM event listeners for keyboard and mouse events.
	 *
	 * Phase 3.6: Full implementation with throttling for performance.
	 *
	 * Events captured:
	 * - keydown: All keyboard input with modifier keys
	 * - mousemove: Mouse position (throttled to 20fps)
	 */
	private _setupNativeEventListeners(): void {
		// 1. Keyboard Events - capture all keydown events
		const keydownHandler = (e: KeyboardEvent) => {
			const modifiers: string[] = [];
			if (e.ctrlKey) { modifiers.push('ctrl'); }
			if (e.shiftKey) { modifiers.push('shift'); }
			if (e.altKey) { modifiers.push('alt'); }
			if (e.metaKey) { modifiers.push('meta'); }

			this._proxy.$onNativeEvent({
				type: 'keydown',
				key: e.key,
				modifiers
			});
		};

		// 2. Mouse Events - throttled to prevent excessive RPC calls
		const mousemoveHandler = (e: MouseEvent) => {
			const now = Date.now();
			if (now - this._lastMouseMoveTime < this.MOUSE_MOVE_THROTTLE_MS) {
				return; // Skip if within throttle window
			}
			this._lastMouseMoveTime = now;

			this._proxy.$onNativeEvent({
				type: 'mousemove',
				x: e.clientX,
				y: e.clientY
			});
		};

		// 3. Register event listeners on document
		document.addEventListener('keydown', keydownHandler);
		document.addEventListener('mousemove', mousemoveHandler);

		// 4. Track disposables for cleanup
		this._nativeEventDisposables.add(toDisposable(() => {
			document.removeEventListener('keydown', keydownHandler);
			document.removeEventListener('mousemove', mousemoveHandler);
		}));

		console.log('[MainThreadAIAgent] Native event listeners registered (keydown, mousemove)');
	}

	/**
	 * Fire a native event to the ExtHost.
	 * Called by native event listeners set up in _setupNativeEventListeners.
	 * @internal
	 */
	fireNativeEvent(event: AIAgentNativeEvent): void {
		this._proxy.$onNativeEvent(event);
	}

	// ─────────────────────────────────────────────────────────────────
	// Internal Helper Methods (for debugging)
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Get the number of registered overlays (for debugging).
	 * @internal
	 */
	getOverlayCount(): number {
		return this._overlays.size;
	}

	/**
	 * Get all intercepted command IDs (for debugging).
	 * @internal
	 */
	getInterceptedCommands(): string[] {
		return Array.from(this._commandInterceptors.keys());
	}
}
