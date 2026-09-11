/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../base/common/equals.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, observableValue, observableValueOpts, transaction, type IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { isAgentHostCanvasJson, readAgentHostCanvasState, unsupportedAgentHostCanvasState, type AgentHostCanvasJson, type IAgentHostCanvasActionParams, type IAgentHostCanvasInstance, type IAgentHostCanvasOpenParams, type IAgentHostCanvasOperations, type IAgentHostCanvasState } from '../../../../../platform/agentHost/common/agentHostCanvases.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostCanvasScheme } from '../../../../../platform/agentHost/common/agentHostCanvasProtocol.js';
import type { ICanvasContextReference } from '../../../../../platform/agentHost/common/agentHostCanvasContext.js';
import { canvasPackageExtensionId } from '../../../../../platform/agentHost/common/agentHostCanvasPackages.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, type CanvasEntry, type CanvasState, type CanvasTypeDeclaration } from '../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { LOCAL_AGENT_HOST_AUTHORITY } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { parseRequiredSessionUriFromChatUri, type SessionMeta } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { isLoopbackCanvasUrl, unavailableSessionCanvasState, type ISessionCanvasPackage, type ISessionCanvases } from '../../../../services/sessions/common/sessionCanvases.js';

type CanvasConnection = IAgentHostCanvasOperations & Pick<IAgentConnection, 'canvasProtocol' | 'canvasPackages'>;

function hasCanvasOperations(connection: CanvasConnection | undefined): connection is Required<IAgentHostCanvasOperations> & CanvasConnection {
	return !!connection && typeof connection.getCanvases === 'function'
		&& typeof connection.openCanvas === 'function' && typeof connection.invokeCanvasAction === 'function'
		&& typeof connection.closeCanvas === 'function' && typeof connection.reloadCanvases === 'function';
}

export class AgentHostSessionCanvases extends Disposable implements ISessionCanvases {
	readonly hostId = LOCAL_AGENT_HOST_AUTHORITY;
	readonly connectionGeneration = observableValue(this, 0);
	readonly state = observableValueOpts<IAgentHostCanvasState>({ owner: this, equalsFn: structuralEquals }, unsupportedAgentHostCanvasState);
	readonly loading = observableValue(this, false);
	readonly error = observableValue<Error | undefined>(this, undefined);

	private generation = 0;
	private metadataRevision = 0;
	private pendingOperations = 0;
	private refreshRequest: Promise<IAgentHostCanvasState> | undefined;
	private refreshPending = false;
	private readonly canonicalStates = new Map<string, CanvasState>();
	private canonicalTypes: readonly CanvasTypeDeclaration[] = [];

	constructor(
		private readonly chat: URI,
		metadata: IObservable<SessionMeta | undefined>,
		private readonly getConnection: () => CanvasConnection | undefined,
		connectionVersion: IObservable<number>,
		private readonly hostSupported: IObservable<boolean>,
		private readonly canonicalEntries?: IObservable<readonly CanvasEntry[]>,
		private readonly prepareOpen?: () => Promise<IDisposable>,
	) {
		super();
		const metadataState = derivedOpts<IAgentHostCanvasState | undefined>({ owner: this, equalsFn: structuralEquals }, reader => readAgentHostCanvasState(metadata.read(reader), chat));
		let version = connectionVersion.get();
		let supported = hostSupported.get();
		this.connectionGeneration.set(version, undefined);
		let previousState: IAgentHostCanvasState | undefined;
		this._register(autorun(reader => {
			const nextSupported = hostSupported.read(reader);
			if (!nextSupported) {
				if (supported) {
					supported = false;
					previousState = undefined;
					this.retireEndpoint(unsupportedAgentHostCanvasState);
					this.connectionGeneration.set(this.connectionGeneration.read(undefined) + 1, undefined);
				}
				return;
			}
			const nextVersion = connectionVersion.read(reader);
			const nextState = this.getConnection()?.canvasProtocol ? undefined : metadataState.read(reader);
			if (version !== nextVersion || supported !== nextSupported) {
				version = nextVersion;
				supported = nextSupported;
				previousState = nextState;
				this.retireEndpoint();
				this.connectionGeneration.set(this.connectionGeneration.read(undefined) + 1, undefined);
			} else if (nextState !== previousState) {
				previousState = nextState;
				this.metadataRevision++;
				if (this.getConnection()) {
					this.state.set(nextState ?? unsupportedAgentHostCanvasState, undefined);
				}
			}
		}));
		if (canonicalEntries) {
			this._register(autorun(reader => {
				const supported = hostSupported.read(reader);
				connectionVersion.read(reader);
				const entries = canonicalEntries.read(reader).filter(entry => entry.identity.chat === chat.toString());
				if (!supported || !this.getConnection()?.canvasProtocol) {
					return;
				}
				this.metadataRevision++;
				const current = this.state.read(undefined);
				this.state.set({
					...current,
					supported: true,
					instances: entries.map(entry => {
						const known = this.canonicalStates.get(entry.identity.instanceId);
						const instance = current.instances.find(instance => instance.instanceId === entry.identity.instanceId);
						return known?.resource === entry.resource && known.identity.incarnation === entry.identity.incarnation && known.revision === entry.revision
							&& instance?.availability === 'ready' && entry.availability === CanvasAvailabilityStatus.Ready
							? instance : this.fromCanonicalEntry(entry);
					}),
				}, undefined);
				if (this.needsCanonicalRefresh()) {
					if (this.refreshRequest) {
						this.refreshPending = true;
					} else {
						this.refreshInBackground();
					}
				}
			}));
		}
	}

