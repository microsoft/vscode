/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostClaudeAgentEnabledSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AccountPolicyGateState } from '../../../../../../services/policies/common/accountPolicyService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { ChatOpenDiagnosticsService } from '../../../../common/chatOpenDiagnosticsService.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { IChatModelReference } from '../../../../common/chatService/chatService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { ChatSessionRefreshReason, SessionType } from '../../../../common/chatSessionsService.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
import { AgentSessionsControl } from '../../../../browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter } from '../../../../browser/agentSessions/agentSessionsFilter.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { AgentSessionsViewerOrientation } from '../../../../browser/agentSessions/agentSessions.js';

suite('ChatViewPane sessions refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sessions visibility combines pane body, settings, sidebar width and stacked chat state', async () => {
		const visibility: boolean[] = [];
		const configuration = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsEnabled]: true });
		let bodyVisible = false;
		const host = {
			sessionsContainer: document.createElement('div'),
			viewPaneContainer: document.createElement('div'),
			sessionsControl: { setVisible: (visible: boolean) => visibility.push(visible) },
			configurationService: configuration,
			sessionsViewerOrientation: AgentSessionsViewerOrientation.SideBySide,
			lastDimensions: { width: 1000, height: 600 },
			sessionsViewerVisibilityContext: { set: () => { } },
			isBodyVisible: () => bodyVisible,
			chatEntitlementService: { sentiment: { completed: true } },
			_widget: { isEmpty: () => false },
			_sessionsListSuppressionCount: 0,
		};
		const update = Reflect.get(ChatViewPane.prototype, 'updateSessionsControlVisibility') as (this: typeof host) => void;
		update.call(host);
		bodyVisible = true;
		update.call(host);
		host.lastDimensions.width = 100;
		update.call(host);
		host.lastDimensions.width = 1000;
		update.call(host);
		await configuration.setUserConfiguration(ChatConfiguration.ChatViewSessionsEnabled, false);
		update.call(host);
		await configuration.setUserConfiguration(ChatConfiguration.ChatViewSessionsEnabled, true);
		host.sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
		update.call(host);
		assert.deepStrictEqual(visibility, [false, true, false, true, false, false]);
	});

	test('window focus refreshes automatically while the toolbar retains explicit refresh intent', async () => {
		const focusChanged = store.add(new Emitter<boolean>());
		const reasons: (ChatSessionRefreshReason | undefined)[] = [];
		const control = Object.assign(Object.create(AgentSessionsControl.prototype), {
			agentSessionsService: {
				model: { resolve: async (_provider: string | undefined, _onError: undefined, reason?: ChatSessionRefreshReason) => { reasons.push(reason); } },
			},
			dispose: () => { },
			setVisible: () => { },
		});
		const toolbar = Object.assign(toDisposable(() => { }), { context: control });
		const filter = Object.assign(toDisposable(() => { }), { onDidChange: Event.None, isDefault: () => true });
		const host = {
			_register: <T extends { dispose(): void }>(value: T) => store.add(value),
			instantiationService: {
				createInstance: (ctor: typeof AgentSessionsControl | typeof AgentSessionsFilter | typeof MenuWorkbenchToolBar) => {
					if (ctor === AgentSessionsControl) {
						return control;
					}
					return ctor === AgentSessionsFilter ? filter : toolbar;
				},
			},
			hostService: { onDidChangeFocus: focusChanged.event },
			configurationService: new TestConfigurationService(),
			onDidChangeBodyVisibility: Event.None,
			getLocationBasedColors: () => ({ listOverrideStyles: {} }),
			doUpdateConfiguredSessionsViewerOrientation: () => { },
		};
		const createControl = Reflect.get(ChatViewPane.prototype, 'createSessionsControl') as (this: typeof host, parent: HTMLElement) => AgentSessionsControl;
		createControl.call(host, document.createElement('div'));

		focusChanged.fire(false);
		focusChanged.fire(true);
		focusChanged.fire(false);
		focusChanged.fire(true);
		await toolbar.context.refresh();

		assert.deepStrictEqual(reasons, ['automatic', 'automatic', 'manual']);
	});
});

