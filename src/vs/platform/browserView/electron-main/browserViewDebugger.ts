/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { CDPEvent, CDPTargetInfo, ICDPConnection } from '../common/cdp/types.js';
import { BrowserView } from './browserView.js';

/**
 * CDP transport for a browser view, backed by the Electron debugger.
 *
 * Manages:
 * - Electron debugger lifecycle (attach/detach)
 * - Session registry and event routing
 * - Auto-attach via `Target.setAutoAttach` (flatten=true)
 *
 * All CDP sessions on this WebContents (root + child sessions) live in a
 * single flat registry here. Target-level abstractions (sub-target
 * discovery, {@link ICDPTarget} contract) are handled by
 * {@link BrowserViewCDPTarget} which wraps this class.
 */
export class BrowserViewDebugger extends Disposable {

	private readonly _sessions = this._register(new DisposableMap<string, DebugSession>());
	private readonly _onSessionCreated = this._register(new Emitter<{ session: ICDPConnection; waitingForDebugger: boolean }>());
	readonly onSessionCreated = this._onSessionCreated.event;

	/**
	 * Target IDs discovered via `Target.attachedToTarget`. Consumed by
	 * {@link BrowserViewCDPTarget} to create sub-target handles.
	 */
	private readonly _knownTargets = new Map<string, CDPTargetInfo>();
	get knownTargets(): ReadonlyMap<string, CDPTargetInfo> { return this._knownTargets; }

	private readonly _onTargetDiscovered = this._register(new Emitter<CDPTargetInfo>());
	/** Fired when a new targetId is seen in an attachedToTarget event. */
	readonly onTargetDiscovered = this._onTargetDiscovered.event;

	private readonly _onTargetDestroyed = this._register(new Emitter<string>());
	/** Fired when a targetId is removed via a targetDestroyed event. */
	readonly onTargetDestroyed = this._onTargetDestroyed.event;

	private readonly _onTargetInfoChanged = this._register(new Emitter<CDPTargetInfo>());
	/** Fired when targetInfo for a known target changes (e.g. title/url update). */
	readonly onTargetInfoChanged = this._onTargetInfoChanged.event;

	/** Whether any attached debugger session has paused JavaScript execution. */
	private _isPaused = false;
	get isPaused(): boolean { return this._isPaused; }

	private readonly _messageHandler: (event: Electron.Event, method: string, params: unknown, sessionId?: string) => void;
	private readonly _electronDebugger: Electron.Debugger;
	private _targetId: string | undefined;

	constructor(
		private readonly view: BrowserView,
		readonly logService: ILogService
	) {
		super();

		this._electronDebugger = view.webContents.debugger;

		this._messageHandler = (_event: Electron.Event, method: string, params: unknown, sessionId?: string) => {
			this.routeCDPEvent(method, params, sessionId);
		};
	}

	/**
	 * Attach to this debugger.
	 * Attach to a target by its targetId, returning the session.
	 * Works for both the root page and sub-targets.
	 */
	async attach(): Promise<ICDPConnection> {
		if (!this._targetId) {
			const targetInfo = await this.getTargetInfo();
			this._targetId = targetInfo.targetId;
		}
		return this.attachToTarget(this._targetId);
	}

	async attachToTarget(targetId: string): Promise<ICDPConnection> {
		this.ensureAttached();
		const result = await this._electronDebugger.sendCommand('Target.attachToTarget', {
			targetId,
			flatten: true
		}) as { sessionId: string };

		if (!this._sessions.has(result.sessionId)) {
			throw new Error(`Failed to attach to target ${targetId}`);
		}

		return this._sessions.get(result.sessionId)!;
	}

	async getTargetInfo(): Promise<CDPTargetInfo> {
		this.ensureAttached();
		const result = await this._electronDebugger.sendCommand('Target.getTargetInfo') as { targetInfo: CDPTargetInfo };
		return result.targetInfo;
	}

	/**
	 * Send a CDP command. Handles Electron-specific workarounds in a single place.
	 */
	sendCommand(method: string, params?: unknown, sessionId?: string): Promise<unknown> {
		// This crashes Electron. Don't pass it through.
		if (method === 'Emulation.setDeviceMetricsOverride') {
			return Promise.resolve({});
		}

		this.ensureAttached();
		const resultPromise = this._electronDebugger.sendCommand(method, params, sessionId);

		// Electron overrides dialog behavior — manually dismiss open dialogs.
		if (method === 'Page.handleJavaScriptDialog') {
			this.view.webContents.emit('-cancel-dialogs');
		}

		return resultPromise;
	}