	async refresh(): Promise<IAgentHostCanvasState> {
		if (!this.hostSupported.get()) {
			return unsupportedAgentHostCanvasState;
		}
		if (this.refreshRequest) {
			return this.refreshRequest;
		}
		const generation = this.generation;
		const metadataRevision = this.metadataRevision;
		const request = this.perform(async connection => {
			const state = connection.canvasProtocol ? await this.refreshCanonical(connection) : await connection.getCanvases(this.chat);
			this.checkGeneration(generation);
			// A read begun before a live update must not retire the newer endpoint.
			if (connection.canvasProtocol || metadataRevision === this.metadataRevision) {
				this.state.set(state, undefined);
			}
			return this.state.get();
		}, true);
		this.refreshRequest = request;
		try {
			return await request;
		} finally {
			if (this.refreshRequest === request) {
				this.refreshRequest = undefined;
				const followUp = this.refreshPending;
				this.refreshPending = false;
				if (followUp && !this._store.isDisposed && generation === this.generation && this.needsCanonicalRefresh()) {
					this.refreshInBackground();
				}
			}
		}
	}

	private needsCanonicalRefresh(): boolean {
		return !!this.canonicalEntries?.get().some(entry => {
			const known = this.canonicalStates.get(entry.identity.instanceId);
			return entry.identity.chat === this.chat.toString() && entry.availability === CanvasAvailabilityStatus.Ready
				&& (known?.resource !== entry.resource || known.identity.incarnation !== entry.identity.incarnation || known.revision !== entry.revision);
		});
	}

	private refreshInBackground(): void {
		const generation = this.generation;
		const metadataRevision = this.metadataRevision;
		void this.refresh().catch(error => {
			if (!this._store.isDisposed && generation === this.generation && metadataRevision === this.metadataRevision) {
				this.error.set(error instanceof Error ? error : new Error(localize('canvas.operationFailed', "The canvas operation failed."), { cause: error }), undefined);
			}
		});
	}

	async open(params: IAgentHostCanvasOpenParams): Promise<IAgentHostCanvasInstance> {
		const preparation = await this.prepareOpen?.();
		try {
			return await this.openPrepared(params);
		} finally {
			preparation?.dispose();
		}
	}

	async getOpenPackages(workspace?: URI): Promise<readonly ISessionCanvasPackage[]> {
		return this.perform(async (connection, checkCurrent) => {
			const packages = await connection.canvasPackages?.list() ?? [];
			checkCurrent();
			return packages
				.filter(pkg => pkg.approval?.revision === pkg.revision
					&& (!pkg.approval.workspaces || !!workspace && pkg.approval.workspaces.some(value => isEqual(URI.parse(value), workspace))))
				.map(pkg => ({ extensionId: canvasPackageExtensionId(pkg.id), name: pkg.name, revision: pkg.revision }));
		});
	}