suite('ChatViewPane session transitions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const previousResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/previous' });
	const nextResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });

	function createPane(resolving: Promise<void> = Promise.resolve(), preparing: Promise<void> = Promise.resolve()) {
		const previousModel = upcastPartial<IChatModel>({ sessionResource: previousResource });
		const nextModel = upcastPartial<IChatModel>({ sessionResource: nextResource });
		let shown: IChatModel | undefined = previousModel;
		let input = 'previous draft';
		const bindings: (URI | undefined)[] = [];
		const disposed: URI[] = [];
		const locks: string[] = [];
		const paneStore = store.add(new DisposableStore());
		const modelRef = paneStore.add(new MutableDisposable<IChatModelReference>());
		const createReference = (model: IChatModel): IChatModelReference => Object.assign(toDisposable(() => {
			disposed.push(model.sessionResource);
			if (shown === model) {
				widget.setModel(undefined);
			}
		}), { object: model });
		const widget = {
			get viewModel() { return shown && { model: shown, sessionResource: shown.sessionResource }; },
			getViewState: () => ({}),
			getInput: () => input,
			setInput: (value: string) => { input = value; },
			setModel: (model: IChatModel | undefined) => {
				shown = model;
				input = '';
				bindings.push(model?.sessionResource);
			},
			lockToCodingAgent: (_name: string, _displayName: string, sessionType: string) => { locks.push(sessionType); },
			unlockFromCodingAgent: () => { locks.push('local'); },
			visible: true,
		};
		modelRef.value = createReference(previousModel);
		const nextRef = createReference(nextModel);
		const pane: {
			showModel(token: CancellationToken, ref: IChatModelReference): Promise<IChatModel | undefined>;
			loadSession(resource: URI): Promise<IChatModel | undefined>;
			applyModel(): void;
			restoringSession: Promise<void> | undefined;
		} = Object.assign(Object.create(ChatViewPane.prototype), {
			_store: paneStore,
			modelRef,
			widgetViewStates: new Map(),
			viewState: {},
			_widget: widget,
			_openDiagnostics: store.add(new MutableDisposable()),
			loadSessionCts: store.add(new MutableDisposable()),
			_applyModelCts: store.add(new MutableDisposable()),
			logService: new NullLogService(),
			layoutService: { isRestored: () => false },
			notificationService: { error: () => { } },
			progressService: { withProgress: (_: unknown, task: () => Promise<unknown>) => task() },
			chatService: { acquireOrLoadSession: async () => nextRef },
			provisionalSessionService: { prepareSessionConfig: () => preparing },
			chatSessionsService: {
				canResolveChatSession: async () => { await resolving; return true; },
				getChatSessionContribution: () => ({ name: 'copilot', displayName: 'Copilot', agentHostProviderId: 'copilotcli' }),
			},
			agentSessionsService: { model: { getSession: () => undefined } },
			updateActions: () => { },
		});
		return { pane, paneStore, widget, modelRef, nextModel, nextRef, bindings, disposed, locks };
	}

	test('keeps the previous session bound until its replacement is ready', async () => {
		const resolving = new DeferredPromise<void>();
		const rig = createPane(resolving.p);
		const showing = rig.pane.showModel(CancellationToken.None, rig.nextRef);
		await timeout(0);
		const whileResolving = { shown: rig.widget.viewModel?.sessionResource, disposed: [...rig.disposed] };
		await resolving.complete();
		await showing;
		assert.deepStrictEqual({ whileResolving, bindings: rig.bindings, disposed: rig.disposed, shown: rig.widget.viewModel?.sessionResource }, {
			whileResolving: { shown: previousResource, disposed: [] },
			bindings: [nextResource],
			disposed: [previousResource],
			shown: nextResource,
		});
	});

	for (const stalledPhase of ['acquisition', 'configuration'] as const) {
		test(`explicit navigation supersedes initial ${stalledPhase} and releases the abandoned model`, async () => {
			const blocked = new DeferredPromise<void>();
			const rig = createPane(Promise.resolve(), blocked.p);
			const savedResource = nextResource.with({ path: '/saved' });
			const savedModel = upcastPartial<IChatModel>({ sessionResource: savedResource });
			const savedReference = Object.assign(toDisposable(() => { }), { object: savedModel });
			Object.assign(rig.pane, {
				acquireTransferredOrPersistedSession: async () => {
					if (stalledPhase === 'acquisition') {
						await blocked.p;
					}
					return { modelRef: rig.nextRef };
				},
				chatService: { acquireOrLoadSession: async () => savedReference },
			});
			rig.pane.applyModel();
			const restoration = rig.pane.restoringSession;
			await timeout(0);
			await rig.pane.loadSession(savedResource);
			const navigatedBeforeUnblocking = rig.widget.viewModel?.sessionResource;
			await blocked.complete();
			await restoration;
			assert.deepStrictEqual({ navigatedBeforeUnblocking, bindings: rig.bindings, disposed: [...rig.disposed].sort((a, b) => a.path.localeCompare(b.path)) }, {
				navigatedBeforeUnblocking: savedResource, bindings: [savedResource], disposed: [previousResource, nextResource],
			});
		});
	}

	test('cancelling a replacement releases its pending reference before provider activation completes', async () => {
		const resolving = new DeferredPromise<void>();
		const rig = createPane(resolving.p);
		const cts = store.add(new CancellationTokenSource());
		const showing = rig.pane.showModel(cts.token, rig.nextRef);
		await timeout(0);
		cts.cancel();
		const whileProviderPending = [...rig.disposed];
		const result = await showing;
		await resolving.complete();
		assert.deepStrictEqual({ whileProviderPending, result, bindings: rig.bindings, disposed: rig.disposed, shown: rig.widget.viewModel?.sessionResource, locks: rig.locks }, {
			whileProviderPending: [nextResource], result: undefined, bindings: [], disposed: [nextResource], shown: previousResource, locks: [],
		});
	});

	test('disposing the pane releases the incoming reference before provider activation completes', async () => {
		const resolving = new DeferredPromise<void>();
		const rig = createPane(resolving.p);
		const showing = rig.pane.showModel(CancellationToken.None, rig.nextRef);
		await timeout(0);
		rig.paneStore.dispose();
		const whileProviderPending = [...rig.disposed];
		const result = await showing;
		await resolving.complete();
		assert.deepStrictEqual({ whileProviderPending, result, bindings: rig.bindings, disposed: rig.disposed, locks: rig.locks }, {
			whileProviderPending: [previousResource, nextResource],
			result: undefined, bindings: [undefined], disposed: [previousResource, nextResource], locks: [],
		});
	});

	test('cancelling initial configuration preparation preserves the displayed session', async () => {
		const preparing = new DeferredPromise<void>();
		const rig = createPane(Promise.resolve(), preparing.p);
		const cts = store.add(new CancellationTokenSource());
		const showing = rig.pane.showModel(cts.token, rig.nextRef);
		await timeout(0);
		const whilePreparing = rig.widget.viewModel?.sessionResource;
		cts.cancel();
		const result = await showing;
		await preparing.complete();
		assert.deepStrictEqual({ whilePreparing, result, bindings: rig.bindings, disposed: rig.disposed, locks: rig.locks }, {
			whilePreparing: previousResource, result: undefined, bindings: [], disposed: [nextResource], locks: [],
		});
	});

	test('preserves input typed while the new chat configuration is being prepared', async () => {
		const preparing = new DeferredPromise<void>();
		const rig = createPane(Promise.resolve(), preparing.p);
		const showing = rig.pane.showModel(CancellationToken.None, rig.nextRef);
		await timeout(0);
		rig.widget.setInput('New draft typed while loading');
		await preparing.complete();
		await showing;
		assert.deepStrictEqual({ input: rig.widget.getInput(), bindings: rig.bindings }, {
			input: 'New draft typed while loading', bindings: [nextResource],
		});
	});

	for (const untitled of [true, false]) {
		test(`${untitled ? 'new chats stay bound' : 'saved chats still clear'} while a slow load is pending`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const rig = createPane();
			const acquiring = new DeferredPromise<IChatModelReference>();
			Object.assign(rig.pane, { chatService: { acquireOrLoadSession: () => acquiring.p } });
			const loading = rig.pane.loadSession(untitled ? nextResource : nextResource.with({ path: '/saved' }));
			await timeout(150);
			const whileLoading = rig.widget.viewModel?.sessionResource;
			await acquiring.complete(rig.nextRef);
			await loading;
			assert.deepStrictEqual({ whileLoading, bindings: rig.bindings, disposed: rig.disposed }, {
				whileLoading: untitled ? previousResource : undefined,
				bindings: untitled ? [nextResource] : [undefined, nextResource],
				disposed: [previousResource],
			});
		}));
	}
});

