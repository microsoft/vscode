/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import {
	AIAgentNativeEvent,
	ExtHostAIAgentShape,
	MainContext,
	MainThreadAIAgentShape
} from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';

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
 * - Phase 2: Basic handler registration and event firing (COMPLETED)
 * - Phase 3.1: MainThread proxy infrastructure (CURRENT)
 * - Phase 3.2: Full command interception with CommandService
 * - Phase 3.3: DOM overlay rendering
 * - Phase 3.6: Native event forwarding
 */
export interface IExtHostAIAgent {
	/**
	 * Intercept a command before it executes.
	 * The handler receives the command arguments and returns whether to proceed.
	 *
	 * @param commandId The command to intercept (e.g., 'workbench.action.files.save')
	 * @param handler Async function that returns true to allow, false to cancel
	 * @returns Disposable to unregister the interceptor
	 */
	interceptCommand(commandId: string, handler: (args: any[]) => Promise<boolean>): IDisposable;

	/**
	 * Request access to create overlay widgets in the editor area.
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
 * Implementation of IExtHostAIAgent with MainThread proxy integration.
 *
 * Communication flow:
 * Extension API → ExtHostAIAgent → [RPC] → MainThreadAIAgent → VS Code Services
 */
export class ExtHostAIAgent extends Disposable implements IExtHostAIAgent, ExtHostAIAgentShape {

	private readonly _commandInterceptors = new Map<string, Set<(args: any[]) => Promise<boolean>>>();
	private readonly _overlays = new Map<string, OverlayHandle>();
	private _overlayIdCounter = 0;

	private readonly _onNativeEvent = this._register(new Emitter<NativeEvent>());
	readonly onNativeEvent: Event<NativeEvent> = this._onNativeEvent.event;

	private readonly _proxy: MainThreadAIAgentShape;

	constructor(
		extHostRpc: IExtHostRpcService
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadAIAgent);
	}

	// ─────────────────────────────────────────────────────────────────
	// Public API (IExtHostAIAgent)
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Register a command interceptor.
	 * When a command is about to execute, the handler will be called.
	 * If the handler returns false, the command execution is blocked.
	 */
	interceptCommand(commandId: string, handler: (args: any[]) => Promise<boolean>): IDisposable {
		if (!this._commandInterceptors.has(commandId)) {
			this._commandInterceptors.set(commandId, new Set());
			// Notify MainThread that we want to intercept this command
			this._proxy.$registerCommandInterceptor(commandId);
		}

		const handlers = this._commandInterceptors.get(commandId)!;
		handlers.add(handler);

		return toDisposable(() => {
			handlers.delete(handler);
			if (handlers.size === 0) {
				this._commandInterceptors.delete(commandId);
				// Notify MainThread we no longer need to intercept this command
				this._proxy.$unregisterCommandInterceptor(commandId);
			}
		});
	}

	/**
	 * Request access to create overlay widgets.
	 * Creates an overlay via MainThread proxy for DOM rendering.
	 */
	async requestOverlayAccess(): Promise<OverlayHandle> {
		const localId = `ai-agent-overlay-${++this._overlayIdCounter}`;

		// Create overlay via MainThread
		const mainThreadId = await this._proxy.$createOverlay({
			line: 1,
			column: 1,
			html: ''
		});

		const handle: OverlayHandle = {
			id: localId,
			updatePosition: (line: number, column: number) => {
				this._proxy.$updateOverlayPosition(mainThreadId, { line, column });
			},
			updateContent: (html: string) => {
				this._proxy.$updateOverlayContent(mainThreadId, html);
			},
			dispose: () => {
				this._overlays.delete(localId);
				this._proxy.$destroyOverlay(mainThreadId);
			}
		};

		this._overlays.set(localId, handle);
		return handle;
	}

	// ─────────────────────────────────────────────────────────────────
	// ExtHostAIAgentShape Implementation (called from MainThread)
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Called by MainThread to check if a command should be allowed.
	 * Executes all registered handlers for the command.
	 */
	async $shouldAllowCommand(commandId: string, args: any[]): Promise<boolean> {
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
	 * Called by MainThread when a native event occurs.
	 * Forwards the event to all listeners.
	 */
	$onNativeEvent(event: AIAgentNativeEvent): void {
		// Convert protocol type to public type
		const nativeEvent: NativeEvent = event;
		this._onNativeEvent.fire(nativeEvent);
	}

	// ─────────────────────────────────────────────────────────────────
	// Internal Methods
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Legacy method for backward compatibility.
	 * Use $onNativeEvent instead.
	 * @deprecated
	 * @internal
	 */
	fireNativeEvent(event: NativeEvent): void {
		this._onNativeEvent.fire(event);
	}

	/**
	 * Get all registered command interceptors (for debugging).
	 * @internal
	 */
	getInterceptedCommands(): string[] {
		return Array.from(this._commandInterceptors.keys());
	}

	/**
	 * Get overlay count (for debugging).
	 * @internal
	 */
	getOverlayCount(): number {
		return this._overlays.size;
	}
}

// ─────────────────────────────────────────────────────────────────
// Singleton Pattern (Backward Compatibility)
// ─────────────────────────────────────────────────────────────────

// Note: This singleton pattern is maintained for backward compatibility
// with Phase 2 code. New code should use dependency injection.
let _instance: ExtHostAIAgent | undefined;
let _rpcService: IExtHostRpcService | undefined;

/**
 * Set the RPC service for singleton initialization.
 * Must be called before getExtHostAIAgent().
 * @internal
 */
export function setExtHostRpcService(rpcService: IExtHostRpcService): void {
	_rpcService = rpcService;
}

/**
 * Get the singleton ExtHostAIAgent instance.
 * @deprecated Use dependency injection with IExtHostRpcService instead.
 */
export function getExtHostAIAgent(): ExtHostAIAgent {
	if (!_instance) {
		if (!_rpcService) {
			throw new Error('[ExtHostAIAgent] RPC service not initialized. Call setExtHostRpcService first.');
		}
		_instance = new ExtHostAIAgent(_rpcService);
	}
	return _instance;
}

/**
 * Create a new ExtHostAIAgent instance (for testing or custom scenarios).
 * @internal
 */
export function createExtHostAIAgent(rpcService: IExtHostRpcService): ExtHostAIAgent {
	return new ExtHostAIAgent(rpcService);
}