	private async openPrepared(params: IAgentHostCanvasOpenParams): Promise<IAgentHostCanvasInstance> {
		return this.perform(async (connection, checkCurrent) => {
			const state = await this.refresh();
			checkCurrent();
			this.requireSupported(state);
			const existing = state.instances.find(instance => instance.instanceId === params.instanceId);
			if (existing && (existing.extensionId !== params.extensionId || existing.canvasId !== params.canvasId)) {
				throw new Error(localize('canvas.identityConflict', "This canvas instance belongs to a different canvas."));
			}
			if (!connection.canvasProtocol && !state.catalog.some(canvas => canvas.extensionId === params.extensionId && canvas.canvasId === params.canvasId)) {
				throw new Error(localize('canvas.notDeclared', "This canvas is no longer in the catalog. Refresh the canvas list and try again."));
			}
			let instance: IAgentHostCanvasInstance;
			if (connection.canvasProtocol) {
				const definition = this.canonicalTypes.find(type => this.extensionId(type.source) === params.extensionId && type.canvasType === params.canvasId);
				const installed = definition ? undefined : (await connection.canvasPackages?.list())?.find(item => canvasPackageExtensionId(item.id) === params.extensionId && item.approval);
				checkCurrent();
				const source = definition?.source ?? (installed ? { kind: CanvasSourceKind.Package, sourceId: params.extensionId, packageName: installed.name, version: installed.approval?.revision } as const : undefined);
				if (!source) {
					throw new Error(localize('canvas.notDeclared', "This canvas is no longer in the catalog. Refresh the canvas list and try again."));
				}
				const opened = await connection.canvasProtocol.open({
					channel: parseRequiredSessionUriFromChatUri(this.chat.toString()),
					canvas: URI.from({ scheme: AgentHostCanvasScheme, path: `/${generateUuid()}` }).toString(),
					identity: { chat: this.chat.toString(), source, canvasType: params.canvasId, instanceId: params.instanceId },
					title: definition?.title ?? params.canvasId,
					requestId: generateUuid(),
					...(params.input === undefined ? {} : { input: params.input }),
				});
				instance = this.fromCanonicalEntry(opened.canvas);
			} else {
				instance = await connection.openCanvas(this.chat, params);
			}
			checkCurrent();
			await this.refresh();
			return this.state.get().instances.find(value => value.instanceId === instance.instanceId) ?? instance;
		});
	}

	async invokeAction(params: IAgentHostCanvasActionParams): Promise<AgentHostCanvasJson> {
		return this.perform(async (connection, checkCurrent) => {
			const state = await this.refresh();
			checkCurrent();
			this.requireSupported(state);
			const instance = state.instances.find(instance => instance.instanceId === params.instanceId);
			const definition = state.catalog.find(canvas => canvas.extensionId === instance?.extensionId && canvas.canvasId === instance.canvasId);
			if (!instance || instance.availability !== 'ready') {
				throw new Error(localize('canvas.actionUnavailable', "This canvas is unavailable. Refresh or restart its provider before running an action."));
			}
			if (!definition?.actions.some(action => action.name === params.actionName)) {
				throw new Error(localize('canvas.actionNotDeclared', "This action is not declared by the selected canvas."));
			}
			if (connection.canvasProtocol) {
				const canvas = this.requireCanonicalState(params.instanceId);
				const result = await connection.canvasProtocol.invokeAction({
					channel: canvas.resource, actionId: params.actionName, incarnation: canvas.identity.incarnation, requestId: generateUuid(),
					...(params.input === undefined ? {} : { input: params.input }),
				});
				if (!isAgentHostCanvasJson(result.result)) {
					throw new Error(localize('canvas.invalidResult', "The canvas returned an invalid or oversized action result."));
				}
				return result.result;
			}
			return connection.invokeCanvasAction(this.chat, params);
		});
	}

