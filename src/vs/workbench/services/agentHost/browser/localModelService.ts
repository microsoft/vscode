/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Event, Relay } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable, ISettableObservable, observableFromEventOpts, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IAgentConnection, IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { LOCAL_MODEL_REQUEST_KEY, LocalModelUseInAutoSettingId, type ILocalModelConsent, type ILocalModelFamilyV1, type ILocalModelRequest, type ILocalModelStatusV1 } from '../../../../platform/agentHost/common/localModel.js';
import { readLocalModelStatusFromRootState } from '../../../../platform/agentHost/common/meta/localModelStatus.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, type RootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getLocalModelServerStopId, getLocalModelStopNowId, ILocalModelInteractionHandler, ILocalModelService, LocalModelSendCheck } from '../common/localModelService.js';

/** A pending stop is dropped after this long without a change, e.g. when the host couldn't stop the operation. */
const PENDING_STOP_TIMEOUT_MS = 10_000;

/** A stop sent for an operation or the active model's server, and the state and phase it should change. */
interface IPendingStop {
	readonly operationId: string;
	readonly signature: string;
}

/** The state and phase of operation `operationId` (or of the operation or server a stop id names); `undefined` when it is gone. */
function getOperationSignature(status: ILocalModelStatusV1 | undefined, operationId: string): string | undefined {
	const active = status?.active;
	if (active && operationId === getLocalModelServerStopId(active.familyId)) {
		return active.server;
	}
	const operation = status?.families.find(family => family.operation && (family.operation.id === operationId || getLocalModelStopNowId(family.operation.id) === operationId))?.operation;
	return operation && `${operation.state}:${operation.phase ?? ''}`;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	return a.size === b.size && [...a].every(value => b.has(value));
}

