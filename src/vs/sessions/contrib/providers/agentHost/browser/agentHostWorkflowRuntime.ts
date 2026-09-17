/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostWorkflowsEnabledConfigKey } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import type { IAgentHostWorkflowStartContext } from '../../../../../platform/agentHost/common/agentHostWorkflow.js';
import { IAgentWorkflowRunChange, supportsAgentHostWorkflows } from '../../../../../platform/agentHost/common/meta/agentWorkflowMeta.js';
import { buildChatUri, DEFAULT_CHAT_ID, parseChatUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkflowRuntime, WorkflowControl, WorkflowEvidence, WorkflowRun, WorkflowStartOptions } from '../../../../../platform/workflow/common/workflow.js';
import { AgentHostRootConfigForwarder } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostRootConfigForwarder.js';
import { IWorkflowSourceEnablementService } from '../../../../../workbench/contrib/workflows/common/workflowSources.js';

interface WorkflowWatch {
	readonly session: URI;
	count: number;
	refreshing: boolean;
	dirty: boolean;
	latest?: { readonly runId: string; readonly revision: number };
}

export interface IAgentHostWorkflowRuntimeOptions {
	readonly enabled: IObservable<boolean>;
	toBackendSession(resource: URI): URI;
	toClientSession(resource: URI): URI;
	onProgress(change: IAgentWorkflowRunChange): void;
}

/** Full run records are observed only while a workflow view holds a watch. */
export class AgentHostWorkflowRuntime extends Disposable implements IWorkflowRuntime {
	private readonly binding = this._register(new MutableDisposable<DisposableStore>());
	private readonly changed = this._register(new Emitter<WorkflowRun>());
	readonly onDidChangeRun = this.changed.event;
	private readonly watches = new ResourceMap<WorkflowWatch>();
	private connection: IAgentConnection | undefined;
	private rootConfigForwarder: AgentHostRootConfigForwarder | undefined;
	private generation = 0;
	private readonly sourceReconciliation = new Sequencer();
	private publishedSources: ReadonlyMap<string, boolean> | undefined;
	private sourceRevision = 0;

	constructor(
		private readonly options: IAgentHostWorkflowRuntimeOptions,
		@ILogService private readonly logService: ILogService,
		@IWorkflowSourceEnablementService private readonly sourceEnablementService: IWorkflowSourceEnablementService,
	) {
		super();
		this._register(toDisposable(() => {
			this.generation++;
			this.connection = undefined;
			this.rootConfigForwarder = undefined;
			this.watches.clear();
			this.publishedSources = undefined;
		}));
	}

	bind(connection: IAgentConnection): IDisposable {
		this.binding.clear();
		const generation = ++this.generation;
		this.connection = connection;
		this.publishedSources = undefined;
		const store = new DisposableStore();
		this.binding.value = store;
		const forwarder = store.add(new AgentHostRootConfigForwarder([{
			key: AgentHostWorkflowsEnabledConfigKey,
			computeValue: async () => {
				if (!supportsAgentHostWorkflows(connection.initializeResult.get())) {
					return undefined;
				}
				if (this.options.enabled.get()) {
					try {
						await this.reconcileSources(connection, generation);
					} catch (error) {
						if (generation === this.generation) {
							this.logService.error('[Workflow] Could not publish source enablement; disabling workflow execution.', error);
						}
						return false;
					}
				}
				return this.options.enabled.get();
			},
			registerTriggers: (store, push) => {
				store.add(Event.fromObservableLight(this.options.enabled)(push));
				store.add(this.sourceEnablementService.onDidChange(() => {
					this.sourceRevision++;
					push();
				}));
			},
		}], connection, Event.fromObservableLight(connection.initializeResult)));
		this.rootConfigForwarder = forwarder;
		if (connection.onDidChangeWorkflowRun) {
			store.add(connection.onDidChangeWorkflowRun(change => {
				this.options.onProgress(change);
				const watch = this.watches.get(URI.parse(change.session));
				if (watch) {
					watch.latest = change.progress ? { runId: change.progress.runId, revision: change.progress.revision } : undefined;
					this.refresh(watch);
				}
			}));
		}
		store.add(autorun(reader => {
			if (supportsAgentHostWorkflows(connection.initializeResult.read(reader))) {
				forwarder.start();
				for (const watch of this.watches.values()) {
					this.refresh(watch);
				}
			} else {
				forwarder.stop();
				this.publishedSources = undefined;
			}
		}));
		return toDisposable(() => {
			if (this.generation === generation) {
				this.generation++;
				this.connection = undefined;
				this.rootConfigForwarder = undefined;
				this.binding.clear();
			}
		});
	}

