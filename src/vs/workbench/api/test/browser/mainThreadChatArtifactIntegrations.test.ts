/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, ImmortalReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, observableValue, waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactIntegrationRegistry } from '../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { ArtifactIntegrationService } from '../../../../platform/artifactIntegrations/common/artifactIntegrationService.js';
import { isArtifactRunSettled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ArtifactAutomationNotice, ArtifactPromptRequest, IArtifactIntegrationStorage, IArtifactRuntime } from '../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadChatArtifactIntegrations } from '../../browser/mainThreadChatArtifactIntegrations.js';
import { ExtHostChatArtifactIntegrations } from '../../common/extHostChatArtifactIntegrations.js';
import { ExtHostChatArtifactIntegrationsShape } from '../../common/extHost.protocol.js';
import { ThemeColor, ThemeIcon } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

class TestObservation extends Disposable implements vscode.ChatArtifactIntegration {
	private readonly changed = this._register(new Emitter<void>());
	private readonly detailsChanged = this._register(new Emitter<void>());
	readonly onDidChange = this.changed.event;
	disposed = false;
	detailsDisposed = 0;
	loadMoreCalls = 0;
	canLoadMore = false;
	effects = 0;
	failure: Error | undefined;
	skip = false;
	readonly reconciled: string[] = [];
	state: vscode.ChatArtifactIntegrationState = {
		main: { label: 'Experiment', description: 'Stopped', icon: new ThemeIcon('beaker', new ThemeColor('charts.green')), detailsId: 'main' },
		stateActions: [{ id: 'start', enabled: true }],
	};
	details: Record<string, vscode.ChatArtifactDetails> = {
		main: { title: 'Experiment', description: 'Stopped', actions: ['start'], facts: [{ id: 'state', label: 'State', value: 'Stopped' }] },
	};
	activateAutomation: NonNullable<vscode.ChatArtifactIntegration['activateAutomation']> = () => Disposable.None;
	actions: readonly vscode.ChatArtifactAction[] = [{
		id: 'start', label: 'Start', icon: new ThemeIcon('play'), executionScope: 'resource',
		prepare: async () => this.skip ? { kind: 'skipped', reason: 'Confirmation cancelled' } : { kind: 'ready' },
		run: async () => {
			if (this.failure) {
				throw this.failure;
			}
			this.effects++;
			this.updateDetails({ main: { title: 'Experiment', description: 'Running', actions: ['start'] } });
			this.update({
				...this.state, main: { ...this.state.main!, description: 'Running' },
				stateActions: [{ id: 'start', enabled: false, disabledReason: 'Already running' }],
			});
			return { kind: 'completed', summary: 'Started' };
		},
		reconcile: async runId => {
			this.reconciled.push(runId);
			return { kind: 'notExecuted' };
		},
	}];

	acquireDetails(detailsId: string): vscode.ChatArtifactDetailsModel {
		const self = this;
		const model: vscode.ChatArtifactDetailsModel = {
			get details() { return self.details[detailsId]; },
			onDidChange: this.detailsChanged.event,
			dispose: () => { this.detailsDisposed++; },
		};
		if (!this.canLoadMore) {
			return model;
		}
		return {
			get details() { return self.details[detailsId]; },
			onDidChange: this.detailsChanged.event,
			dispose: model.dispose,
			loadMore: async () => {
				this.loadMoreCalls++;
				this.updateDetails({
					...this.details,
					[detailsId]: { ...this.details[detailsId], facts: [{ id: 'next', label: 'Page', value: 'Next page' }] },
				});
			},
		};
	}

	update(state: vscode.ChatArtifactIntegrationState): void {
		this.state = state;
		this.changed.fire();
	}