	private ensureAttached(): void {
		if (this._electronDebugger.isAttached()) {
			return;
		}

		this._electronDebugger.on('message', this._messageHandler);
		this._electronDebugger.attach('1.3');

		// We use auto-attach to discover descendent targets.
		// Regular target discovery doesn't provide ancestor information for workers,
		// And we have to filter to avoid including targets from other pages or VS Code internals.
		void this._electronDebugger.sendCommand('Target.setAutoAttach', {
			autoAttach: true,
			flatten: true,
			waitForDebuggerOnStart: false
		});
		// We still set discoverTargets so we get target info updates.
		void this._electronDebugger.sendCommand('Target.setDiscoverTargets', {
			discover: true
		});
	}

	private detachElectronDebugger(): void {
		try {
			if (this.view.webContents.isDestroyed() || !this._electronDebugger.isAttached()) {
				return;
			}

			this._electronDebugger.removeListener('message', this._messageHandler);
			this._electronDebugger.detach();
		} catch {
			// WebContents may already be destroyed or in an inconsistent state
		}
	}

	/**
	 * Route a CDP event from the Electron debugger.
	 */
	private routeCDPEvent(method: string, params: unknown, sessionId?: string): void {
		if (method === 'Target.attachedToTarget') {
			const p = params as { sessionId: string; targetInfo: CDPTargetInfo; waitingForDebugger: boolean };
			this.registerSession(p.sessionId, p.targetInfo, p.waitingForDebugger, sessionId);
		} else if (method === 'Target.detachedFromTarget') {
			const p = params as { sessionId: string };
			this._sessions.deleteAndDispose(p.sessionId);
		} else if (method === 'Target.targetDestroyed') {
			const p = params as { targetId: string };
			this.destroyTarget(p.targetId);
		} else if (method === 'Target.targetInfoChanged' && !sessionId) {
			const p = params as { targetInfo: CDPTargetInfo };
			if (this._knownTargets.has(p.targetInfo.targetId)) {
				this._knownTargets.set(p.targetInfo.targetId, p.targetInfo);
				this._onTargetInfoChanged.fire(p.targetInfo);
			}
		} else if (method === 'Debugger.paused') {
			this._isPaused = true;
		} else if (method === 'Debugger.resumed') {
			this._isPaused = false;
		}

		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (session) {
			session.emitEvent({ method, params, sessionId });
		}
	}

	/**
	 * A target was destroyed by the Electron debugger.
	 * Dispose all sessions belonging to that target before firing the
	 * lifecycle event so that listeners never observe stale sessions.
	 */
	private destroyTarget(targetId: string): void {
		const toDispose: string[] = [];
		for (const [sessionId, session] of this._sessions) {
			if (session.targetId === targetId) {
				toDispose.push(sessionId);
			}
		}
		for (const sessionId of toDispose) {
			this._sessions.deleteAndDispose(sessionId);
		}

		if (this._knownTargets.delete(targetId)) {
			this._onTargetDestroyed.fire(targetId);
		}
	}

	private registerSession(sessionId: string, targetInfo: CDPTargetInfo, waitingForDebugger: boolean, parentSessionId: string | undefined): DebugSession {
		if (!this._knownTargets.has(targetInfo.targetId) && targetInfo.targetId !== this._targetId) {
			this._knownTargets.set(targetInfo.targetId, targetInfo);
			this._onTargetDiscovered.fire(targetInfo);
		}

		if (this._sessions.has(sessionId)) {
			return this._sessions.get(sessionId)!;
		}

		const session = new DebugSession(parentSessionId, sessionId, targetInfo.targetId, this);
		this._sessions.set(sessionId, session);
		session.onClose(() => this._sessions.deleteAndDispose(sessionId));

		this._onSessionCreated.fire({ session, waitingForDebugger });

		return session;
	}

	override dispose(): void {
		this.detachElectronDebugger();
		super.dispose();
	}
}

/**
 * A CDP session backed by the Electron debugger.
 *
 * Pure plumbing — holds a sessionId, emits events, and delegates
 * commands to the root {@link BrowserViewDebugger}.
 */
class DebugSession extends Disposable implements ICDPConnection {
	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent = this._onEvent.event;
	readonly emitEvent = (event: CDPEvent) => this._onEvent.fire(event);

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private _isDisposed = false;

	constructor(
		public readonly parentSessionId: string | undefined,
		public readonly sessionId: string,
		public readonly targetId: string,
		private readonly _debugger: BrowserViewDebugger,
	) {
		super();
	}

	async sendCommand(method: string, params?: unknown): Promise<unknown> {
		return this._debugger.sendCommand(method, params, this.sessionId);
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;

		this._onClose.fire();
		super.dispose();
	}
}
