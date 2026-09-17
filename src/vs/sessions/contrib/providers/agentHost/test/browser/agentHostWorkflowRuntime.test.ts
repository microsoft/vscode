/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostWorkflowsEnabledConfigKey } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { identityAgentHostResourceUriMapper, fromAgentHostUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentWorkflowCapabilityMetaKey, IAgentWorkflowRunChange } from '../../../../../../platform/agentHost/common/meta/agentWorkflowMeta.js';
import { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildChatUri, ROOT_STATE_URI, RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { WorkflowRun, WorkflowStartOptions } from '../../../../../../platform/workflow/common/workflow.js';
import { getWorkflowProgress } from '../../../../../../platform/workflow/common/workflowProgress.js';
import { IWorkflowSourceEnablementService } from '../../../../../../workbench/contrib/workflows/common/workflowSources.js';
import { AgentHostWorkflowRuntime } from '../../browser/agentHostWorkflowRuntime.js';

suite('AgentHostWorkflowRuntime', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const client = URI.parse('test-client:/session');
	const backend = URI.parse('test-agent:/session');

	function run(revision = 1): WorkflowRun {
		return {
			id: 'run', version: 1, revision, session: backend.toString(), chat: buildChatUri(backend, 'peer'),
			task: 'Implement feature', inputs: {}, snapshot: {
				id: 'workflow', version: 1, label: 'Feature',
				checkpoints: [{
					id: 'plan', label: 'Plan', instructions: 'Create a plan.', inputs: {},
					type: { id: 'plan', version: 1, label: 'Plan', instructions: 'Create a plan.', proofSchema: { type: 'object' }, completion: { kind: 'reported' } },
				}],
			},
			stopAfter: 'plan', status: 'running', checkpointIndex: 0, receipts: [], firstTurns: {},
			createdAt: 1, updatedAt: 1, activityAt: 1,
		};
	}

	function connection(changes: Emitter<IAgentWorkflowRunChange>, overrides: Partial<IAgentConnection> = {}): IAgentConnection {
		return upcastPartial<IAgentConnection>({
			initializeResult: constObservable(upcastPartial<InitializeResult>({ _meta: { [AgentWorkflowCapabilityMetaKey]: true } })),
			rootState: { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
			dispatch: () => { },
			resourceUris: identityAgentHostResourceUriMapper,
			onDidChangeWorkflowRun: changes.event,
			getWorkflowRun: async () => run(),
			startWorkflow: async () => run(),
			controlWorkflow: async () => run(2),
			setWorkflowExtensionSources: async () => { },
			...overrides,
		});
	}

	function runtime(onProgress: (change: IAgentWorkflowRunChange) => void = () => { }, enabled: IObservable<boolean> = constObservable(true), sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: Event.None, getSourceStates: async () => new Map() }): AgentHostWorkflowRuntime {
		return store.add(new AgentHostWorkflowRuntime({
			enabled,
			toBackendSession: resource => resource.with({ scheme: backend.scheme }),
			toClientSession: resource => resource.with({ scheme: client.scheme }),
			onProgress,
		}, new NullLogService(), sources));
	}

	function startOptions(): WorkflowStartOptions {
		return {
			session: client.toString(), chat: client.with({ fragment: 'peer' }).toString(),
			task: 'Implement feature', snapshot: run().snapshot, stopAfter: 'plan',
		};
	}

	function rootState(enabled: boolean, advertised = true): RootState {
		return {
			agents: [],
			config: {
				schema: { type: 'object', properties: advertised ? { [AgentHostWorkflowsEnabledConfigKey]: { type: 'boolean', title: 'Workflows' } } : {} },
				values: advertised ? { [AgentHostWorkflowsEnabledConfigKey]: enabled } : {},
			},
		};
	}

	function configurationConnection(initial?: RootState) {
		const changed = store.add(new Emitter<RootState>());
		const initializeResult = observableValue<InitializeResult | undefined>('initializeResult', upcastPartial<InitializeResult>({ _meta: { [AgentWorkflowCapabilityMetaKey]: true } }));
		let state = initial;
		const events: ('enabled' | 'disabled' | 'started' | 'controlled' | 'source-enabled' | 'source-disabled')[] = [];
		const sourceUpdates: [string, boolean][] = [];
		const sourceSnapshots: Readonly<Record<string, boolean>>[] = [];
		const setState = (value: RootState) => {
			state = value;
			changed.fire(value);
		};
		return {
			events, sourceUpdates, sourceSnapshots, setState, initializeResult,
			connection: connection(store.add(new Emitter<IAgentWorkflowRunChange>()), {
				initializeResult,
				rootState: {
					get value() { return state; },
					get verifiedValue() { return state; },
					onDidChange: changed.event, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
				},
				dispatch: (channel, action) => {
					if (channel !== ROOT_STATE_URI || action.type !== ActionType.RootConfigChanged || typeof action.config[AgentHostWorkflowsEnabledConfigKey] !== 'boolean') {
						assert.fail('Only the workflow rollout flag may be forwarded');
					}
					const enabled = action.config[AgentHostWorkflowsEnabledConfigKey];
					events.push(enabled ? 'enabled' : 'disabled');
					setState(rootState(enabled));
				},
				startWorkflow: async () => { events.push('started'); return run(); },
				controlWorkflow: async () => { events.push('controlled'); return run(2); },
				setWorkflowExtensionSources: async sources => {
					sourceSnapshots.push(sources);
					for (const [id, enabled] of Object.entries(sources)) {
						sourceUpdates.push([id, enabled]);
						events.push(enabled ? 'source-enabled' : 'source-disabled');
					}
				},
			}),
		};
	}

	async function flush(): Promise<void> {
		await timeout(0);
	}

	test('publishes source decisions before enabling and does not resume on re-enablement', async () => {
		const changed = store.add(new Emitter<void>());
		const states = new Map([['example.workflows', false]]);
		const sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: changed.event, getSourceStates: async () => new Map(states) };
		const host = configurationConnection(rootState(false));
		const facade = runtime(undefined, undefined, sources);
		store.add(facade.bind(host.connection));
		await facade.start(startOptions());
		states.set('example.workflows', true);
		changed.fire();
		await flush();
		assert.deepStrictEqual({ events: host.events, sources: host.sourceUpdates }, {
			events: ['source-disabled', 'enabled', 'started', 'source-enabled'],
			sources: [['example.workflows', false], ['example.workflows', true]],
		});
	});

	test('a late source read cannot enable or write to a replaced connection', async () => {
		const pending = new DeferredPromise<ReadonlyMap<string, boolean>>();
		let initial = true;
		const sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: Event.None, getSourceStates: () => {
			if (initial) {
				initial = false;
				return pending.p;
			}
			return Promise.resolve(new Map([['example.workflows', false]]));
		} };
		const previous = configurationConnection(rootState(false));
		const current = configurationConnection(rootState(false));
		const facade = runtime(undefined, undefined, sources);
		store.add(facade.bind(previous.connection));
		await flush();
		store.add(facade.bind(current.connection));
		await pending.complete(new Map([['example.workflows', true]]));
		await facade.start(startOptions());
		assert.deepStrictEqual({ previous: previous.events, current: current.events, sources: current.sourceUpdates }, {
			previous: [],
			current: ['source-disabled', 'enabled', 'started'],
			sources: [['example.workflows', false]],
		});
	});

	test('an empty source snapshot is published after reconnect to revoke disconnected removals', async () => {
		const host = configurationConnection(rootState(false));
		const facade = runtime();
		store.add(facade.bind(host.connection));
		await facade.start(startOptions());
		host.initializeResult.set(undefined, undefined);
		host.setState(rootState(false));
		host.initializeResult.set(upcastPartial<InitializeResult>({ _meta: { [AgentWorkflowCapabilityMetaKey]: true } }), undefined);
		await facade.start(startOptions());
		assert.deepStrictEqual(host.sourceSnapshots, [{}, {}]);
	});

	test('source changes during publication are reconciled before enabling execution', async () => {
		const changed = store.add(new Emitter<void>());
		const states = new Map([['example.workflows', true]]);
		const sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: changed.event, getSourceStates: async () => new Map(states) };
		const host = configurationConnection(rootState(false));
		const published = new DeferredPromise<void>();
		const original = host.connection.setWorkflowExtensionSources!;
		host.connection.setWorkflowExtensionSources = async sources => {
			await original(sources);
			if (sources['example.workflows']) {
				await published.p;
			}
		};
		const facade = runtime(undefined, undefined, sources);
		store.add(facade.bind(host.connection));
		await flush();
		states.set('example.workflows', false);
		changed.fire();
		await published.complete();
		await facade.start(startOptions());
		assert.deepStrictEqual(host.events, ['source-enabled', 'source-disabled', 'enabled', 'started']);
	});

	test('source failures disable execution and reject an explicit start', async () => {
		const sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: Event.None, getSourceStates: async () => { throw new Error('Extension metadata unavailable'); } };
		const host = configurationConnection(rootState(true));
		const facade = runtime(undefined, undefined, sources);
		store.add(facade.bind(host.connection));
		await assert.rejects(facade.start(startOptions()), /Extension metadata unavailable/);
		assert.deepStrictEqual(host.events, ['disabled']);
	});

	test('disabling workflows does not wait for source discovery', async () => {
		const pending = new DeferredPromise<ReadonlyMap<string, boolean>>();
		const sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: Event.None, getSourceStates: () => pending.p };
		const enabled = observableValue('workflows enabled', true);
		const host = configurationConnection(rootState(true));
		const facade = runtime(undefined, enabled, sources);
		store.add(facade.bind(host.connection));
		await flush();
		enabled.set(false, undefined);
		await flush();
		assert.deepStrictEqual(host.events, ['disabled']);
		await pending.complete(new Map());
		await flush();
	});

	test('pause does not wait for source discovery or enable workflow execution', async () => {
		const pending = new DeferredPromise<ReadonlyMap<string, boolean>>();
		const sources: IWorkflowSourceEnablementService = { _serviceBrand: undefined, onDidChange: Event.None, getSourceStates: () => pending.p };
		const host = configurationConnection(rootState(false));
		const facade = runtime(undefined, undefined, sources);
		store.add(facade.bind(host.connection));
		await facade.control({ kind: 'pause', runId: 'run', revision: 1 });
		assert.deepStrictEqual(host.events, ['controlled']);
		await pending.complete(new Map());
		await flush();
	});

	test('forwards the owner flag after schema hydration and before explicit startup', async () => {
		const host = configurationConnection();
		const facade = runtime();
		store.add(facade.bind(host.connection));
		await flush();
		const beforeHydration = [...host.events];
		host.setState(rootState(false));
		await facade.start(startOptions());
		assert.deepStrictEqual({ beforeHydration, events: host.events }, { beforeHydration: [], events: ['enabled', 'started'] });
	});

	test('mirrors disable and enable without resuming or fighting other clients', async () => {
		const enabled = observableValue('enabled', true);
		const host = configurationConnection(rootState(false));
		const facade = runtime(undefined, enabled);
		store.add(facade.bind(host.connection));
		await flush();
		enabled.set(false, undefined);
		await flush();
		enabled.set(true, undefined);
		await flush();
		host.setState(rootState(false));
		await flush();
		assert.deepStrictEqual(host.events, ['enabled', 'disabled', 'enabled']);
	});

	test('rejects disabled startup but retains inspection and pause controls', async () => {
		const host = configurationConnection(rootState(true));
		const facade = runtime(undefined, constObservable(false));
		store.add(facade.bind(host.connection));
		await assert.rejects(facade.start(startOptions()), /Workflows are disabled/);
		const inspected = await facade.getSessionRun(client.toString());
		await facade.control({ kind: 'pause', runId: 'run', revision: 1 });
		assert.deepStrictEqual({ runId: inspected?.id, events: host.events }, { runId: 'run', events: ['disabled', 'controlled'] });
	});

	test('waits for renewed negotiation and republishes the flag after a host restart', async () => {
		const host = configurationConnection(rootState(true));
		const facade = runtime();
		store.add(facade.bind(host.connection));
		await flush();
		host.initializeResult.set(undefined, undefined);
		host.setState(rootState(false));
		await flush();
		const beforeNegotiation = [...host.events];
		host.initializeResult.set(upcastPartial<InitializeResult>({ _meta: { [AgentWorkflowCapabilityMetaKey]: true } }), undefined);
		await flush();
		assert.deepStrictEqual({ beforeNegotiation, events: host.events }, { beforeNegotiation: [], events: ['enabled'] });
	});

	test('does not write unknown schemas or continue forwarding from a disposed connection', async () => {
		const enabled = observableValue('enabled', true);
		const legacy = configurationConnection(rootState(false, false));
		const next = configurationConnection(rootState(false));
		const facade = runtime(undefined, enabled);
		store.add(facade.bind(legacy.connection));
		await flush();
		const binding = store.add(facade.bind(next.connection));
		binding.dispose();
		await flush();
		enabled.set(false, undefined);
		await flush();
		assert.deepStrictEqual({ legacy: legacy.events, disposed: next.events }, { legacy: [], disposed: [] });
	});

	test('a thousand passive progress updates do not fetch full records or open chats', () => {
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		let projections = 0;
		let reads = 0;
		const facade = runtime(() => projections++);
		store.add(facade.bind(connection(changes, {
			getWorkflowRun: async () => { reads++; return run(); },
			getSubscription: () => { throw new Error('A workflow must not open session transcripts'); },
		})));
		for (let index = 0; index < 1000; index++) {
			changes.fire({ session: `test-agent:/session-${index}`, progress: getWorkflowProgress(run(index + 1)) });
		}
		assert.deepStrictEqual({ projections, reads }, { projections: 1000, reads: 0 });
	});

	test('maps display resources and chat identity without rewriting canonical proof', async () => {
		const file = URI.file('C:\\workspace\\plan.md');
		const proof = { resource: file.toString() };
		const value: WorkflowRun = {
			...run(), workspace: URI.file('C:\\workspace').toString(),
			receipts: [{
				id: 'receipt', checkpointId: 'plan', assignmentId: 'assignment', acceptedAt: 1, provenance: 'checked',
				proof, output: proof, evidence: [{ kind: 'file', label: 'plan.md', uri: file.toString() }],
			}],
			startConditionReceipts: [{
				id: 'condition', checkpointId: 'plan', assignmentId: 'assignment', checkId: 'test.fileExists',
				observedAt: 1, provenance: 'checked', output: proof,
				evidence: [{ kind: 'file', label: 'plan.md', uri: file.toString() }],
			}],
		};
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		const facade = runtime();
		store.add(facade.bind(connection(changes, {
			getWorkflowRun: async () => value,
			resourceUris: { fromAgentHost: resource => toAgentHostUri(resource, 'remote'), toAgentHost: fromAgentHostUri },
		})));
		const mapped = await facade.getSessionRun(client.toString());
		assert.deepStrictEqual({
			session: mapped?.session, chat: mapped?.chat, workspace: mapped?.workspace,
			proof: mapped?.receipts[0].proof, output: mapped?.receipts[0].output, evidence: mapped?.receipts[0].evidence,
			startConditions: mapped?.startConditionReceipts,
		}, {
			session: client.toString(), chat: client.with({ fragment: 'peer' }).toString(),
			workspace: toAgentHostUri(URI.file('C:\\workspace'), 'remote').toString(),
			proof, output: proof, evidence: [{ kind: 'file', label: 'plan.md', uri: toAgentHostUri(file, 'remote').toString() }],
			startConditions: [{
				id: 'condition', checkpointId: 'plan', assignmentId: 'assignment', checkId: 'test.fileExists',
				observedAt: 1, provenance: 'checked', output: proof,
				evidence: [{ kind: 'file', label: 'plan.md', uri: toAgentHostUri(file, 'remote').toString() }],
			}],
		});
	});

	test('maps explicit starts to the owning host and does not inherit a different chat', async () => {
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		const starts: WorkflowStartOptions[] = [];
		const facade = runtime();
		store.add(facade.bind(connection(changes, {
			startWorkflow: async options => { starts.push(options); return run(); },
		})));
		const options = startOptions();
		await facade.start(options);
		await assert.rejects(facade.start({ ...options, chat: 'test-client:/another-session' }), /does not belong/);
		assert.deepStrictEqual(starts, [{ ...options, session: backend.toString(), chat: buildChatUri(backend, 'peer'), workspace: undefined }]);
	});

	test('reference-counts watches and stops full reads after the last view closes', async () => {
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		let reads = 0;
		const facade = runtime();
		store.add(facade.bind(connection(changes, { getWorkflowRun: async () => run(++reads) })));
		const initial = Event.toPromise(facade.onDidChangeRun);
		const first = store.add(facade.watchSession(client.toString()));
		const second = store.add(facade.watchSession(client.toString()));
		await initial;
		first.dispose();
		const updated = Event.toPromise(facade.onDidChangeRun);
		changes.fire({ session: backend.toString(), progress: getWorkflowProgress(run(2)) });
		await updated;
		second.dispose();
		changes.fire({ session: backend.toString(), progress: getWorkflowProgress(run(3)) });
		assert.strictEqual(reads, 2);
	});

	test('does not publish late reads after a workflow view closes', async () => {
		const pending = new DeferredPromise<WorkflowRun>();
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		const received: WorkflowRun[] = [];
		const facade = runtime();
		store.add(facade.onDidChangeRun(value => received.push(value)));
		store.add(facade.bind(connection(changes, { getWorkflowRun: () => pending.p })));
		const watch = store.add(facade.watchSession(client.toString()));
		watch.dispose();
		await pending.complete(run());
		assert.deepStrictEqual(received, []);
	});

	test('a reconnect refreshes a watched run after the old read rejects', async () => {
		const pending = new DeferredPromise<WorkflowRun>();
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		const facade = runtime();
		const firstBinding = store.add(facade.bind(connection(changes, { getWorkflowRun: () => pending.p })));
		store.add(facade.watchSession(client.toString()));
		firstBinding.dispose();
		const updated = Event.toPromise(facade.onDidChangeRun);
		store.add(facade.bind(connection(changes, { getWorkflowRun: async () => run(3) })));
		await pending.error(new Error('Old connection closed'));
		assert.strictEqual((await updated).revision, 3);
	});

	test('waits for capability negotiation before refreshing restored watches', async () => {
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		const initialization = observableValue<InitializeResult | undefined>('workflowInitialization', undefined);
		const facade = runtime();
		let reads = 0;
		store.add(facade.watchSession(client.toString()));
		store.add(facade.bind(connection(changes, {
			initializeResult: initialization,
			getWorkflowRun: async () => { reads++; return run(); },
		})));
		const beforeNegotiation = reads;
		const updated = Event.toPromise(facade.onDidChangeRun);
		initialization.set(upcastPartial<InitializeResult>({ _meta: { [AgentWorkflowCapabilityMetaKey]: true } }), undefined);
		await updated;
		assert.deepStrictEqual({ beforeNegotiation, afterNegotiation: reads }, { beforeNegotiation: 0, afterNegotiation: 1 });
	});

	test('rejects hosts without negotiated support before dispatching', async () => {
		const changes = store.add(new Emitter<IAgentWorkflowRunChange>());
		const facade = runtime();
		store.add(facade.bind(connection(changes, { initializeResult: constObservable(undefined) })));
		await assert.rejects(facade.getSessionRun(client.toString()), /does not support/);
	});
});