	watchSession(session: string): IDisposable {
		const backend = this.options.toBackendSession(URI.parse(session).with({ fragment: '' }));
		let watch = this.watches.get(backend);
		if (watch) {
			watch.count++;
		} else {
			watch = { session: backend, count: 1, refreshing: false, dirty: false };
			this.watches.set(backend, watch);
			this.refresh(watch);
		}
		const ownedWatch = watch;
		return toDisposable(() => {
			if (--ownedWatch.count === 0 && this.watches.get(backend) === ownedWatch) {
				this.watches.delete(backend);
			}
		});
	}

	async getSessionRun(session: string): Promise<WorkflowRun | undefined> {
		const connection = this.requireConnection();
		const generation = this.generation;
		const backend = this.options.toBackendSession(URI.parse(session).with({ fragment: '' }));
		const run = await connection.getWorkflowRun!(backend);
		this.assertConnection(connection, generation);
		if (run && !isEqual(URI.parse(run.session), backend)) {
			throw new Error(localize('workflow.wrongSession', "The host returned a workflow for a different session."));
		}
		return run ? this.mapRun(connection, run) : undefined;
	}

	async start(options: WorkflowStartOptions, context?: IAgentHostWorkflowStartContext): Promise<WorkflowRun> {
		const connection = this.requireConnection();
		const generation = this.generation;
		await this.rootConfigForwarder?.reconcile();
		this.assertConnection(connection, generation);
		if (!this.options.enabled.get()) {
			throw new Error(localize('workflow.disabled', "Workflows are disabled. Your selected workflow has not been started."));
		}
		await this.reconcileSources(connection, generation);
		this.assertConnection(connection, generation);
		const session = this.options.toBackendSession(URI.parse(options.session).with({ fragment: '' }));
		const chat = URI.parse(options.chat);
		if (!isEqual(chat.with({ fragment: '' }), URI.parse(options.session).with({ fragment: '' }))) {
			throw new Error(localize('workflow.wrongChat', "The selected chat does not belong to the workflow session."));
		}
		const run = await connection.startWorkflow!({
			...options,
			...context,
			session: session.toString(),
			chat: buildChatUri(session, chat.fragment || DEFAULT_CHAT_ID),
			workspace: options.workspace ? connection.resourceUris.toAgentHost(URI.parse(options.workspace)).toString() : undefined,
		});
		this.assertConnection(connection, generation);
		const mapped = this.mapRun(connection, run);
		this.changed.fire(mapped);
		return mapped;
	}

	async control(control: WorkflowControl): Promise<WorkflowRun> {
		const connection = this.requireConnection();
		const generation = this.generation;
		if (control.kind === 'resume' || control.kind === 'setStopAfter' || control.kind === 'provideInputs') {
			await this.rootConfigForwarder?.reconcile();
			this.assertConnection(connection, generation);
			await this.reconcileSources(connection, generation);
			this.assertConnection(connection, generation);
		}
		const run = await connection.controlWorkflow!(control);
		this.assertConnection(connection, generation);
		const mapped = this.mapRun(connection, run);
		this.changed.fire(mapped);
		return mapped;
	}

	private reconcileSources(connection: IAgentConnection, generation: number): Promise<void> {
		return this.sourceReconciliation.queue(async () => {
			const initialization = connection.initializeResult.get();
			let revision: number;
			do {
				revision = this.sourceRevision;
				const states = await this.sourceEnablementService.getSourceStates();
				this.assertConnection(connection, generation);
				if (initialization !== connection.initializeResult.get()) {
					throw new Error(localize('workflow.sourceConnectionChanged', "The workflow host changed while checking source enablement. Reconnect before retrying."));
				}
				if (revision !== this.sourceRevision || (this.publishedSources?.size === states.size && [...states].every(([id, enabled]) => this.publishedSources?.get(id) === enabled))) {
					continue;
				}
				if (!connection.setWorkflowExtensionSources) {
					throw new Error(localize('workflow.sourceControlUnsupported', "The connected host cannot enforce workflow source enablement."));
				}
				await connection.setWorkflowExtensionSources(Object.fromEntries(states));
				this.assertConnection(connection, generation);
				if (initialization !== connection.initializeResult.get()) {
					throw new Error(localize('workflow.sourceConnectionChanged', "The workflow host changed while checking source enablement. Reconnect before retrying."));
				}
				this.publishedSources = states;
			} while (revision !== this.sourceRevision);
		});
	}