	async close(instanceId: string): Promise<void> {
		await this.perform(async (connection, checkCurrent) => {
			const state = await this.refresh();
			checkCurrent();
			this.requireSupported(state);
			if (!state.instances.some(instance => instance.instanceId === instanceId)) {
				throw new Error(localize('canvas.notFound', "This canvas instance no longer exists."));
			}
			if (connection.canvasProtocol) {
				const state = this.requireCanonicalState(instanceId);
				await connection.canvasProtocol.close({ channel: state.resource, revision: state.revision, requestId: generateUuid() });
			} else {
				await connection.closeCanvas(this.chat, instanceId);
			}
			checkCurrent();
			await this.refresh();
		});
	}

	async reload(): Promise<void> {
		this.checkGeneration(this.generation);
		this.requireSupported(this.state.get());
		this.retireEndpoint();
		await this.perform(async (connection, checkCurrent) => {
			if (connection.canvasProtocol) {
				const state = this.canonicalStates.values().next().value;
				if (!state) {
					throw new Error(localize('canvas.noProvider', "There is no admitted canvas provider to restart."));
				}
				await connection.canvasProtocol.restart({ channel: state.resource, incarnation: state.identity.incarnation, requestId: generateUuid() });
			} else {
				await connection.reloadCanvases(this.chat);
			}
			checkCurrent();
			await this.refresh();
		}, true);
	}

	getContextReference(instanceId: string): ICanvasContextReference | undefined {
		if (!this.hostSupported.get() || !this.getConnection()?.canvasProtocol) {
			return undefined;
		}
		const entry = this.canonicalEntries?.get().find(entry => entry.identity.chat === this.chat.toString() && entry.identity.instanceId === instanceId);
		return entry ? { resource: entry.resource, incarnation: entry.identity.incarnation } : undefined;
	}

	private requireSupported(state: IAgentHostCanvasState): void {
		if (!state.supported) {
			throw new Error(localize('canvas.unsupported', "Canvases are available only in an opted-in local canvas session."));
		}
	}

	private async refreshCanonical(connection: CanvasConnection): Promise<IAgentHostCanvasState> {
		const protocol = connection.canvasProtocol;
		if (!protocol) {
			return unsupportedAgentHostCanvasState;
		}
		const generation = this.generation;
		const types: CanvasTypeDeclaration[] = [];
		const cursors = new Set<string>();
		let cursor: string | undefined;
		do {
			const page = await protocol.listTypes({ channel: this.chat.toString(), limit: 64, ...(cursor === undefined ? {} : { cursor }) });
			this.checkGeneration(generation);
			if (page.types.length > 64 || types.length + page.types.length > 4096) {
				throw new Error(localize('canvas.catalogueLimit', "The canvas catalogue exceeds the supported discovery limit."));
			}
			types.push(...page.types);
			cursor = page.nextCursor;
			if (cursor !== undefined) {
				if (cursors.has(cursor) || cursors.size >= 63) {
					throw new Error(localize('canvas.cataloguePagination', "The canvas catalogue did not finish within the supported pagination limit."));
				}
				cursors.add(cursor);
			}
		} while (cursor !== undefined);
		const entries = (this.canonicalEntries?.get() ?? []).filter(entry => entry.identity.chat === this.chat.toString());
		if (entries.length > 64) {
			throw new Error(localize('canvas.membershipLimit', "The chat exceeds the supported canvas membership limit."));
		}
		const states = await Promise.all(entries.map(async entry => {
			const state = await protocol.getState(entry.resource);
			this.checkGeneration(generation);
			const source = await protocol.resolveSource({ channel: entry.resource });
			this.checkGeneration(generation);
			return { entry, state, source };
		}));
		this.checkGeneration(generation);
		const currentEntries = this.canonicalEntries?.get() ?? [];
		const currentStates = states.filter(({ entry, state }) => currentEntries.some(current =>
			current.resource === entry.resource && state.resource === current.resource
			&& current.identity.incarnation === state.identity.incarnation
			&& current.revision === state.revision
			&& current.availability === state.availability.status));
		this.canonicalTypes = types;
		this.canonicalStates.clear();
		for (const { state } of currentStates) {
			this.canonicalStates.set(state.identity.instanceId, state);
		}
		return {
			supported: true,
			catalog: types.map(type => {
				const current = currentStates.find(value => value.state.identity.canvasType === type.canvasType && this.extensionId(value.state.identity.source) === this.extensionId(type.source))?.state;
				const actions = current?.availability.status === CanvasAvailabilityStatus.Ready ? current.availability.actions : type.declaredActions ?? [];
				return {
					extensionId: this.extensionId(type.source), canvasId: type.canvasType, displayName: type.title, description: type.description ?? '',
					...(type.openInputSchema && isAgentHostCanvasJson(type.openInputSchema) ? { inputSchema: type.openInputSchema } : {}),
					actions: actions.map(action => ({ name: action.id, ...(action.description === undefined ? {} : { description: action.description }), ...(action.inputSchema && isAgentHostCanvasJson(action.inputSchema) ? { inputSchema: action.inputSchema } : {}) })),
				};
			}),
			instances: currentEntries.filter(entry => entry.identity.chat === this.chat.toString()).map(entry => {
				const identity = this.fromCanonicalEntry(entry);
				const resolved = currentStates.find(value => value.entry.resource === entry.resource);
				const source = resolved?.source;
				return entry.availability === CanvasAvailabilityStatus.Ready && source?.source
					&& source.incarnation === entry.identity.incarnation && source.revision === entry.revision
					&& source.availability === CanvasAvailabilityStatus.Ready && isLoopbackCanvasUrl(source.source.url)
					? { ...identity, availability: 'ready', url: source.source.url } : identity;
			}),
		};
	}

