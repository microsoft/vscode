/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEvent } from '@github/copilot-sdk';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentCanvasInput, IAgentCanvas, IAgentCanvasType, isAgentCanvasInput, readAgentCanvases, withAgentCanvases } from '../common/meta/agentCanvasMeta.js';
import { parseChatUri } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostCanvasController = createDecorator<IAgentHostCanvasController>('agentHostCanvasController');

export interface IAgentHostCanvasController {
	readonly _serviceBrand: undefined;
	registerSession(session: URI, chat: URI, sdk: CopilotSession): IDisposable;
	closeCanvas(session: URI, chat: URI, instanceId: string): Promise<void>;
	listCanvases(session: URI, chat: URI): Promise<readonly IAgentCanvasType[]>;
	openCanvas(session: URI, chat: URI, extensionId: string, canvasTypeId: string, input?: AgentCanvasInput): Promise<IAgentCanvas>;
}

interface ILiveCanvasChat {
	readonly session: string;
	readonly chat: string;
	readonly sdk: CopilotSession;
	readonly instances: Map<string, IAgentCanvas>;
	readonly store: DisposableStore;
	readonly pendingEvents: (() => void)[];
	initializing: boolean;
}

/** Projects provider-owned live canvases into session metadata without persisting transient URLs. */
export class AgentHostCanvasController extends Disposable implements IAgentHostCanvasController {
	declare readonly _serviceBrand: undefined;
	private readonly _chats = new Map<string, ILiveCanvasChat>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._stateManager.onDidRemoveSession(session => {
			for (const entry of this._chats.values()) {
				if (entry.session === session) {
					entry.store.dispose();
				}
			}
		}));
		this._register(toDisposable(() => {
			for (const entry of this._chats.values()) {
				entry.store.dispose();
			}
		}));
	}

	registerSession(session: URI, chat: URI, sdk: CopilotSession): IDisposable {
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		if (parseChatUri(chat)?.session !== sessionKey) {
			throw new Error('Canvas chat must belong to its session');
		}
		this._chats.get(chatKey)?.store.dispose();
		const store = new DisposableStore();
		const entry: ILiveCanvasChat = { session: sessionKey, chat: chatKey, sdk, instances: new Map(), store, pendingEvents: [], initializing: true };
		this._chats.set(chatKey, entry);
		store.add(toDisposable(() => {
			entry.pendingEvents.length = 0;
			if (this._chats.get(chatKey) === entry) {
				this._chats.delete(chatKey);
				entry.instances.clear();
				this._publish(entry);
			}
		}));
		store.add(toDisposable(sdk.on(event => {
			if (event.type === 'session.shutdown') {
				store.dispose();
			} else if (event.type === 'session.canvas.opened' || event.type === 'session.canvas.closed' || event.type === 'session.canvas.unavailable') {
				if (entry.initializing) {
					entry.pendingEvents.push(() => this._applyEvent(entry, event));
				}
				this._applyEvent(entry, event);
				this._publish(entry);
			}
		})));
		// A provider may materialize before its host session is announced.
		store.add(this._stateManager.onDidEmitNotification(notification => {
			if (notification.type === 'root/sessionAdded' && notification.summary.resource === sessionKey) {
				this._publish(entry);
			}
		}));
		this._publish(entry);
		void this._initialize(entry).then(instances => {
			if (store.isDisposed) {
				return;
			}
			entry.instances.clear();
			for (const instance of instances) {
				entry.instances.set(instance.instanceId, instance);
			}
			for (const apply of entry.pendingEvents) {
				apply();
			}
			entry.pendingEvents.length = 0;
			entry.initializing = false;
			this._publish(entry);
		});
		return store;
	}

	private async _initialize(entry: ILiveCanvasChat): Promise<readonly IAgentCanvas[]> {
		try {
			const snapshot = await entry.sdk.rpc.canvas.listOpen();
			return snapshot.openCanvases.map(instance => ({
				chat: entry.chat,
				instanceId: instance.instanceId,
				canvasTypeId: instance.canvasId,
				extensionId: instance.extensionId,
				title: instance.title,
				status: instance.status,
				url: instance.url,
			}));
		} catch (error) {
			if (!entry.store.isDisposed) {
				this._logService.warn('[AgentHostCanvasController] Failed to read live canvases', error);
			}
			return [];
		}
	}

	private _applyEvent(entry: ILiveCanvasChat, event: SessionEvent): void {
		if (event.type === 'session.canvas.opened') {
			const instance = event.data;
			entry.instances.set(instance.instanceId, {
				chat: entry.chat,
				instanceId: instance.instanceId,
				canvasTypeId: instance.canvasId,
				extensionId: instance.extensionId,
				title: instance.title,
				status: instance.status,
				url: instance.url,
				revision: event.id,
			});
		} else if (event.type === 'session.canvas.closed') {
			entry.instances.delete(event.data.instanceId);
		} else if (event.type === 'session.canvas.unavailable') {
			const instance = entry.instances.get(event.data.instanceId);
			if (instance) {
				entry.instances.set(instance.instanceId, { ...instance, unavailable: true });
			}
		}
	}

	private _publish(entry: ILiveCanvasChat): void {
		const state = this._stateManager.getSessionState(entry.session);
		if (!state) {
			return;
		}
		const instances = [...entry.instances.values()];
		if (!equals(readAgentCanvases(state).filter(canvas => canvas.chat === entry.chat), instances)) {
			this._stateManager.setSessionMeta(entry.session, withAgentCanvases(state._meta, entry.chat, instances));
		}
	}

	async closeCanvas(session: URI, chat: URI, instanceId: string): Promise<void> {
		const entry = this._chats.get(chat.toString());
		if (!instanceId.trim() || parseChatUri(chat)?.session !== session.toString() || entry?.session !== session.toString() || !entry.instances.has(instanceId)) {
			throw new Error('Canvas instance is not owned by the requested live chat');
		}
		const instance = entry.instances.get(instanceId);
		await entry.sdk.rpc.canvas.close({ instanceId });
		if (this._chats.get(entry.chat) === entry && entry.instances.get(instanceId)?.revision === instance?.revision) {
			if (entry.initializing) {
				entry.pendingEvents.push(() => entry.instances.delete(instanceId));
			}
			entry.instances.delete(instanceId);
			this._publish(entry);
		}
	}

	private _getLiveChat(session: URI, chat: URI): ILiveCanvasChat {
		const entry = this._chats.get(chat.toString());
		if (parseChatUri(chat)?.session !== session.toString() || entry?.session !== session.toString()) {
			throw new Error('Canvas requires an owned live chat');
		}
		return entry;
	}

	async listCanvases(session: URI, chat: URI): Promise<readonly IAgentCanvasType[]> {
		const entry = this._getLiveChat(session, chat);
		const result = await entry.sdk.rpc.canvas.list();
		if (this._chats.get(entry.chat) !== entry) {
			throw new Error('Canvas chat was disposed while listing');
		}
		return result.canvases.map(canvas => ({
			canvasTypeId: canvas.canvasId, extensionId: canvas.extensionId,
			displayName: canvas.displayName, description: canvas.description,
			inputSchema: canvas.inputSchema as IJSONSchema | undefined,
		}));
	}

	async openCanvas(session: URI, chat: URI, extensionId: string, canvasTypeId: string, input?: AgentCanvasInput): Promise<IAgentCanvas> {
		if (!extensionId.trim() || !canvasTypeId.trim() || (input !== undefined && !isAgentCanvasInput(input))) {
			throw new Error('Canvas requires a provider, canvas type, and JSON input');
		}
		const entry = this._getLiveChat(session, chat);
		const catalog = await this.listCanvases(session, chat);
		if (this._chats.get(entry.chat) !== entry) {
			throw new Error('Canvas chat was disposed while opening');
		}
		if (!catalog.some(canvas => canvas.extensionId === extensionId && canvas.canvasTypeId === canvasTypeId)) {
			throw new Error('Canvas provider or type is not available in this chat');
		}
		const existing = [...entry.instances.values()].find(canvas => canvas.extensionId === extensionId && canvas.canvasTypeId === canvasTypeId);
		const instanceId = existing?.instanceId ?? generateUuid();
		let receivedEvent = false;
		const listener = entry.store.add(toDisposable(entry.sdk.on(event => {
			if ((event.type === 'session.canvas.opened' || event.type === 'session.canvas.closed' || event.type === 'session.canvas.unavailable') && event.data.instanceId === instanceId) {
				receivedEvent = true;
			}
		})));
		let opened: Awaited<ReturnType<CopilotSession['rpc']['canvas']['open']>>;
		try {
			opened = await entry.sdk.rpc.canvas.open({ extensionId, canvasId: canvasTypeId, instanceId, input });
		} finally {
			entry.store.delete(listener);
			listener.dispose();
		}
		if (this._chats.get(entry.chat) !== entry) {
			throw new Error('Canvas chat was disposed while opening');
		}
		const published = entry.instances.get(instanceId);
		if (receivedEvent) {
			if (!published) {
				throw new Error('Canvas was closed while opening');
			}
			return published;
		}
		const canvas: IAgentCanvas = {
			chat: entry.chat, instanceId: opened.instanceId, canvasTypeId: opened.canvasId,
			extensionId: opened.extensionId, title: opened.title, url: opened.url, status: opened.status,
			revision: published && published !== existing ? published.revision : generateUuid(),
		};
		const apply = () => entry.instances.set(instanceId, canvas);
		if (entry.initializing) {
			entry.pendingEvents.push(apply);
		}
		apply();
		this._publish(entry);
		return canvas;
	}
}