suite('ChatViewPane managed permission rules', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [policyKey, policyValue, required] of [
		['permissions.deny', '["Shell"]', true],
		['permissions.deny', '[]', false],
		['permissions.ask', '["Shell"]', false],
		['permissions.allow', '[]', false],
		['permissions.disableBypassPermissionsMode', 'disable', false],
		['permissions.defaultMode', 'manual', false],
		['sandbox.enabled', true, true],
		[COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, false, true],
	] as const) {
		for (const result of ['missing', 'error'] as const) {
			test(`${policyKey}=${policyValue} waits for policy and ${required ? 'prohibits' : 'preserves'} Local with ${result} Copilot`, async () => {
				const ready = new DeferredPromise<void>();
				let rules: string | boolean | undefined = undefined;
				const selected: string[] = [];
				const errors: string[] = [];
				const localModel = { object: upcastPartial<IChatModel>({}), dispose: () => { } };
				let localStarts = 0;
				const pane: { acquireDefaultNewSession(token: CancellationToken): Promise<{ modelRef?: IChatModelReference }> } = Object.assign(Object.create(ChatViewPane.prototype), {
					accountPolicyGateService: { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: () => ready.p },
					managedSettingsService: new class extends NullManagedSettingsService {
						override getManagedSettingValue(key: string) { return key === policyKey ? rules : undefined; }
						override getManagedSettings() { return rules === undefined ? {} : { [policyKey]: rules }; }
					}(),
					configurationService: new TestConfigurationService(),
					workspaceContextService: new TestContextService(),
					storageService: store.add(new TestStorageService()),
					chatSessionsService: new MockChatSessionsService(),
					agentHostEnablementService: { enabled: constObservable(false), managedSandboxEnforced: constObservable(false) },
					logService: new NullLogService(),
					notificationService: { error: (message: string) => errors.push(message) },
					chatService: {
						startNewLocalSession: () => { localStarts++; return localModel; },
						acquireOrLoadSession: async (resource: URI): Promise<IChatModelReference | undefined> => {
							selected.push(getChatSessionType(resource));
							if (result === 'error') {
								throw new Error('host unavailable');
							}
							return undefined;
						},
					},
				});
				const pending = pane.acquireDefaultNewSession(CancellationToken.None);
				const before = [...selected];
				rules = policyValue;
				ready.complete();
				if (required) {
					await assert.rejects(pending);
				} else {
					assert.strictEqual((await pending).modelRef, localModel);
				}
				assert.deepStrictEqual({ before, selected, localStarts, explained: errors.some(error => error.includes('organization requires the new Copilot experience')) }, {
					before: [], selected: required ? [SessionType.AgentHostCopilot] : [], localStarts: required ? 0 : 1, explained: required,
				});
			});
		}
	}
});

