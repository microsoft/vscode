/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CanvasOpenedData, CanvasRecordedData, CanvasRegistryChangedCanvas, SessionEvent } from '@github/copilot-sdk';
import type { ICopilotSession } from './copilotSdkTypes.js';
import { raceCancellationError, Sequencer, timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { isAgentHostCanvasJson, type AgentHostCanvasJson, type IAgentHostCanvasActionParams, type IAgentHostCanvasDefinition, type IAgentHostCanvasInstance, type IAgentHostCanvasOpenParams, type IAgentHostCanvasState } from '../../common/agentHostCanvases.js';

type CanvasEvent = Extract<SessionEvent, { type: `session.canvas.${string}` | 'session.shutdown' }>;

function isCanvasEvent(event: SessionEvent): event is CanvasEvent {
	return event.type.startsWith('session.canvas.') || event.type === 'session.shutdown';
}

function definitionFromSdk(canvas: CanvasRegistryChangedCanvas): IAgentHostCanvasDefinition {
	return {
		extensionId: canvas.extensionId,
		canvasId: canvas.canvasId,
		displayName: canvas.displayName,
		description: canvas.description,
		...(canvas.inputSchema !== undefined ? { inputSchema: canvas.inputSchema } : {}),
		actions: (canvas.actions ?? []).map(action => ({
			name: action.name,
			...(action.description !== undefined ? { description: action.description } : {}),
			...(action.inputSchema !== undefined ? { inputSchema: action.inputSchema } : {}),
		})),
	};
}

function unavailable(canvas: CanvasRecordedData): IAgentHostCanvasInstance {
	return {
		instanceId: canvas.instanceId,
		extensionId: canvas.extensionId,
		canvasId: canvas.canvasId,
		...(canvas.title !== undefined ? { title: canvas.title } : {}),
		...(canvas.input !== undefined ? { input: canvas.input } : {}),
		availability: 'unavailable',
	};
}

function fromLiveInstance(canvas: CanvasOpenedData): IAgentHostCanvasInstance {
	const identity = unavailable(canvas);
	if (canvas.url) {
		try {
			const url = new URL(canvas.url);
			if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password) {
				return { ...identity, availability: 'ready', url: canvas.url };
			}
		} catch {
			// Invalid provider endpoints have no usable renderer.
		}
	}
	return identity;
}

function sameIdentity(a: CanvasRecordedData, b: CanvasRecordedData): boolean {
	return a.instanceId === b.instanceId && a.extensionId === b.extensionId && a.canvasId === b.canvasId;
}