/** Basic {@link ILocalModelService}: reads status per connection and writes requests with a fresh nonce; confirmations come from the registered handler. */
export class LocalModelService extends Disposable implements ILocalModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _statusByConnection = new WeakMap<IAgentConnection, IObservable<ILocalModelStatusV1 | undefined>>();
	private readonly _pendingStops = new WeakMap<IAgentConnection, ISettableObservable<readonly IPendingStop[]>>();
	private readonly _pendingStopIds = new WeakMap<IAgentConnection, IObservable<ReadonlySet<string>>>();
	/** Drops each pending stop that never took effect. */
	private readonly _pendingStopTimeouts = this._register(new DisposableMap<string>());
	/** Root state changes of the ambient host, which swaps its protocol client on every restart. */
	private readonly _ambientRootStateChanges: Event<unknown>;
	private _interactionHandler: ILocalModelInteractionHandler | undefined;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const relay = this._register(new Relay<RootState>());
		const bind = () => { relay.input = this._agentHostService.rootState.onDidChange; };
		bind();
		this._register(this._agentHostService.onAgentHostStart(bind));
		this._ambientRootStateChanges = Event.any<unknown>(relay.event, this._agentHostService.onAgentHostStart);
	}

	getStatus(connection: IAgentConnection): IObservable<ILocalModelStatusV1 | undefined> {
		let status = this._statusByConnection.get(connection);
		if (!status) {
			const onDidChange = connection === this._agentHostService ? this._ambientRootStateChanges : connection.rootState.onDidChange;
			status = observableFromEventOpts<ILocalModelStatusV1 | undefined, unknown>(
				{ owner: this, debugName: 'localModelStatus', equalsFn: structuralEquals },
				onDidChange,
				() => readLocalModelStatusFromRootState(connection.rootState.value),
			);
			this._statusByConnection.set(connection, status);
		}
		return status;
	}

	registerInteractionHandler(handler: ILocalModelInteractionHandler): IDisposable {
		this._interactionHandler = handler;
		return toDisposable(() => {
			if (this._interactionHandler === handler) {
				this._interactionHandler = undefined;
			}
		});
	}

	setUp(connection: IAgentConnection, familyId: string, consent: ILocalModelConsent): boolean {
		return !!this._findFamily(connection, familyId) && this._send(connection, { action: 'setUp', familyId, consent });
	}

	makeActive(connection: IAgentConnection, familyId: string): boolean {
		return !!this._findFamily(connection, familyId) && this._send(connection, { action: 'makeActive', familyId });
	}

	cancel(connection: IAgentConnection, operationId: string): boolean {
		return this._stop(connection, [operationId], { action: 'cancel', operationId });
	}

	pause(connection: IAgentConnection, operationId: string): boolean {
		return this._stop(connection, [operationId], { action: 'pause', operationId });
	}

	resume(connection: IAgentConnection, operationId: string): boolean {
		return this._send(connection, { action: 'resume', operationId });
	}

	retry(connection: IAgentConnection, operationId: string): boolean {
		return this._send(connection, { action: 'retry', operationId });
	}

	start(connection: IAgentConnection): boolean {
		return this._send(connection, { action: 'start' });
	}

	stop(connection: IAgentConnection): boolean {
		const familyId = this.getStatus(connection).get()?.active?.familyId;
		return this._stop(connection, familyId ? [getLocalModelServerStopId(familyId)] : [], { action: 'stop' });
	}

	async stopNow(connection: IAgentConnection): Promise<boolean> {
		const status = this.getStatus(connection).get();
		const confirmed = status && await this._handler('stopNow')?.confirmStopNow(connection, status);
		// The drain is a phase of the operation that waits for it.
		const draining = this.getStatus(connection).get()?.families.flatMap(family => family.operation?.state === 'running' && family.operation.phase === 'draining' ? [getLocalModelStopNowId(family.operation.id)] : []) ?? [];
		return !!confirmed && this._stop(connection, draining, { action: 'stopNow' });
	}

	getPendingStops(connection: IAgentConnection): IObservable<ReadonlySet<string>> {
		let pendingIds = this._pendingStopIds.get(connection);
		if (!pendingIds) {
			const status = this.getStatus(connection);
			const pending = this._getPendingStopList(connection);
			pendingIds = derivedOpts<ReadonlySet<string>>({ owner: this, debugName: 'localModelPendingStops', equalsFn: setsEqual }, reader => {
				const current = status.read(reader);
				return new Set(pending.read(reader).filter(stop => getOperationSignature(current, stop.operationId) === stop.signature).map(stop => stop.operationId));
			});
			this._pendingStopIds.set(connection, pendingIds);
		}
		return pendingIds;
	}

	update(connection: IAgentConnection, familyId: string): boolean {
		return this._send(connection, { action: 'update', familyId });
	}

	async remove(connection: IAgentConnection, familyId: string): Promise<boolean> {
		const target = this._findFamily(connection, familyId);
		const confirmed = target && await this._handler('remove')?.confirmRemove(connection, target.status, target.family);
		return !!confirmed && this._send(connection, { action: 'remove', familyId });
	}

	stopPrevious(connection: IAgentConnection): boolean {
		return this._send(connection, { action: 'stopPrevious' });
	}

	refreshCatalog(connection: IAgentConnection): boolean {
		return this._send(connection, { action: 'refreshCatalog' });
	}

	setContextSize(connection: IAgentConnection, familyId: string, tokens: number): boolean {
		const target = this._findFamily(connection, familyId);
		return !!target?.family.context?.options.some(option => option.tokens === tokens) && this._send(connection, { action: 'setContextSize', familyId, contextTokens: tokens });
	}

	async setUseInAuto(value: boolean): Promise<void> {
		await this._configurationService.updateValue(LocalModelUseInAutoSettingId, value);
	}

	async checkBeforeSend(connection: IAgentConnection, _sessionResource: URI, selectedModelId: string | undefined): Promise<LocalModelSendCheck> {
		const status = this.getStatus(connection).get();
		const family = selectedModelId ? status?.families.find(candidate => candidate.install?.modelId === selectedModelId) : undefined;
		if (!status || !family || status.active?.familyId === family.familyId) {
			return { kind: 'allow' };
		}
		return { kind: 'block', reason: 'modelNotActive', familyId: family.familyId, activeFamilyId: status.active?.familyId };
	}

	private _findFamily(connection: IAgentConnection, familyId: string): { readonly status: ILocalModelStatusV1; readonly family: ILocalModelFamilyV1 } | undefined {
		const status = this.getStatus(connection).get();
		const family = status?.families.find(candidate => candidate.familyId === familyId);
		return status && family ? { status, family } : undefined;
	}

	private _handler(action: ILocalModelRequest['action']): ILocalModelInteractionHandler | undefined {
		if (!this._interactionHandler) {
			this._logService.warn(`[LocalModel] '${action}' needs a confirmation, but no confirmation UI is registered`);
		}
		return this._interactionHandler;
	}

	private _getPendingStopList(connection: IAgentConnection): ISettableObservable<readonly IPendingStop[]> {
		let pending = this._pendingStops.get(connection);
		if (!pending) {
			const created = pending = observableValue<readonly IPendingStop[]>(this, []);
			this._pendingStops.set(connection, created);
			// A stop that took effect is forgotten, so the same operation running again doesn't show it again.
			const status = this.getStatus(connection);
			this._register(autorun(reader => {
				const current = status.read(reader);
				// Untracked: only a status change can make a stop stale; new stops are live when added.
				const stops = created.read(undefined);
				const live = stops.filter(stop => getOperationSignature(current, stop.operationId) === stop.signature);
				if (live.length !== stops.length) {
					created.set(live, undefined);
				}
			}));
		}
		return pending;
	}

	/** Sends a stop of `operationIds` and marks them pending until the status shows their state or phase change. */
	private _stop(connection: IAgentConnection, operationIds: readonly string[], request: Omit<ILocalModelRequest, 'nonce'>): boolean {
		const status = this.getStatus(connection).get();
		if (!this._send(connection, request)) {
			return false;
		}
		const pending = this._getPendingStopList(connection);
		const stops = operationIds.flatMap(operationId => {
			const signature = getOperationSignature(status, operationId);
			return signature === undefined ? [] : [{ operationId, signature }];
		});
		if (!stops.length) {
			return true;
		}
		const ids = new Set(stops.map(stop => stop.operationId));
		// Stops that took effect, or are being replaced, are dropped as new ones come in.
		pending.set([...pending.get().filter(stop => !ids.has(stop.operationId) && getOperationSignature(status, stop.operationId) === stop.signature), ...stops], undefined);
		for (const { operationId } of stops) {
			const key = generateUuid();
			this._pendingStopTimeouts.set(key, disposableTimeout(() => {
				this._pendingStopTimeouts.deleteAndDispose(key);
				pending.set(pending.get().filter(stop => stop.operationId !== operationId || !stops.includes(stop)), undefined);
			}, PENDING_STOP_TIMEOUT_MS));
		}
		return true;
	}

	/** Sends a request to `connection`, only while it publishes local-model status. */
	private _send(connection: IAgentConnection, request: Omit<ILocalModelRequest, 'nonce'>): boolean {
		if (!this.getStatus(connection).get()) {
			this._logService.trace(`[LocalModel] Not sending '${request.action}': the Agent Host does not publish on-device model status`);
			return false;
		}
		// A fresh nonce every time, so a repeated gesture is a new request; the host clears the key as it claims it.
		const value: ILocalModelRequest = { ...request, nonce: generateUuid() };
		connection.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [LOCAL_MODEL_REQUEST_KEY]: value },
		});
		return true;
	}
}

registerSingleton(ILocalModelService, LocalModelService, InstantiationType.Delayed);