suite('ChatViewPane chat open diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('vscode-chat-session://local/abc');
	const other = URI.parse('vscode-chat-session://local/other');

	function createPane(options: { shown?: URI; restored?: boolean; acquired?: URI | undefined; fail?: boolean; acquiring?: Promise<void> }) {
		const events: string[] = [];
		const pane: { loadSession(resource: URI): Promise<IChatModel | undefined>; loadSessionCts: { value: CancellationTokenSource | undefined } } = Object.assign(Object.create(ChatViewPane.prototype), {
			_openDiagnostics: store.add(new MutableDisposable()),
			logService: new NullLogService(),
			chatOpenDiagnosticsService: store.add(new ChatOpenDiagnosticsService(new class extends NullLogService {
				override info(message: string): void { events.push(message); }
			}())),
			layoutService: { isRestored: () => options.restored ?? true },
			notificationService: { error: () => { } },
			progressService: { withProgress: (_: unknown, task: () => Promise<unknown>) => task() },
			loadSessionCts: { value: undefined, },
			_applyModelCts: { value: undefined },
			element: { ownerDocument: { hidden: false } },
			_widget: { viewModel: options.shown ? { sessionResource: options.shown } : undefined, visible: true, getInput: () => '' },
			chatService: {
				acquireOrLoadSession: async () => {
					await options.acquiring;
					if (options.fail) {
						throw new Error('boom');
					}
					return options.acquired ? { object: { sessionResource: options.acquired }, dispose: () => { } } : undefined;
				},
			},
			showModel: async (_token: CancellationToken, modelRef: { object: IChatModel } | undefined) => modelRef?.object,
		});
		return { pane, events };
	}

	const summarize = (events: string[]) => events.map(summary => [summary.split(' ')[1], summary.split(' ')[2], summary.endsWith('alreadyShown=true')]);

	test('loading the requested chat completes the open', async () => {
		const { pane, events } = createPane({ acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'completed', false]]);
	});

	test('showing another chat in its place fails the open', async () => {
		const { pane, events } = createPane({ acquired: other });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', false]]);
	});

	test('an error loading the chat fails the open', async () => {
		const { pane, events } = createPane({ fail: true });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', false]]);
	});

	test('showing the chat again is reported as a re-show', async () => {
		const { pane, events } = createPane({ shown: chat, acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'completed', true]]);
	});

	test('a re-show that cannot load the requested chat is not logged as completed', async () => {
		const { pane, events } = createPane({ shown: chat, fail: true });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', true]]);
	});

	test('an open cancelled by a newer load, such as New Chat, is cancelled', async () => {
		const acquiring = new DeferredPromise<void>();
		const { pane, events } = createPane({ acquired: chat, acquiring: acquiring.p });
		const loading = pane.loadSession(chat);
		await timeout(0);
		pane.loadSessionCts.value?.cancel();
		acquiring.complete();
		await loading;
		assert.deepStrictEqual(summarize(events), [['panel', 'cancelled', false]]);
	});

	test('opens during restore are not measured', async () => {
		const { pane, events } = createPane({ restored: false, acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), []);
	});
});

