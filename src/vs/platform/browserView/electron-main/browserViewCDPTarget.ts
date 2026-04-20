/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CDPTargetInfo, ICDPConnection, ICDPTarget } from '../common/cdp/types.js';
import type { BrowserView } from './browserView.js';

/**
 * Wraps a {@link BrowserViewDebugger} transport as an {@link ICDPTarget},
 * tracking sessions and forwarding target-info changes for a single
 * CDP target (page, worker, iframe, etc.).
 */
export class BrowserViewCDPTarget extends Disposable implements ICDPTarget {
	protected readonly _sessions = new Map<string, ICDPConnection>();
	get sessions(): ReadonlyMap<string, ICDPConnection> { return this._sessions; }

	private readonly _onSessionCreated = this._register(new Emitter<{ session: ICDPConnection; waitingForDebugger: boolean }>());
	readonly onSessionCreated = this._onSessionCreated.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private readonly _onTargetInfoChanged = this._register(new Emitter<CDPTargetInfo>());
	readonly onTargetInfoChanged = this._onTargetInfoChanged.event;

	private _isDisposed = false;

	constructor(
		readonly view: BrowserView,
		protected readonly _targetInfo: CDPTargetInfo
	) {
		super();

		this._register(this.view.debugger.onTargetInfoChanged(info => {
			if (info.targetId !== this._targetInfo.targetId) {
				return;
			}

			if (info.title !== this._targetInfo.title || info.url !== this._targetInfo.url) {
				this._targetInfo.title = info.title;
				this._targetInfo.url = info.url;
				this._onTargetInfoChanged.fire(this.targetInfo);
			}
		}));

		this._register(this.view.debugger.onTargetDestroyed(targetId => {
			if (targetId === this._targetInfo.targetId) {
				this.dispose();
			}
		}));
	}

	get targetInfo(): CDPTargetInfo {
		return {
			...this._targetInfo,
			attached: this._sessions.size > 0,
			browserContextId: this.view.session.id
		};
	}

	async attach(): Promise<ICDPConnection> {
		const session = await this.view.debugger.attachToTarget(this.targetInfo.targetId);
		this.notifySessionCreated(session, false);
		return session;
	}

	notifySessionCreated(session: ICDPConnection, waitingForDebugger: boolean): void {
		if (this._sessions.has(session.sessionId)) {
			return;
		}
		if (this.sessions.size === 0) {
			// First session attached, update target info to reflect attached state.
			this._onTargetInfoChanged.fire(this.targetInfo);
		}

		this._sessions.set(session.sessionId, session);
		session.onClose(() => {
			this._sessions.delete(session.sessionId);
			if (this.sessions.size === 0) {
				// Last session detached, update target info to reflect detached state.
				this._onTargetInfoChanged.fire(this.targetInfo);
			}
		});

		this._onSessionCreated.fire({ session, waitingForDebugger });
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;

		// Dispose owned sessions.
		for (const [, session] of this._sessions) {
			session.dispose();
		}
		this._sessions.clear();

		// Signal target closure.
		this._onClose.fire();

		super.dispose();
	}
}