/** Provider-shaped canvas state; durable records and live endpoints deliberately have separate authority. */
export class CopilotCanvases extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<IAgentHostCanvasState>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _sequencer = new Sequencer();
	private readonly _lifetime = this._register(new CancellationTokenSource());
	private readonly _instances = new Map<string, IAgentHostCanvasInstance>();
	private readonly _pendingInstanceOperations = new Map<string, { changed: boolean }>();
	private _catalog: readonly IAgentHostCanvasDefinition[] = [];
	private _state: IAgentHostCanvasState = { supported: true, catalog: [], instances: [] };
	private _initialization: Promise<void> | undefined;
	private _pendingEvents: CanvasEvent[] | undefined;

	constructor(private readonly _session: ICopilotSession) {
		super();
		this._register(toDisposable(_session.on(event => {
			if (!isCanvasEvent(event)) {
				return;
			}
			this._pendingEvents?.push(event);
			this._applyEvent(event);
			this._publish();
		})));
	}

	get state(): IAgentHostCanvasState {
		return this._state;
	}

	initialize(): Promise<void> {
		return this._initialization ??= this._refresh(true);
	}

	async getState(): Promise<IAgentHostCanvasState> {
		this._throwIfDisposed();
		await raceCancellationError(this.initialize(), this._lifetime.token);
		this._throwIfDisposed();
		return this.state;
	}

	async whenExtensionDeclared(extensionId: string): Promise<void> {
		const deadline = Date.now() + 30_000;
		while (!(await this.getState()).catalog.some(definition => definition.extensionId === extensionId)) {
			if (Date.now() >= deadline) {
				throw new Error('The approved canvas extension did not register a canvas.');
			}
			await timeout(50);
		}
	}

	open(params: IAgentHostCanvasOpenParams): Promise<IAgentHostCanvasInstance> {
		return this._queue(async () => {
			await this.getState();
			const definition = this._catalog.find(canvas => canvas.extensionId === params.extensionId && canvas.canvasId === params.canvasId);
			if (!definition || !params.instanceId) {
				throw new Error('Canvas is not in this chat\'s current catalog, or its instance ID is empty.');
			}
			const existing = this._instances.get(params.instanceId);
			if (existing && !sameIdentity(existing, params)) {
				throw new Error('Canvas instance ID is already owned by another canvas in this chat.');
			}
			await this._updateUnlessChanged(params.instanceId, async () => {
				const opened = await this._session.rpc.canvas.open(params);
				if (!sameIdentity(opened, params)) {
					throw new Error('The canvas provider returned a different instance identity.');
				}
				return opened;
			}, opened => this._instances.set(params.instanceId, fromLiveInstance(opened)));
			const current = this._instances.get(params.instanceId);
			if (!current) {
				throw new Error('The canvas closed while it was opening.');
			}
			return current;
		});
	}

	invokeAction(params: IAgentHostCanvasActionParams): Promise<AgentHostCanvasJson> {
		return this._queue(async () => {
			await this.getState();
			const instance = this._requireInstance(params.instanceId);
			if (instance.availability !== 'ready') {
				throw new Error('The canvas is unavailable; wait for its provider to reconnect.');
			}
			const definition = this._catalog.find(canvas => canvas.extensionId === instance.extensionId && canvas.canvasId === instance.canvasId);
			if (!definition?.actions.some(action => action.name === params.actionName)) {
				throw new Error('The action is not declared by this canvas.');
			}
			const result = await this._session.rpc.canvas.action.invoke(params);
			if (!isAgentHostCanvasJson(result)) {
				throw new Error('The canvas action returned a non-JSON result.');
			}
			return result;
		});
	}

	close(instanceId: string): Promise<void> {
		return this._queue(async () => {
			await this.getState();
			this._requireInstance(instanceId);
			await this._updateUnlessChanged(instanceId, () => this._session.rpc.canvas.close({ instanceId }), () => this._instances.delete(instanceId));
		});
	}

	reload(): Promise<void> {
		return this._queue(async () => {
			await this.getState();
			await this._session.rpc.extensions.reload();
			this._throwIfDisposed();
			await this._refresh(false);
		});
	}

	private _queue<T>(operation: () => Promise<T>): Promise<T> {
		return this._sequencer.queue(async () => {
			this._throwIfDisposed();
			const result = await raceCancellationError(operation(), this._lifetime.token);
			this._throwIfDisposed();
			return result;
		});
	}

	private async _updateUnlessChanged<T>(instanceId: string, operation: () => Promise<T>, update: (result: T) => void): Promise<void> {
		const pending = { changed: false };
		this._pendingInstanceOperations.set(instanceId, pending);
		try {
			const result = await operation();
			this._throwIfDisposed();
			if (!pending.changed) {
				update(result);
				this._publish();
			}
		} finally {
			this._pendingInstanceOperations.delete(instanceId);
		}
	}

	private async _refresh(history: boolean): Promise<void> {
		this._throwIfDisposed();
		const pending: CanvasEvent[] = [];
		this._pendingEvents = pending;
		try {
			const [events, catalog, live] = await raceCancellationError(Promise.all([
				history ? this._session.getEvents() : Promise.resolve([]),
				this._session.rpc.canvas.list(),
				this._session.rpc.canvas.listOpen(),
			]), this._lifetime.token);
			this._throwIfDisposed();
			if (history) {
				this._instances.clear();
				for (const event of events) {
					if (event.type === 'session.canvas.recorded' || event.type === 'session.canvas.removed') {
						this._applyEvent(event);
					}
				}
			}
			this._catalog = catalog.canvases.map(definitionFromSdk);
			for (const [id, instance] of this._instances) {
				this._instances.set(id, unavailable(instance));
			}
			// SDK openCanvases can retain retired URLs; only listOpen is a live snapshot.
			for (const instance of live.openCanvases) {
				this._instances.set(instance.instanceId, fromLiveInstance(instance));
			}
			for (const event of pending) {
				this._applyEvent(event);
			}
			this._publish();
		} finally {
			this._pendingEvents = undefined;
		}
	}

	private _applyEvent(event: CanvasEvent): void {
		switch (event.type) {
			case 'session.canvas.registry_changed':
				this._catalog = event.data.canvases.map(definitionFromSdk);
				for (const [id, instance] of this._instances) {
					if (!this._catalog.some(canvas => canvas.extensionId === instance.extensionId && canvas.canvasId === instance.canvasId)) {
						this._instances.set(id, unavailable(instance));
						const pending = this._pendingInstanceOperations.get(id);
						if (pending) {
							pending.changed = true;
						}
					}
				}
				return;
			case 'session.shutdown':
				this._retireEndpoints();
				return;
		}
		const data = event.data;
		const existing = this._instances.get(data.instanceId);
		const pending = this._pendingInstanceOperations.get(data.instanceId);
		if (pending && event.type !== 'session.canvas.recorded') {
			pending.changed = true;
		}
		switch (event.type) {
			case 'session.canvas.opened':
				this._instances.set(data.instanceId, fromLiveInstance(event.data));
				break;
			case 'session.canvas.recorded':
				if (!existing || !sameIdentity(existing, data)) {
					this._instances.set(data.instanceId, unavailable(event.data));
				}
				break;
			case 'session.canvas.unavailable':
				if (!existing || sameIdentity(existing, data)) {
					this._instances.set(data.instanceId, unavailable(existing ?? data));
				}
				break;
			case 'session.canvas.closed':
			case 'session.canvas.removed':
				if (existing && sameIdentity(existing, data)) {
					this._instances.delete(data.instanceId);
				}
				break;
		}
	}

	private _requireInstance(instanceId: string): IAgentHostCanvasInstance {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			throw new Error('There is no such open canvas in this chat.');
		}
		return instance;
	}

	private _retireEndpoints(): void {
		for (const [id, instance] of this._instances) {
			this._instances.set(id, unavailable(instance));
		}
		for (const pending of this._pendingInstanceOperations.values()) {
			pending.changed = true;
		}
	}

	private _publish(): void {
		const state: IAgentHostCanvasState = { supported: true, catalog: this._catalog, instances: [...this._instances.values()] };
		if (!equals(this._state, state)) {
			this._state = state;
			this._onDidChange.fire(state);
		}
	}

	private _throwIfDisposed(): void {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	override dispose(): void {
		this._lifetime.cancel();
		this._retireEndpoints();
		this._publish();
		super.dispose();
	}
}