	private extensionId(source: CanvasEntry['identity']['source']): string {
		return source.kind === CanvasSourceKind.Extension ? source.extensionId : source.sourceId;
	}

	private fromCanonicalEntry(entry: CanvasEntry): IAgentHostCanvasInstance {
		return { extensionId: this.extensionId(entry.identity.source), canvasId: entry.identity.canvasType, instanceId: entry.identity.instanceId, title: entry.title, availability: 'unavailable' };
	}

	private requireCanonicalState(instanceId: string): CanvasState {
		const state = this.canonicalStates.get(instanceId);
		if (!state) {
			throw new Error(localize('canvas.notFound', "This canvas instance no longer exists."));
		}
		return state;
	}

	private checkGeneration(generation: number): void {
		if (this._store.isDisposed || generation !== this.generation) {
			throw new CancellationError();
		}
	}

	private retireEndpoint(state: IAgentHostCanvasState = this.state.read(undefined)): void {
		this.generation++;
		this.refreshRequest = undefined;
		this.refreshPending = false;
		this.pendingOperations = 0;
		transaction(tx => {
			this.state.set(state.supported ? unavailableSessionCanvasState(state) : state, tx);
			this.loading.set(false, tx);
			this.error.set(undefined, tx);
		});
	}

	private async perform<T>(operation: (connection: Required<IAgentHostCanvasOperations> & CanvasConnection, checkCurrent: () => void) => Promise<T>, invalidateOnError = false): Promise<T> {
		const generation = this.generation;
		const metadataRevision = this.metadataRevision;
		this.pendingOperations++;
		transaction(tx => {
			this.loading.set(true, tx);
			this.error.set(undefined, tx);
		});
		try {
			this.checkGeneration(generation);
			if (!this.hostSupported.get()) {
				throw new Error(localize('canvas.hostUnsupported', "This connection has not enabled local canvases."));
			}
			const connection = this.getConnection();
			if (!hasCanvasOperations(connection)) {
				throw new Error(localize('canvas.hostUnavailable', "The local canvas provider is unavailable. Retry after the Agent Host reconnects."));
			}
			const result = await operation(connection, () => this.checkGeneration(generation));
			this.checkGeneration(generation);
			return result;
		} catch (error) {
			if (generation === this.generation && !this._store.isDisposed) {
				transaction(tx => {
					this.error.set(error instanceof Error ? error : new Error(localize('canvas.operationFailed', "The canvas operation failed."), { cause: error }), tx);
					if (invalidateOnError && metadataRevision === this.metadataRevision) {
						this.state.set(unavailableSessionCanvasState(this.state.get()), tx);
					}
				});
			}
			throw error;
		} finally {
			if (generation === this.generation && !this._store.isDisposed) {
				this.pendingOperations--;
				this.loading.set(this.pendingOperations > 0, undefined);
			}
		}
	}
}
