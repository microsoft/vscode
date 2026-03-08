/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mainWindow } from '../../../../base/browser/window.js';

// ==================== Card <-> Host Message Protocol ====================

/** Messages from card (iframe) -> host (canvas editor) */
export type CardToHostMessage =
	| { type: 'phonon:data:fetch'; requestId: string; entity: string; query?: Record<string, unknown> }
	| { type: 'phonon:data:mutate'; requestId: string; entity: string; operation: 'create' | 'update' | 'delete'; data: unknown }
	| { type: 'phonon:navigate'; viewId: string; params?: Record<string, unknown> }
	| { type: 'phonon:intent'; description: string }
	| { type: 'phonon:setTitle'; title: string }
	| { type: 'phonon:setLoading'; loading: boolean }
	| { type: 'phonon:ready' };

/** Messages from host (canvas editor) -> card (iframe) */
export type HostToCardMessage =
	| { type: 'phonon:data:response'; requestId: string; success: boolean; data?: unknown; error?: string }
	| { type: 'phonon:params'; params: Record<string, unknown> }
	| { type: 'phonon:init'; cardId: string; entity?: string };

// ==================== Data Resolution Interface ====================

/**
 * Data resolution interface for card data requests.
 * Implemented by mock provider (dev/testing) and real providers (production).
 */
export interface ILiquidDataResolver {
	fetch(entity: string, query?: Record<string, unknown>): Promise<unknown[]>;
	mutate(entity: string, operation: 'create' | 'update' | 'delete', data: unknown): Promise<void>;
}

// ==================== Host-side Message Handler ====================

/**
 * Host-side message handler for one card iframe.
 * Listens to postMessage from the iframe and routes requests to the data resolver.
 *
 * Relationship: transmembrana (recettore) - receives signals from the card iframe
 * boundary and propagates them to internal data resolution.
 */
export class LiquidCardSlotHost extends Disposable {

	constructor(
		private readonly iframe: HTMLIFrameElement,
		private readonly cardId: string,
		private readonly entity: string | undefined,
		private readonly params: Record<string, unknown> | undefined,
		private readonly dataResolver: ILiquidDataResolver,
		private readonly logService: ILogService,
	) {
		super();
		this._register(dom.addDisposableListener(mainWindow, 'message', (e: MessageEvent) => this._onMessage(e)));
	}

	private _onMessage(e: MessageEvent): void {
		// Only handle messages from our iframe
		if (e.source !== this.iframe.contentWindow) {
			return;
		}

		const msg = e.data as CardToHostMessage;
		if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('phonon:')) {
			return;
		}

		this._handleMessage(msg);
	}

	private async _handleMessage(msg: CardToHostMessage): Promise<void> {
		switch (msg.type) {
			case 'phonon:ready':
				this._sendToCard({ type: 'phonon:init', cardId: this.cardId, entity: this.entity });
				if (this.params) {
					this._sendToCard({ type: 'phonon:params', params: this.params });
				}
				break;

			case 'phonon:data:fetch':
				try {
					const data = await this.dataResolver.fetch(msg.entity, msg.query);
					this._sendToCard({ type: 'phonon:data:response', requestId: msg.requestId, success: true, data });
				} catch (err) {
					this._sendToCard({ type: 'phonon:data:response', requestId: msg.requestId, success: false, error: String(err) });
				}
				break;

			case 'phonon:data:mutate':
				try {
					await this.dataResolver.mutate(msg.entity, msg.operation, msg.data);
					this._sendToCard({ type: 'phonon:data:response', requestId: msg.requestId, success: true });
				} catch (err) {
					this._sendToCard({ type: 'phonon:data:response', requestId: msg.requestId, success: false, error: String(err) });
				}
				break;

			case 'phonon:navigate':
				this.logService.info(`[Phonon Card Bridge] Navigate request: viewId=${msg.viewId}`);
				// Navigation is handled by the canvas editor, not the bridge.
				// Future: emit an event for the canvas to handle.
				break;

			case 'phonon:intent':
				this.logService.info(`[Phonon Card Bridge] Intent request: ${msg.description}`);
				// Future: route to chat agent
				break;

			case 'phonon:setTitle':
				this.logService.trace(`[Phonon Card Bridge] setTitle: ${msg.title}`);
				// Future: update slot header
				break;

			case 'phonon:setLoading':
				this.logService.trace(`[Phonon Card Bridge] setLoading: ${msg.loading}`);
				// Future: show/hide loading indicator
				break;
		}
	}

	private _sendToCard(msg: HostToCardMessage): void {
		try {
			this.iframe.contentWindow?.postMessage(msg, '*');
		} catch {
			// iframe may have been destroyed
		}
	}
}