	private refresh(watch: WorkflowWatch): void {
		watch.dirty = true;
		if (!watch.refreshing && supportsAgentHostWorkflows(this.connection?.initializeResult.get())) {
			void this.refreshWatch(watch);
		}
	}

	private async refreshWatch(watch: WorkflowWatch): Promise<void> {
		watch.refreshing = true;
		let readGeneration = this.generation;
		try {
			do {
				watch.dirty = false;
				const connection = this.requireConnection();
				const generation = this.generation;
				readGeneration = generation;
				const run = await connection.getWorkflowRun!(watch.session);
				if (this.watches.get(watch.session) !== watch || !this.connection || this._store.isDisposed) {
					return;
				}
				if (connection !== this.connection || generation !== this.generation) {
					watch.dirty = true;
					continue;
				}
				if (run) {
					if (!isEqual(URI.parse(run.session), watch.session)) {
						throw new Error(localize('workflow.wrongSession', "The host returned a workflow for a different session."));
					}
					if (watch.latest && (watch.latest.runId !== run.id || watch.latest.revision > run.revision)) {
						continue;
					}
					this.changed.fire(this.mapRun(connection, run));
				}
			} while (watch.dirty && this.connection && this.watches.get(watch.session) === watch);
		} catch (error) {
			if (this.watches.get(watch.session) === watch && this.connection && readGeneration === this.generation) {
				this.logService.error('Failed to refresh workflow progress', error);
			}
		} finally {
			watch.refreshing = false;
			if (watch.dirty && this.connection && this.watches.get(watch.session) === watch) {
				this.refresh(watch);
			}
		}
	}

	private mapRun(connection: IAgentConnection, run: WorkflowRun): WorkflowRun {
		const session = URI.parse(run.session);
		const chat = parseChatUri(run.chat);
		if (!chat || !isEqual(URI.parse(chat.session), session)) {
			throw new Error(localize('workflow.invalidChat', "The host returned an invalid workflow chat."));
		}
		const resource = this.options.toClientSession(session);
		const mapEvidence = (evidence: WorkflowEvidence): WorkflowEvidence => evidence.kind === 'file'
			? { ...evidence, uri: connection.resourceUris.fromAgentHost(URI.parse(evidence.uri)).toString() }
			: evidence;
		return {
			...run,
			session: resource.toString(),
			chat: resource.with({ fragment: chat.chatId === DEFAULT_CHAT_ID ? '' : chat.chatId }).toString(),
			workspace: run.workspace ? connection.resourceUris.fromAgentHost(URI.parse(run.workspace)).toString() : undefined,
			receipts: run.receipts.map(receipt => ({
				...receipt,
				evidence: receipt.evidence.map(mapEvidence),
			})),
			...(run.startConditionReceipts ? {
				startConditionReceipts: run.startConditionReceipts.map(receipt => ({ ...receipt, evidence: receipt.evidence.map(mapEvidence) })),
			} : {}),
		};
	}

	private requireConnection(): IAgentConnection {
		const connection = this.connection;
		if (!connection?.getWorkflowRun || !connection.startWorkflow || !connection.controlWorkflow || !supportsAgentHostWorkflows(connection.initializeResult.get())) {
			throw new Error(localize('workflow.unavailable', "The connected host does not support workflows."));
		}
		return connection;
	}

	private assertConnection(connection: IAgentConnection, generation: number): void {
		if (connection !== this.connection || generation !== this.generation) {
			throw new Error(localize('workflow.connectionChanged', "The workflow host connection changed. Reconnect to check its saved state before retrying."));
		}
	}
}