suite('ChatViewPane restored chat with a harness disabled by policy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function restore(sessionResource: URI, hasRequests: boolean, claudeDisabled: boolean) {
		const configurationService = new TestConfigurationService();
		const inspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			const value = inspect<T>(key);
			return claudeDisabled && key === AgentHostClaudeAgentEnabledSettingId ? { ...value, policyValue: false as T } : value;
		};
		let disposed = false;
		const pane: { acquireTransferredOrPersistedSession(token: CancellationToken, debugOwner: string): Promise<{ modelRef?: IChatModelReference }> } = Object.assign(Object.create(ChatViewPane.prototype), {
			viewState: { sessionResource },
			managedSettingsService: new NullManagedSettingsService(),
			configurationService,
			workspaceContextService: new TestContextService(),
			storageService: store.add(new TestStorageService()),
			chatSessionsService: new MockChatSessionsService(),
			agentHostEnablementService: { enabled: constObservable(true), managedSandboxEnforced: constObservable(false) },
			chatService: {
				transferredSessionResource: undefined,
				acquireOrLoadSession: async (resource: URI): Promise<IChatModelReference> => ({ object: upcastPartial<IChatModel>({ sessionResource: resource, hasRequests }), dispose: () => { disposed = true; } }),
			},
		});
		const { modelRef } = await pane.acquireTransferredOrPersistedSession(CancellationToken.None, 'test');
		return { restored: !!modelRef, disposed };
	}

	test('skips only an empty draft of the disabled harness', async () => {
		const draft = URI.from({ scheme: SessionType.AgentHostClaude, path: '/untitled-abc' });
		const saved = URI.from({ scheme: SessionType.AgentHostClaude, path: '/abc' });
		assert.deepStrictEqual({
			emptyDraft: await restore(draft, false, true),
			draftWithRequests: await restore(draft, true, true),
			savedChat: await restore(saved, false, true),
			allowedDraft: await restore(draft, false, false),
		}, {
			emptyDraft: { restored: false, disposed: true },
			draftWithRequests: { restored: true, disposed: false },
			savedChat: { restored: true, disposed: false },
			allowedDraft: { restored: true, disposed: false },
		});
	});
});
