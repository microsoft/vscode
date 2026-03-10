/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

// ==================== Graft <-> Host Message Protocol ====================

/** Messages from graft (webview) -> host (canvas editor) */
export type GraftToHostMessage =
	| { type: 'phonon:data:fetch'; requestId: string; entity: string; query?: Record<string, unknown> }
	| { type: 'phonon:data:mutate'; requestId: string; entity: string; operation: 'create' | 'update' | 'delete'; data: unknown }
	| { type: 'phonon:navigate'; viewId: string; params?: Record<string, unknown> }
	| { type: 'phonon:intent'; description: string }
	| { type: 'phonon:setTitle'; title: string }
	| { type: 'phonon:setLoading'; loading: boolean }
	| { type: 'phonon:setState'; key: string; value: unknown }
	| { type: 'phonon:ready' };

/** Messages from host (canvas editor) -> graft (webview) */
export type HostToGraftMessage =
	| { type: 'phonon:data:response'; requestId: string; success: boolean; data?: unknown; error?: string }
	| { type: 'phonon:params'; params: Record<string, unknown> }
	| { type: 'phonon:init'; graftId: string; entity?: string }
	| { type: 'phonon:stateUpdate'; state: Record<string, unknown> };

/** Fired when a graft updates its state via phonon.setState(). */
export interface IGraftStateChange {
	readonly graftId: string;
	readonly key: string;
	readonly value: unknown;
}

// ==================== Data Resolution Interface ====================

/**
 * Data resolution interface for graft data requests.
 * Implemented by mock provider (dev/testing) and real providers (production).
 */
export interface ILiquidDataResolver {
	readonly _serviceBrand: undefined;
	fetch(entity: string, query?: Record<string, unknown>): Promise<unknown[]>;
	mutate(entity: string, operation: 'create' | 'update' | 'delete', data: unknown): Promise<void>;
}

export const ILiquidDataResolver = createDecorator<ILiquidDataResolver>('liquidDataResolver');

// ==================== Webview Abstraction ====================

/**
 * Transport abstraction for graft <-> host communication.
 * Decouples the host handler from the underlying transport (WebviewElement,
 * raw iframe, or test mock).
 *
 * Relationship: membrana -- boundary interface between host and sandboxed graft.
 */
export interface IGraftWebview {
	postMessage(message: HostToGraftMessage): Promise<boolean>;
	readonly onDidReceiveMessage: Event<GraftToHostMessage>;
}

// ==================== Host-side Message Handler ====================

/**
 * Host-side message handler for one graft webview.
 * Listens to messages from the webview and routes requests to the data resolver.
 *
 * Relationship: transmembrana (recettore) -- receives signals from the graft webview
 * boundary and propagates them to internal data resolution.
 */
export class LiquidGraftSlotHost extends Disposable {

	private readonly _onDidStateChange = this._register(new Emitter<IGraftStateChange>());
	/** Fires when the graft calls phonon.setState(key, value). */
	readonly onDidStateChange: Event<IGraftStateChange> = this._onDidStateChange.event;

	constructor(
		private readonly webview: IGraftWebview,
		private readonly graftId: string,
		private readonly entity: string | undefined,
		private readonly params: Record<string, unknown> | undefined,
		private readonly dataResolver: ILiquidDataResolver,
		private readonly logService: ILogService,
	) {
		super();
		this._register(webview.onDidReceiveMessage(msg => this._handleMessage(msg)));
	}

	/**
	 * Handle a message from the graft. Public so that external message
	 * listeners (e.g. raw iframe postMessage) can route messages here.
	 */
	handleExternalMessage(msg: GraftToHostMessage): void {
		this._handleMessage(msg);
	}

	private async _handleMessage(msg: GraftToHostMessage): Promise<void> {
		if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('phonon:')) {
			return;
		}

		switch (msg.type) {
			case 'phonon:ready':
				this._sendToGraft({ type: 'phonon:init', graftId: this.graftId, entity: this.entity });
				if (this.params) {
					this._sendToGraft({ type: 'phonon:params', params: this.params });
				}
				break;

			case 'phonon:data:fetch':
				try {
					const data = await this.dataResolver.fetch(msg.entity, msg.query);
					this._sendToGraft({ type: 'phonon:data:response', requestId: msg.requestId, success: true, data });
				} catch (err) {
					this._sendToGraft({ type: 'phonon:data:response', requestId: msg.requestId, success: false, error: String(err) });
				}
				break;

			case 'phonon:data:mutate':
				try {
					await this.dataResolver.mutate(msg.entity, msg.operation, msg.data);
					this._sendToGraft({ type: 'phonon:data:response', requestId: msg.requestId, success: true });
				} catch (err) {
					this._sendToGraft({ type: 'phonon:data:response', requestId: msg.requestId, success: false, error: String(err) });
				}
				break;

			case 'phonon:navigate':
				this.logService.info(`[Phonon Graft Bridge] Navigate request: viewId=${msg.viewId}`);
				break;

			case 'phonon:intent':
				this.logService.info(`[Phonon Graft Bridge] Intent request: ${msg.description}`);
				break;

			case 'phonon:setTitle':
				this.logService.trace(`[Phonon Graft Bridge] setTitle: ${msg.title}`);
				break;

			case 'phonon:setLoading':
				this.logService.trace(`[Phonon Graft Bridge] setLoading: ${msg.loading}`);
				break;

			case 'phonon:setState':
				this.logService.trace(`[Phonon Graft Bridge] setState: ${msg.key}`);
				this._onDidStateChange.fire({ graftId: this.graftId, key: msg.key, value: msg.value });
				break;
		}
	}

	/**
	 * Push a full state snapshot to the graft iframe.
	 * Used for state restoration after hot reload.
	 */
	pushState(state: Record<string, unknown>): void {
		this._sendToGraft({ type: 'phonon:stateUpdate', state });
	}

	private _sendToGraft(msg: HostToGraftMessage): void {
		this.webview.postMessage(msg).then(ok => {
			if (!ok) {
				this.logService.warn(`[Phonon Graft Bridge] postMessage failed for graft ${this.graftId}`);
			}
		});
	}
}
