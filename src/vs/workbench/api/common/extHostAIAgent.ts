/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';

/**
 * Native event types that can be captured through the AI Agent API
 */
export type NativeEvent =
	| { type: 'keydown'; key: string; modifiers: string[] }
	| { type: 'mousemove'; x: number; y: number };

/**
 * Handle for managing overlay widgets in the editor
 */
export interface OverlayHandle extends IDisposable {
	readonly id: string;
	updatePosition(line: number, column: number): void;
	updateContent(html: string): void;
}

/**
 * Internal API for Code Ship AI Agent extension
 * This interface provides privileged access to VS Code internals
 * that are not available through the standard Extension API.
 *
 * Implementation Status:
 * - Phase 2 (Current): Basic handler registration and event firing
 * - Phase 3 (Planned): Full command interception, DOM overlays, native events
 */
export interface IExtHostAIAgent {
	/**
	 * Intercept a command before it executes.
	 * The handler receives the command arguments and returns whether to proceed.
	 *
	 * NOTE: Phase 2 implementation provides handler registration and shouldAllowCommand()
	 * checking. Full integration with VS Code's command service (to actually block
	 * commands) will be implemented in Phase 3.
	 *
	 * @param commandId The command to intercept (e.g., 'workbench.action.files.save')
	 * @param handler Async function that returns true to allow, false to cancel
	 * @returns Disposable to unregister the interceptor
	 */
	interceptCommand(commandId: string, handler: (args: any[]) => Promise<boolean>): IDisposable;

	/**
	 * Request access to create overlay widgets in the editor area.
	 *
	 * NOTE: Phase 2 provides a stub implementation. Full DOM overlay rendering
	 * will be implemented in Phase 3 with MainThread proxy integration.
	 *
	 * @returns Promise resolving to an OverlayHandle for managing the overlay
	 */
	requestOverlayAccess(): Promise<OverlayHandle>;

	/**
	 * Event fired when native events (keyboard, mouse) occur.
	 * These events are not available through standard VS Code API.
	 */
	readonly onNativeEvent: Event<NativeEvent>;
}

/**
 * Implementation of IExtHostAIAgent
 */
export class ExtHostAIAgent extends Disposable implements IExtHostAIAgent {

	private readonly _commandInterceptors = new Map<string, Set<(args: any[]) => Promise<boolean>>>();
	private readonly _overlays = new Map<string, OverlayHandle>();
	private _overlayIdCounter = 0;

	private readonly _onNativeEvent = this._register(new Emitter<NativeEvent>());
	readonly onNativeEvent: Event<NativeEvent> = this._onNativeEvent.event;

	constructor() {
		super();
	}

	interceptCommand(commandId: string, handler: (args: any[]) => Promise<boolean>): IDisposable {
		if (!this._commandInterceptors.has(commandId)) {
			this._commandInterceptors.set(commandId, new Set());
		}

		const handlers = this._commandInterceptors.get(commandId)!;
		handlers.add(handler);

		return toDisposable(() => {
			handlers.delete(handler);
			if (handlers.size === 0) {
				this._commandInterceptors.delete(commandId);
			}
		});
	}

	/**
	 * Check if a command should be allowed to execute
	 * @internal Called by the command service
	 */
	async shouldAllowCommand(commandId: string, args: any[]): Promise<boolean> {
		const handlers = this._commandInterceptors.get(commandId);
		if (!handlers || handlers.size === 0) {
			return true;
		}

		for (const handler of handlers) {
			try {
				const allowed = await handler(args);
				if (!allowed) {
					return false;
				}
			} catch (err) {
				console.error(`[ExtHostAIAgent] Command interceptor error for ${commandId}:`, err);
				// On error, allow the command to proceed
			}
		}

		return true;
	}

	/**
	 * Request access to create overlay widgets.
	 *
	 * NOTE: This is a stub implementation for Phase 2.
	 * Full DOM overlay functionality will be implemented in Phase 3 ("The Body"),
	 * which requires MainThread proxy integration for:
	 * - Position updates relative to editor viewport
	 * - HTML content rendering in overlay layer
	 * - Lifecycle management with MainThread
	 *
	 * Current behavior: Returns a handle that logs operations but does not
	 * actually render overlays in the editor.
	 */
	async requestOverlayAccess(): Promise<OverlayHandle> {
		const id = `ai-agent-overlay-${++this._overlayIdCounter}`;

		console.warn(`[ExtHostAIAgent] Overlay API is a stub implementation. Full functionality coming in Phase 3.`);

		const handle: OverlayHandle = {
			id,
			updatePosition: (line: number, column: number) => {
				// Phase 3: Implement position update via MainThread proxy
				console.log(`[ExtHostAIAgent] Overlay ${id} position: ${line}:${column} (stub - not rendered)`);
			},
			updateContent: (html: string) => {
				// Phase 3: Implement content update via MainThread proxy
				console.log(`[ExtHostAIAgent] Overlay ${id} content updated (stub - not rendered)`);
			},
			dispose: () => {
				this._overlays.delete(id);
				// Phase 3: Notify MainThread to remove overlay from DOM
				console.log(`[ExtHostAIAgent] Overlay ${id} disposed`);
			}
		};

		this._overlays.set(id, handle);
		return handle;
	}

	/**
	 * Fire a native event (called from MainThread)
	 * @internal
	 */
	fireNativeEvent(event: NativeEvent): void {
		this._onNativeEvent.fire(event);
	}

	/**
	 * Get all registered command interceptors (for debugging)
	 * @internal
	 */
	getInterceptedCommands(): string[] {
		return Array.from(this._commandInterceptors.keys());
	}
}

// Singleton instance
let _instance: ExtHostAIAgent | undefined;

export function getExtHostAIAgent(): ExtHostAIAgent {
	if (!_instance) {
		_instance = new ExtHostAIAgent();
	}
	return _instance;
}
