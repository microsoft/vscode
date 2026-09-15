/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { Disposable, DisposableStore, MutableDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue, observableValueOpts, transaction, type IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostCanvasChatInitialization } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { CanvasTrustStatus, type CanvasEntry, type CanvasState, type CanvasTypeDeclaration } from '../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import type { OpenCanvasParams } from '../../../../../platform/agentHost/common/state/protocol/channels-canvas/commands.js';
import { canvasIdentityEquals, type ISessionCanvases, type ISessionCanvasState, type SessionCanvasOpenOptions } from '../../../../services/sessions/common/sessionCanvases.js';

/** One authenticated connection incarnation, including local-host replacements that reuse the service object. */
export interface IAgentHostCanvasBinding {
	readonly connection: Pick<IAgentConnection, 'initializeResult' | 'initializeCanvasChat' | 'listCanvasTypes' | 'openCanvas' | 'resolveCanvasSource' | 'invokeCanvasAction' | 'closeCanvas' | 'restartCanvasProvider'> & {
		getSubscription(kind: StateComponents.Canvas, resource: URI, owner: string): IReference<IAgentSubscription<CanvasState>>;
	};
}

export class AgentHostSessionCanvases extends Disposable implements ISessionCanvases {
	readonly generation = observableValue(this, 0);
	readonly catalog = observableValueOpts<readonly CanvasTypeDeclaration[]>({ owner: this, equalsFn: structuralEquals }, []);
	readonly entries: IObservable<readonly CanvasEntry[]>;
	readonly initialized: IObservable<boolean>;
	readonly supportsInitialization: IObservable<boolean>;
	readonly initializing = observableValue(this, false);
	readonly loading = observableValue(this, false);
	readonly error = observableValue<Error | undefined>(this, undefined);
	readonly availability: IObservable<'available' | 'unsupported' | 'disconnected'>;
	private readonly disposed = observableValue(this, false);
	private readonly initialization = this._register(new MutableDisposable<CancellationTokenSource>());
	private refreshSequence = 0;

	constructor(
		private readonly session: URI,
		private readonly chat: URI,
		private readonly binding: IObservable<IAgentHostCanvasBinding | undefined>,
		enabled: IObservable<boolean>,
		entries: IObservable<readonly CanvasEntry[] | undefined>,
		private readonly keepAlive: () => void,
		private readonly waitForSession?: () => Promise<void>,
	) {
		super();
		this.entries = derived(this, reader => entries.read(reader)?.filter(entry => entry.identity.chat === chat.toString()) ?? []);
		this.initialized = derived(this, reader => entries.read(reader) !== undefined);
		this.availability = derived(this, reader => {
			if (this.disposed.read(reader) || !enabled.read(reader)) {
				return 'unsupported';
			}
			const connection = binding.read(reader)?.connection;
			if (!connection) {
				return 'disconnected';
			}
			return connection.initializeResult.read(reader)?.canvases ? 'available' : 'unsupported';
		});
		this.supportsInitialization = derived(this, reader => this.availability.read(reader) === 'available'
			&& supportsAgentHostCanvasChatInitialization(binding.read(reader)?.connection.initializeResult.read(reader)));
		this._register(autorun(reader => {
			binding.read(reader);
			this.availability.read(reader);
			this.supportsInitialization.read(reader);
			this.initialization.value?.cancel();
			this.refreshSequence++;
			transaction(tx => {
				this.generation.set(this.generation.read(undefined) + 1, tx);
				this.catalog.set([], tx);
				this.loading.set(false, tx);
				this.error.set(undefined, tx);
			});
		}));
	}