	updateDetails(details: Record<string, vscode.ChatArtifactDetails>): void {
		this.details = details;
		this.detailsChanged.fire();
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

suite('Chat artifact integration extension bridge', () => {
	let store: DisposableStore;
	teardown(async () => {
		store.dispose();
		await timeout(0);
	});
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => {
		store = disposables.add(new DisposableStore());
	});
	const resource = URI.parse('https://experiments.test/features/example');

	function bridge(beforeCreatedResult?: () => void, overrides: Partial<IArtifactRuntime> = {}) {
		const registry = store.add(new ArtifactIntegrationRegistry());
		const proxy: ExtHostChatArtifactIntegrationsShape = {
			$match: (...args) => extHost.$match(...args),
			$signIn: (...args) => extHost.$signIn(...args),
			$createIntegration: async (...args) => {
				const result = await extHost.$createIntegration(...args);
				beforeCreatedResult?.();
				return result;
			},
			$disposeIntegration: handle => extHost.$disposeIntegration(handle),
			$acquireDetails: (...args) => extHost.$acquireDetails(...args),
			$loadMoreDetails: (...args) => extHost.$loadMoreDetails(...args),
			$disposeDetails: handle => extHost.$disposeDetails(handle),
			$prepareAction: (...args) => extHost.$prepareAction(...args),
			$runAction: (...args) => extHost.$runAction(...args),
			$providePrompt: (...args) => extHost.$providePrompt(...args),
			$reconcileAction: (...args) => extHost.$reconcileAction(...args),
			$activateAutomation: (...args) => extHost.$activateAutomation(...args),
			$onDidChangeAutomation: (...args) => extHost.$onDidChangeAutomation(...args),
			$disposeAutomation: (...args) => extHost.$disposeAutomation(...args),
		};
		const errors: string[] = [];
		const log = store.add(new class extends NullLogService {
			override error(message: string | Error): void { errors.push(String(message)); }
		}());
		const mainThread = store.add(new MainThreadChatArtifactIntegrations(SingleProxyRPCProtocol(proxy), registry, log));
		const extHost = store.add(new ExtHostChatArtifactIntegrations(SingleProxyRPCProtocol(mainThread), log));
		let persisted: string | undefined;
		const prompts: ArtifactPromptRequest[] = [];
		const notices: ArtifactAutomationNotice[] = [];
		const origin = 'vendor-chat://recorded/path?thread=opaque';
		const runtime: IArtifactRuntime = {
			authority: { id: 'client-test', targetHost: 'vendor-host', location: 'client' },
			available: constObservable(true),
			isOwner: () => true,
			acquireSession: async () => new ImmortalReference(constObservable({
				availability: { kind: 'available' as const }, archived: false,
				artifacts: [{ id: 'record', resource: resource.toString(), label: 'Recorded experiment', origin: { chat: origin } }],
			})),
			authorize: async () => ({ kind: 'allowed' }),
			postNotice: async notice => { notices.push(notice); },
			chat: {
				admission: 'bestEffort',
				observeChat: () => ({ state: constObservable({ available: true, busy: false }), dispose() { } }),
				submit: async request => {
					prompts.push(request);
					const outcome = { kind: 'completed', reason: 'Analysis completed' } as const;
					return {
						kind: 'accepted',
						handle: {
							requestId: request.requestId, receipt: { kind: 'turn', turnId: request.requestId },
							state: constObservable(outcome), completion: Promise.resolve(outcome),
							cancel: async () => { }, dispose: () => { },
						},
					};
				},
				recover: async () => { throw new Error('Extension resource actions must not recover prompts'); },
			},
			...overrides,
		};
		const storage: IArtifactIntegrationStorage = { read: async () => persisted, write: async value => { persisted = value; } };
		const service = store.add(new ArtifactIntegrationService(runtime, storage, registry, log));
		return { registry, extHost, mainThread, service, errors, prompts, notices, origin, runtime, storage, log };
	}

	function register(extHost: ExtHostChatArtifactIntegrations, overrides: Partial<vscode.ChatArtifactIntegrationProvider> = {}) {
		const observations: TestObservation[] = [];
		const changes = store.add(new Emitter<void>());
		const registration = store.add(extHost.registerProvider(nullExtensionDescription, 'experiments', {
			label: 'Experiments',
			match: uri => uri.authority === resource.authority ? { kind: 'matched', resource: uri, key: uri.toString(), credentialScope: 'test-account' } : undefined,
			createArtifactIntegration: () => {
				const observation = new TestObservation();
				observations.push(observation);
				return observation;
			},
			onDidChange: changes.event,
			...overrides,
		}));
		return { observations, changes, registration };
	}

	function registerAutomation(extHost: ExtHostChatArtifactIntegrations, activate?: NonNullable<vscode.ChatArtifactIntegration['activateAutomation']>) {
		const contexts: { context: vscode.ChatArtifactAutomationContext; token: vscode.CancellationToken; disposed: boolean }[] = [];
		const prepared: vscode.ChatArtifactActionContext[] = [];
		const observations: TestObservation[] = [];
		const registration = register(extHost, {
			automationOptions: [{ id: 'analyze', kind: 'boolean', label: 'Automatically Analyze', description: 'Send an analysis prompt in this chat.', actionIds: ['analyze'], maxAttempts: 1, defaultValue: false }],
			createArtifactIntegration: () => {
				const observation = new TestObservation();
				observations.push(observation);
				observation.actions = [...observation.actions, {
					id: 'analyze', kind: 'prompt', label: 'Analyze', icon: new ThemeIcon('graph'),
					providePrompt: context => { prepared.push(context); return { text: 'Analyze the experiment without making changes.' }; },
				}];
				observation.state = {
					...observation.state,
					stateActions: [...observation.state.stateActions!, { id: 'analyze', enabled: true }],
					automationAvailability: [{ id: 'analyze', available: true }],
				};
				observation.updateDetails({ main: { ...observation.details.main, actions: ['start', 'analyze'], automations: ['analyze'] } });
				observation.activateAutomation = (context, token) => {
					const entry = { context, token, disposed: false };
					contexts.push(entry);
					return activate ? activate(context, token) : toDisposable(() => { entry.disposed = true; });
				};
				return observation;
			},
		});
		return { ...registration, contexts, prepared, observations };
	}

	function automaticRequest(context: vscode.ChatArtifactAutomationContext): vscode.ChatArtifactAutomationRequest {
		return { optionId: 'analyze', actionId: 'analyze', configurationRevision: context.configuration.revision, occurrenceKey: 'scheduled-check-in', reason: 'The scheduled analysis is due.' };
	}

	test('preserves extension-provided list icons without a pill section', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const observation = observations[0];
		const list = { id: 'progress', label: 'Progress', icon: new ThemeIcon('graph', new ThemeColor('charts.green')), detailsId: 'main' };
		observation.update({ ...observation.state, sections: [], lists: [list] });
		const withIcon = model.snapshot.get().contributions[0].view;
		observation.update({ ...observation.state, lists: [{ ...list, icon: undefined }] });
		assert.deepStrictEqual({
			sections: withIcon.sections, lists: withIcon.lists,
			withoutIcon: model.snapshot.get().contributions[0].view.lists,
		}, {
			sections: [],
			lists: [{ id: 'progress', label: 'Progress', detailsId: 'main', icon: { id: 'graph', colorId: 'charts.green' } }],
			withoutIcon: [{ id: 'progress', label: 'Progress', detailsId: 'main' }],
		});
	});

	test('carries the provider group label and each observation group icon and priority', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost, { groupLabel: 'Experiments' });
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const observation = observations[0];
		const ungrouped = model.snapshot.get().contributions[0].view.group;
		observation.update({ ...observation.state, group: { icon: new ThemeIcon('beaker', new ThemeColor('charts.red')), priority: 3 } });
		const contribution = model.snapshot.get().contributions[0];
		assert.deepStrictEqual({ groupLabel: contribution.groupLabel, ungrouped, group: contribution.view.group }, {
			groupLabel: 'Experiments', ungrouped: undefined, group: { icon: { id: 'beaker', colorId: 'charts.red' }, priority: 3 },
		});
		assert.throws(() => extHost.registerProvider(nullExtensionDescription, 'invalidGroup', {
			label: 'Invalid', groupLabel: 'Two\nlines', match: () => undefined, createArtifactIntegration: () => undefined,
		}));
	});

	test('matches, converts themed details, executes a manual action, and updates observations', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const contribution = model.snapshot.get().contributions[0];
		const details = store.add(await model.acquireDetails(contribution.integrationId, 'main'));
		const initial = { main: contribution.view.main, details: details.details.get().description };
		const run = await model.invoke(contribution.integrationId, 'start', 'vendor-chat://opaque', 'request-1');
		await waitForState(model.snapshot, value => value.runs.some(value => value.id === run.id && isArtifactRunSettled(value)));
		assert.deepStrictEqual({
			initial, observations: observations.length, effects: observations[0].effects,
			state: model.snapshot.get().contributions[0].view.main?.description,
			details: details.details.get().description,
			run: model.snapshot.get().runs.map(run => ({ state: run.state, source: run.source, kind: run.actionKind })),
		}, {
			initial: { main: { label: 'Experiment', description: 'Stopped', icon: { id: 'beaker', colorId: 'charts.green' }, detailsId: 'main' }, details: 'Stopped' },
			observations: 1, effects: 1, state: 'Running', details: 'Running',
			run: [{ state: 'completed', source: 'manual', kind: 'code' }],
		});
	});

	test('list-only details and actual Markdown descriptions cross the bridge as immutable snapshots', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const observation = observations[0];
		const lists = [{ id: 'progress', label: 'Progressions', detailsId: 'progress' }];
		const progress = { title: 'Progressions', items: [{ id: 'one', label: 'First progression', icon: new ThemeIcon('pass'), resource }] };
		observation.update({ ...observation.state, lists });
		observation.updateDetails({ main: { title: 'The real experiment title', description: '**Actual** description', descriptionFormat: 'markdown' }, progress });
		const contribution = model.snapshot.get().contributions[0];
		const main = store.add(await model.acquireDetails(contribution.integrationId, 'main'));
		const list = store.add(await model.acquireDetails(contribution.integrationId, 'progress'));
		lists[0].label = 'Mutated after publication';
		progress.items[0].label = 'Mutated after publication';
		assert.deepStrictEqual({
			lists: contribution.view.lists, main: { title: main.details.get().title, description: main.details.get().description, format: main.details.get().descriptionFormat },
			items: list.details.get().items.map(item => item.label),
		}, {
			lists: [{ id: 'progress', label: 'Progressions', detailsId: 'progress' }],
			main: { title: 'The real experiment title', description: '**Actual** description', format: 'markdown' },
			items: ['First progression'],
		});
	});

	test('details updates, paging capability and disposal cross the bridge independently of state', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost, {
			createArtifactIntegration: () => {
				const observation = new TestObservation();
				observation.canLoadMore = true;
				observations.push(observation);
				return observation;
			},
		});
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const contribution = model.snapshot.get().contributions[0];
		const details = await model.acquireDetails(contribution.integrationId, 'main');
		await timeout(0);
		assert.ok(details.loadMore);
		await details.loadMore(CancellationToken.None);
		await waitForState(details.details, value => !!value.facts?.some(fact => fact.id === 'next'));
		details.dispose();
		await timeout(0);
		assert.deepStrictEqual({
			loadMoreCalls: observations[0].loadMoreCalls,
			facts: observations[0].details.main.facts?.map(fact => fact.value),
			detailsDisposed: observations[0].detailsDisposed,
		}, { loadMoreCalls: 1, facts: ['Next page'], detailsDisposed: 2 });
	});

	test('authentication-required matches retain presentation and sign in within the extension', async () => {
		const { extHost, service } = bridge();
		const signIns: string[] = [];
		let signedIn = false;
		register(extHost, {
			match: candidate => signedIn
				? { kind: 'matched', resource: candidate, key: candidate.toString(), credentialScope: 'account' }
				: { kind: 'authenticationRequired', reason: 'Sign in to continue.', main: { label: 'Experiment', icon: new ThemeIcon('beaker'), detailsId: 'main' } },
			signIn: candidate => {
				signIns.push(candidate.toString());
				signedIn = true;
			},
		});
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const contribution = model.snapshot.get().contributions[0];
		const challenge = await model.requestAuthentication(contribution.integrationId);
		const rematched = await waitForState(model.snapshot, value => value.contributions[0]?.view.availability.kind === 'available');
		assert.deepStrictEqual({
			availability: contribution.view.availability,
			authentication: contribution.authentication,
			main: contribution.view.main,
			challenge,
			signIns,
			rematched: rematched.contributions[0].authentication,
		}, {
			availability: { kind: 'authenticationRequired', reason: 'Sign in to continue.' },
			authentication: { enabled: true, handledByIntegration: true },
			main: { label: 'Experiment', description: undefined, icon: { id: 'beaker', colorId: undefined }, detailsId: 'main' },
			challenge: undefined,
			signIns: [resource.toString()],
			rematched: undefined,
		});
	});

	test('shares resource observations, invalidates them for every binding, and unregisters', async () => {
		const { extHost, service } = bridge();
		const { observations, changes, registration } = register(extHost);
		const first = store.add(await service.acquireArtifact('vendor-session://first', 'record'));
		const second = store.add(await service.acquireArtifact('vendor-session://second', 'record'));
		const shared = observations.length;
		changes.fire();
		await timeout(0);
		const replaced = { count: observations.length, oldDisposed: observations[0].disposed };
		registration.dispose();
		await timeout(0);
		assert.deepStrictEqual({
			shared, replaced, allDisposed: observations.every(observation => observation.disposed),
			remaining: [first, second].map(reference => reference.object.snapshot.get().contributions.length),
		}, { shared: 1, replaced: { count: 2, oldDisposed: true }, allDisposed: true, remaining: [0, 0] });
	});

	test('an update arriving before resource creation completes wins over the initial snapshot', async () => {
		const observations: TestObservation[] = [];
		const { extHost, service } = bridge(() => observations[0].update({
			...observations[0].state, main: { ...observations[0].state.main!, description: 'Newer state' },
		}));
		register(extHost, {
			createArtifactIntegration: () => {
				const observation = new TestObservation();
				observations.push(observation);
				return observation;
			},
		});
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		assert.strictEqual(model.snapshot.get().contributions[0].view.main?.description, 'Newer state');
	});

	test('invalid state is visible as an error and never enables an unknown action', async () => {
		const { extHost, service, errors } = bridge();
		const { observations } = register(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		observations[0].update({ ...observations[0].state, stateActions: [{ id: 'unknown', enabled: true }] });
		const view = model.snapshot.get().contributions[0].view;
		assert.deepStrictEqual({ kind: view.availability.kind, actions: view.stateActions, errors, effects: observations[0].effects }, {
			kind: 'error', actions: [], errors: ['[ArtifactIntegrations] Invalid extension state'], effects: 0,
		});
	});

	test('ambiguous presentation identities are isolated and valid extension updates recover', async () => {
		const { extHost, service, errors } = bridge();
		const { observations } = registerAutomation(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const observation = observations[0];
		const valid = observation.state;
		const section = { ...valid.main!, id: 'status' };
		const states: string[] = [];
		for (const update of [
			{ ...valid, sections: [section, section] },
			{ ...valid, generalActions: valid.stateActions },
			{ ...valid, automationAvailability: [...valid.automationAvailability!, ...valid.automationAvailability!] },
		]) {
			observation.update(update);
			states.push(model.snapshot.get().contributions[0].view.availability.kind);
			observation.update(valid);
			states.push(model.snapshot.get().contributions[0].view.availability.kind);
		}
		assert.deepStrictEqual({
			states, errors, effects: observation.effects,
			actions: model.snapshot.get().contributions[0].view.stateActions.map(action => action.id),
		}, {
			states: ['error', 'available', 'error', 'available', 'error', 'available'],
			errors: Array(3).fill('[ArtifactIntegrations] Invalid extension state'), effects: 0,
			actions: ['start', 'analyze'],
		});
	});

	test('revalidates action availability and conservatively records uncertain execution failures', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const id = model.snapshot.get().contributions[0].integrationId;
		observations[0].state = { ...observations[0].state, stateActions: [{ id: 'start', enabled: false, disabledReason: 'State changed' }] };
		await assert.rejects(extHost.$runAction(0, 'start', { runId: 'not-dispatched', source: 'manual', initiator: 'user' }, CancellationToken.None), /State changed/);
		observations[0].update({ ...observations[0].state, stateActions: [{ id: 'start', enabled: true }] });
		observations[0].failure = new Error('Mutation rejected by server');
		const run = await model.invoke(id, 'start', 'vendor-chat://opaque', 'failure');
		await waitForState(model.snapshot, value => value.runs.some(value => value.id === run.id && isArtifactRunSettled(value)));
		assert.deepStrictEqual(model.snapshot.get().runs.map(run => ({ state: run.state, reason: run.reason, indeterminate: run.indeterminate })), [
			{ state: 'interrupted', reason: 'Mutation rejected by server', indeterminate: true },
		]);
		await service.whenIdle();
		await model.reconcile(run.id);
		assert.deepStrictEqual({ reconciled: observations[0].reconciled, effects: observations[0].effects, indeterminate: model.snapshot.get().runs[0].indeterminate }, {
			reconciled: [run.id], effects: 0, indeterminate: false,
		});
	});

	test('a cancelled confirmation is recorded as skipped rather than completed', async () => {
		const { extHost, service } = bridge();
		const { observations } = register(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		observations[0].skip = true;
		const run = await model.invoke(model.snapshot.get().contributions[0].integrationId, 'start', 'vendor-chat://opaque', 'cancel-confirmation');
		await waitForState(model.snapshot, value => value.runs.some(value => value.id === run.id && isArtifactRunSettled(value)));
		assert.deepStrictEqual({
			effects: observations[0].effects,
			runs: model.snapshot.get().runs.map(run => ({ state: run.state, reason: run.reason })),
		}, { effects: 0, runs: [{ state: 'skipped', reason: 'Confirmation cancelled' }] });
	});

	for (const reason of ['cancellation', 'unregistration'] as const) {
		test(`disposes a resource returned after ${reason}`, async () => {
			const { extHost } = bridge();
			const pending = new DeferredPromise<vscode.ChatArtifactIntegration>();
			const { registration } = register(extHost, { createArtifactIntegration: () => pending.p });
			const token = store.add(new CancellationTokenSource());
			const creating = extHost.$createIntegration(0, 42, resource, token.token);
			if (reason === 'cancellation') {
				token.cancel();
			} else {
				registration.dispose();
			}
			const observation = new TestObservation();
			await pending.complete(observation);
			await assert.rejects(creating, isCancellationError);
			assert.strictEqual(observation.disposed, true);
		});
	}

	test('rejects duplicate registrations and leaves unmatched resources plain', async () => {
		const { extHost, service, registry } = bridge();
		register(extHost, { match: () => undefined });
		assert.throws(() => register(extHost), /duplicate/);
		const reference = store.add(await service.acquireArtifact('vendor-session://opaque', 'record'));
		assert.deepStrictEqual({ registered: registry.integrations.get().length, contributions: reference.object.snapshot.get().contributions }, { registered: 1, contributions: [] });
	});

	test('agent-facing provider descriptions cross the bridge and must be one bounded line', () => {
		const { extHost, registry } = bridge();
		register(extHost, { description: 'Experiment links on experiments.test' });
		const invalid = ['', 'Two\nlines', 'x'.repeat(301)].map(description => {
			try {
				extHost.registerProvider(nullExtensionDescription, 'invalid', { label: 'Invalid', description, match: () => undefined, createArtifactIntegration: () => undefined });
				return 'registered';
			} catch {
				return 'rejected';
			}
		});
		assert.deepStrictEqual({
			registered: registry.integrations.get().map(({ label, description }) => ({ label, description })),
			invalid,
		}, {
			registered: [{ label: 'Experiments', description: 'Experiment links on experiments.test' }],
			invalid: ['rejected', 'rejected', 'rejected'],
		});
	});

	test('prompt actions use the invoking chat manually and the recorded chat automatically, with notices and request cards', async () => {
		const { extHost, service, prompts, notices, origin } = bridge();
		const { contexts, prepared } = registerAutomation(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const contribution = model.snapshot.get().contributions[0];
		const details = store.add(await model.acquireDetails(contribution.integrationId, 'main'));
		assert.deepStrictEqual({ contexts: contexts.length, links: details.details.get().links }, {
			contexts: 0, links: [{ kind: 'action', actionId: 'start' }, { kind: 'action', actionId: 'analyze' }, { kind: 'automation', optionId: 'analyze' }],
		});
		const manual = await model.invoke(contribution.integrationId, 'analyze', 'vendor-chat://invoking', 'manual-analysis');
		await waitForState(model.snapshot, snapshot => snapshot.runs.some(run => run.id === manual.id && run.state === 'completed'));
		await model.configure(contribution.integrationId, 0, { analyze: true });
		const { context } = contexts[0];
		const automatic = await context.runAutomation(automaticRequest(context));
		await waitForState(model.snapshot, snapshot => snapshot.runs.some(run => run.id === automatic.id && run.state === 'completed'));
		const duplicate = await context.runAutomation(automaticRequest(context));
		await model.configure(contribution.integrationId, context.configuration.revision, { analyze: false });
		await timeout(0);
		assert.deepStrictEqual({
			prompts: prompts.map(request => ({ chat: request.chat, source: request.presentation?.source, label: request.presentation?.action.label, details: request.presentation?.details.length })),
			prepared: prepared.map(context => ({ source: context.source, optionId: context.optionId })),
			notices: notices.map(notice => ({ kind: notice.kind, origin: notice.artifact.origin?.chat })),
			duplicate: duplicate.id === automatic.id, disposed: contexts[0].disposed, cancelled: contexts[0].token.isCancellationRequested,
		}, {
			prompts: [{ chat: 'vendor-chat://invoking', source: 'manual', label: 'Analyze', details: 1 }, { chat: origin, source: 'automation', label: 'Analyze', details: 1 }],
			prepared: [{ source: 'manual', optionId: undefined }, { source: 'automation', optionId: 'analyze' }],
			notices: [{ kind: 'enabled', origin }, { kind: 'disabled', origin }],
			duplicate: true, disposed: true, cancelled: true,
		});
		await assert.rejects(async () => context.runAutomation(automaticRequest(context)), isCancellationError);
	});

	test('shared observations have isolated session consent and durable, revisioned checkpoints', async () => {
		const { extHost, service } = bridge();
		const { contexts, observations } = registerAutomation(extHost);
		const first = store.add(await service.acquireArtifact('vendor-session://first', 'record')).object;
		const second = store.add(await service.acquireArtifact('vendor-session://second', 'record')).object;
		const id = first.snapshot.get().contributions[0].integrationId;
		await first.configure(id, 0, { analyze: true });
		await second.configure(id, 0, { analyze: true });
		const firstContext = contexts[0].context;
		const secondContext = contexts[1].context;
		await firstContext.state.write(0, { dueAt: 123, generation: firstContext.configuration.generations.analyze });
		await assert.rejects(async () => firstContext.state.write(0, { dueAt: 456 }), /configuration changed/);
		await assert.rejects(async () => firstContext.runAutomation({ ...automaticRequest(firstContext), actionId: 'start' }), /not authorized/);
		await assert.rejects(async () => firstContext.runAutomation({ ...automaticRequest(firstContext), configurationRevision: 0 }), /configuration changed/);
		assert.deepStrictEqual({
			observations: observations.length,
			checkpoints: [firstContext.state.read(), secondContext.state.read()],
			enabledAt: typeof firstContext.configuration.enabledAt.analyze,
		}, { observations: 1, checkpoints: [{ revision: 1, value: { dueAt: 123, generation: 1 } }, { revision: 0 }], enabledAt: 'number' });
	});

	test('an extension that requests its occurrence on every change settles instead of looping', async () => {
		const { extHost, service, prompts } = bridge();
		let requests = 0;
		let changes = 0;
		registerAutomation(extHost, context => {
			const request = () => {
				// A feedback loop would never yield to the test's timers; stop it so the assertion reports it.
				if (++requests < 50) {
					context.runAutomation(automaticRequest(context)).then(undefined, () => { });
				}
			};
			const listener = context.onDidChange(() => { changes++; request(); });
			request();
			return listener;
		});
		const reference = store.add(await service.acquireArtifact('vendor-session://repeat', 'record'));
		const id = reference.object.snapshot.get().contributions[0].integrationId;
		await reference.object.configure(id, 0, { analyze: true });
		await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(isArtifactRunSettled));
		await service.whenIdle();
		await timeout(20);
		const settled = { requests, changes };
		await timeout(20);
		assert.deepStrictEqual({
			prompts: prompts.length,
			runs: reference.object.snapshot.get().runs.map(run => run.state),
			bounded: requests < 50,
			quiet: requests === settled.requests && changes === settled.changes,
		}, { prompts: 1, runs: ['completed'], bounded: true, quiet: true });
	});

	test('a sign-in the extension already reported rematches once', async () => {
		const { extHost, service } = bridge();
		let signedIn = false;
		let matches = 0;
		const { changes } = register(extHost, {
			match: candidate => {
				matches++;
				return signedIn
					? { kind: 'matched', resource: candidate, key: candidate.toString(), credentialScope: 'account' }
					: { kind: 'authenticationRequired', reason: 'Sign in to continue.', main: { label: 'Experiment', icon: new ThemeIcon('beaker'), detailsId: 'main' } };
			},
			signIn: () => {
				signedIn = true;
				changes.fire();
			},
		});
		const model = store.add(await service.acquireArtifact('vendor-session://signed-in', 'record')).object;
		const before = matches;
		await model.requestAuthentication(model.snapshot.get().contributions[0].integrationId);
		await waitForState(model.snapshot, value => value.contributions[0]?.view.availability.kind === 'available');
		await timeout(0);
		assert.strictEqual(matches - before, 1);
	});

	test('restores consent, enablement time, checkpoints and occurrence deduplication after coordinator restart', async () => {
		const { extHost, service, registry, runtime, storage, log, prompts } = bridge();
		const { contexts } = registerAutomation(extHost);
		const reference = store.add(await service.acquireArtifact('vendor-session://restore', 'record'));
		const id = reference.object.snapshot.get().contributions[0].integrationId;
		await reference.object.configure(id, 0, { analyze: true });
		const enabledAt = contexts[0].context.configuration.enabledAt.analyze;
		await contexts[0].context.state.write(0, { dueAt: enabledAt + 1000 });
		const run = await contexts[0].context.runAutomation(automaticRequest(contexts[0].context));
		await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(candidate => candidate.id === run.id && candidate.state === 'completed'));
		await service.whenIdle();
		reference.dispose();
		service.dispose();
		const restored = store.add(new ArtifactIntegrationService(runtime, storage, registry, log));
		await restored.initialize();
		const context = contexts.at(-1)!.context;
		const duplicate = await context.runAutomation(automaticRequest(context));
		assert.deepStrictEqual({
			checkpoint: context.state.read(), enabledAt: context.configuration.enabledAt.analyze,
			sameRun: duplicate.id === run.id, prompts: prompts.length,
		}, { checkpoint: { revision: 1, value: { dueAt: enabledAt + 1000 } }, enabledAt, sameRun: true, prompts: 1 });
	});

	test('disconnect disposes automation, rejects retained contexts, and resumes from the durable checkpoint', async () => {
		const available = observableValue('available', true);
		const { extHost, service } = bridge(undefined, { available });
		const { contexts } = registerAutomation(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const id = model.snapshot.get().contributions[0].integrationId;
		await model.configure(id, 0, { analyze: true });
		await contexts[0].context.state.write(0, { dueAt: 42 });
		available.set(false, undefined);
		await assert.rejects(async () => contexts[0].context.state.write(1, { dueAt: 99 }), isCancellationError);
		available.set(true, undefined);
		assert.deepStrictEqual({
			count: contexts.length, disposed: contexts[0].disposed, cancelled: contexts[0].token.isCancellationRequested,
			checkpoint: contexts[1].context.state.read(),
		}, { count: 2, disposed: true, cancelled: true, checkpoint: { revision: 1, value: { dueAt: 42 } } });
	});

	test('disposes an activation result returned after consent was revoked', async () => {
		const { extHost, service } = bridge();
		const pending = new DeferredPromise<vscode.Disposable>();
		const { contexts } = registerAutomation(extHost, () => pending.p);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const id = model.snapshot.get().contributions[0].integrationId;
		await model.configure(id, 0, { analyze: true });
		await model.configure(id, contexts[0].context.configuration.revision, { analyze: false });
		let disposed = false;
		await pending.complete(toDisposable(() => { disposed = true; }));
		await timeout(0);
		assert.deepStrictEqual({ disposed, cancelled: contexts[0].token.isCancellationRequested }, { disposed: true, cancelled: true });
	});

	test('revoking consent while a prompt is preparing prevents dispatch', async () => {
		const { extHost, service, prompts } = bridge();
		const { contexts, observations } = registerAutomation(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const id = model.snapshot.get().contributions[0].integrationId;
		const preparing = new DeferredPromise<void>();
		const result = new DeferredPromise<vscode.ChatArtifactPrompt>();
		const action = observations[0].actions.find(action => action.id === 'analyze');
		assert.ok(action?.kind === 'prompt');
		action.providePrompt = async () => { await preparing.complete(); return result.p; };
		await model.configure(id, 0, { analyze: true });
		const run = await contexts[0].context.runAutomation(automaticRequest(contexts[0].context));
		await preparing.p;
		await model.configure(id, contexts[0].context.configuration.revision, { analyze: false });
		await result.complete({ text: 'Must never be sent' });
		await service.whenIdle();
		assert.deepStrictEqual({ prompts: prompts.length, state: model.snapshot.get().runs.find(candidate => candidate.id === run.id)?.state }, { prompts: 0, state: 'cancelled' });
	});

	for (const result of [{ kind: 'skipped', reason: 'The experiment is no longer eligible' } as const, { text: '' }, undefined]) {
		test(`prompt preparation ${result === undefined ? 'missing result' : hasKey(result, { kind: true }) ? 'skip' : 'empty text'} never dispatches a chat turn`, async () => {
			const { extHost, service, prompts } = bridge();
			const { observations } = registerAutomation(extHost);
			const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
			const action = observations[0].actions.find(action => action.id === 'analyze');
			assert.ok(action?.kind === 'prompt');
			action.providePrompt = () => result;
			const run = await model.invoke(model.snapshot.get().contributions[0].integrationId, 'analyze', 'vendor-chat://invoking', 'request');
			await waitForState(model.snapshot, snapshot => snapshot.runs.some(candidate => candidate.id === run.id && isArtifactRunSettled(candidate)));
			assert.deepStrictEqual({ prompts: prompts.length, state: model.snapshot.get().runs.find(candidate => candidate.id === run.id)?.state }, {
				prompts: 0, state: result && hasKey(result, { kind: true }) ? 'skipped' : 'failed',
			});
		});
	}

	test('invalid option declarations fail during registration', () => {
		const { extHost } = bridge();
		assert.throws(() => register(extHost, {
			automationOptions: [{ id: 'auto', label: 'Automatic', description: 'Invalid attempt budget', kind: 'boolean', defaultValue: false, maxAttempts: 0, actionIds: ['start'] }],
		}));
	});

	test('activation failure is exposed instead of leaving an apparently working automation', async () => {
		const { extHost, service, errors } = bridge();
		registerAutomation(extHost, () => { throw new Error('Synthetic activation failure'); });
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		await model.configure(model.snapshot.get().contributions[0].integrationId, 0, { analyze: true });
		await waitForState(model.snapshot, snapshot => snapshot.contributions[0].view.availability.kind === 'error');
		assert.ok(errors.some(error => error.includes('automation')));
	});

	test('invalid automation references fail visibly and unsupported runtimes leave manual actions available', async () => {
		const reason = observableValue<string | undefined>('automationUnavailable', 'Host cannot post notices');
		const { extHost, service, errors } = bridge(undefined, { automationUnavailableReason: reason });
		const { contexts, observations } = registerAutomation(extHost);
		const model = store.add(await service.acquireArtifact('vendor-session://opaque', 'record')).object;
		const contribution = model.snapshot.get().contributions[0];
		await assert.rejects(model.configure(contribution.integrationId, 0, { analyze: true }), /Automatically Analyze cannot be turned on: Host cannot post notices/);
		assert.deepStrictEqual({
			contexts: contexts.length, state: contribution.view.availability.kind,
			action: contribution.view.stateActions[0].enabled, automation: contribution.view.automationAvailability,
		}, { contexts: 0, state: 'available', action: true, automation: [{ id: 'analyze', available: false, unavailableReason: 'Host cannot post notices' }] });
		observations[0].update({ ...observations[0].state, automationAvailability: [{ id: 'unknown', available: true }] });
		assert.deepStrictEqual({ state: model.snapshot.get().contributions[0].view.availability.kind, errors }, {
			state: 'error', errors: ['[ArtifactIntegrations] Invalid extension state'],
		});
	});
});