	async initialize(token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const connection = this.currentConnection();
		if (!this.supportsInitialization.get()) {
			throw new Error(localize('canvas.initializationUnsupported', "The connected host does not support explicit canvas provider initialization."));
		}
		if (this.initializing.get()) {
			throw new Error(localize('canvas.initializationInProgress', "Canvas providers are already being initialized for this conversation."));
		}
		const generation = this.generation.get();
		const operation = new CancellationTokenSource(token);
		this.initialization.value = operation;
		this.initializing.set(true, undefined);
		let dispatched = false;
		try {
			if (this.waitForSession) {
				await raceCancellationError(this.waitForSession(), operation.token);
			}
			if (operation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.keepAlive();
			dispatched = true;
			await raceCancellationError(connection.initializeCanvasChat({
				channel: this.chat.toString(), requestId: generateUuid(),
			}, operation.token), operation.token);
			if (operation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			await raceCancellationError(this.refresh(), operation.token);
		} catch (error) {
			if (generation !== this.generation.get()) {
				throw new Error(dispatched
					? localize('canvas.initializationUncertain', "The canvas connection changed during initialization. Its outcome may be uncertain. Refresh the live catalog before retrying; no initialization was repeated.")
					: localize('canvas.initializationOwnerChanged', "The canvas owner or connection changed before provider initialization."), { cause: error });
			}
			throw error;
		} finally {
			this.initialization.clear();
			this.initializing.set(false, undefined);
		}
	}

	private currentConnection(): IAgentHostCanvasBinding['connection'] {
		const connection = this.binding.get()?.connection;
		if (this.availability.get() !== 'available' || !connection) {
			throw new Error(localize('canvas.connectionUnavailable', "Canvases are unavailable for this chat. Check the local runtime and canvas preview availability."));
		}
		return connection;
	}

	private assertMember(canvas: CanvasEntry | CanvasState): void {
		if (canvas.identity.chat !== this.chat.toString() || !this.entries.get().some(entry => entry.resource === canvas.resource)) {
			throw new Error(localize('canvas.ownerMismatch', "This canvas does not belong to the selected chat."));
		}
	}

	async refresh(): Promise<void> {
		const connection = this.currentConnection();
		const generation = this.generation.get();
		const sequence = ++this.refreshSequence;
		transaction(tx => {
			this.loading.set(true, tx);
			this.error.set(undefined, tx);
		});
		try {
			const types: CanvasTypeDeclaration[] = [];
			const cursors = new Set<string>();
			let cursor: string | undefined;
			do {
				const result = await connection.listCanvasTypes({ channel: this.chat.toString(), cursor });
				if (generation !== this.generation.get() || sequence !== this.refreshSequence) {
					throw new CancellationError();
				}
				types.push(...result.types);
				cursor = result.nextCursor;
				if (cursor && (cursors.has(cursor) || cursors.size >= 100 || types.length > 10_000)) {
					throw new Error(localize('canvas.catalogPagination', "The canvas catalog returned an invalid continuation."));
				}
				if (cursor) {
					cursors.add(cursor);
				}
			} while (cursor);
			this.catalog.set(types, undefined);
		} catch (error) {
			if (generation === this.generation.get() && sequence === this.refreshSequence) {
				this.error.set(error instanceof Error ? error : new Error(localize('canvas.catalogFailed', "The live canvas catalog could not be read."), { cause: error }), undefined);
			}
			throw error;
		} finally {
			if (sequence === this.refreshSequence) {
				this.loading.set(false, undefined);
			}
		}
	}

	observeCanvas(resource: string): IReference<ISessionCanvasState> {
		const store = new DisposableStore();
		const state = observableValue<CanvasState | undefined>(store, undefined);
		const error = observableValue<Error | undefined>(store, undefined);
		store.add(autorun(reader => {
			this.generation.read(reader);
			const connection = this.binding.read(reader)?.connection;
			state.set(undefined, undefined);
			error.set(undefined, undefined);
			if (this.availability.read(reader) !== 'available' || !connection) {
				return;
			}
			let reference: IReference<IAgentSubscription<CanvasState>>;
			try {
				reference = reader.store.add(connection.getSubscription(StateComponents.Canvas, URI.parse(resource), 'AgentHostSessionCanvases'));
			} catch (cause) {
				error.set(new Error(localize('canvas.stateUnavailable', "The canvas state subscription could not be established."), { cause }), undefined);
				return;
			}
			const accept = (value: CanvasState | Error | undefined) => {
				if (value instanceof Error) {
					transaction(tx => { state.set(undefined, tx); error.set(value, tx); });
				} else if (value?.resource === resource && value.identity.chat === this.chat.toString()) {
					transaction(tx => { state.set(value, tx); error.set(undefined, tx); });
				} else {
					transaction(tx => {
						state.set(undefined, tx);
						error.set(value ? new Error(localize('canvas.stateOwnerMismatch', "Canvas state does not match the requested owner.")) : undefined, tx);
					});
				}
			};
			reader.store.add(reference.object.onDidChange(accept));
			if (reference.object.onDidError) {
				reader.store.add(reference.object.onDidError(accept));
			}
			accept(reference.object.value);
		}));
		return { object: { state, error }, dispose: () => store.dispose() };
	}

	async open(options: SessionCanvasOpenOptions): Promise<CanvasEntry> {
		const connection = this.currentConnection();
		const generation = this.generation.get();
		if (this.waitForSession) {
			await this.waitForSession();
		}
		if (generation !== this.generation.get()) {
			throw new Error(localize('canvas.openOwnerChanged', "The canvas owner or connection changed before opening the canvas."));
		}
		this.keepAlive();
		const params: OpenCanvasParams = {
			channel: this.session.toString(),
			canvas: `ahp-canvas:/${generateUuid()}`,
			identity: { chat: this.chat.toString(), source: options.source, canvasType: options.canvasType, instanceId: options.instanceId },
			title: options.title, icon: options.icon, input: options.input,
			requestId: generateUuid(),
		};
		const result = await connection.openCanvas(params);
		if (generation !== this.generation.get()) {
			throw new Error(localize('canvas.openUncertain', "The connection changed while opening the canvas. Its outcome is uncertain. Refresh the catalog; do not automatically repeat the open."));
		}
		if (!canvasIdentityEquals(result.canvas.identity, params.identity) || URI.parse(result.canvas.resource).scheme !== 'ahp-canvas') {
			throw new Error(localize('canvas.openOwnerMismatch', "The canvas response did not match the owning chat."));
		}
		return result.canvas;
	}

	resolveSource(canvas: CanvasEntry) {
		this.assertMember(canvas);
		return this.currentConnection().resolveCanvasSource({ channel: canvas.resource });
	}

	invokeAction(canvas: CanvasState, actionId: string, input?: unknown) {
		this.assertMember(canvas);
		if (canvas.trust.status !== CanvasTrustStatus.Trusted) {
			throw new Error(localize('canvas.actionUntrusted', "The canvas provider has not been approved to execute actions."));
		}
		const connection = this.currentConnection();
		this.keepAlive();
		return connection.invokeCanvasAction({
			channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: generateUuid(), actionId, input,
		});
	}

	close(canvas: CanvasEntry): Promise<void> {
		this.assertMember(canvas);
		const connection = this.currentConnection();
		return connection.closeCanvas({ channel: canvas.resource, revision: canvas.revision, requestId: generateUuid() });
	}

	restart(canvas: CanvasEntry): Promise<void> {
		this.assertMember(canvas);
		const connection = this.currentConnection();
		this.keepAlive();
		return connection.restartCanvasProvider({ channel: canvas.resource, incarnation: canvas.identity.incarnation, requestId: generateUuid() });
	}

	override dispose(): void {
		this.initialization.value?.cancel();
		this.disposed.set(true, undefined);
		super.dispose();
	}
}
