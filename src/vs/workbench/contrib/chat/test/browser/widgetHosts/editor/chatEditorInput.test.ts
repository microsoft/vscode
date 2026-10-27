/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, IManagedSettingsService, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { AccountPolicyGateState, IAccountPolicyGateService } from '../../../../../../services/policies/common/accountPolicyService.js';
import { DisposableStore, IReference, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, mockObject, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfirmResult, IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { isResourceEditorInput } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../../../services/editor/common/editorGroupsService.js';
import { clearChatEditor } from '../../../../browser/actions/chatClear.js';
import { ChatEditorInput, ChatEditorInputSerializer, ChatEditorModel } from '../../../../browser/widgetHosts/editor/chatEditorInput.js';
import { ChatEditor, IChatEditorOptions } from '../../../../browser/widgetHosts/editor/chatEditor.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IChatModelReference, IChatService, IChatSessionStartOptions } from '../../../../common/chatService/chatService.js';
import { ChatOpenDiagnosticsService, IChatOpenDiagnosticsService } from '../../../../common/chatOpenDiagnosticsService.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, SessionTypeSelectionReason } from '../../../../common/constants.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../../common/editing/chatEditingService.js';
import { IChatModel, IInputModel } from '../../../../common/model/chatModel.js';
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from '../../../../common/model/chatUri.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';

suite('ChatEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const settledPolicyGate: IAccountPolicyGateService = {
		_serviceBrand: undefined, gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: async () => { },
	};

	function loadingState(container: HTMLElement) {
		const overlay = container.getElementsByClassName('chat-loading-overlay')[0];
		return {
			busy: container.getAttribute('aria-busy'),
			status: overlay ? { role: overlay.getAttribute('role'), live: overlay.getAttribute('aria-live'), message: overlay.textContent } : null,
		};
	}

	for (const cancel of [undefined, 'navigation', 'policy'] as const) {
		test(`policy recovery retains the editor transcript while another reference exists (cancel=${cancel})`, async () => {
			const resource = URI.parse('agent-host-claude:/retained');
			const disposed = disposables.add(new Emitter<{ sessionResources: readonly URI[]; reason: 'disposed' }>());
			const bound: Array<IChatModel | undefined> = [];
			let references = 2;
			let resolutions = 0;
			let restoredDraft: string | undefined;
			const configurationService = new class extends TestConfigurationService {
				blocked = false;
				override inspect<T>(key: string) {
					const value = super.inspect<T>(key);
					return { ...value, policyValue: this.blocked ? value.value : undefined };
				}
			}({ 'chat.agentHost.claudeAgent.enabled': false });
			const oldModel = upcastPartial<IChatModel>({ sessionResource: resource, inputModel: upcastPartial<IInputModel>({ intendedModel: undefined }) });
			const freshModel = upcastPartial<IChatModel>({ sessionResource: resource, inputModel: upcastPartial<IInputModel>({ state: constObservable(undefined), setState: state => { restoredDraft = state?.inputText; } }) });
			const input = Object.assign(Object.create(ChatEditorInput.prototype), {
				releaseModel: () => { references--; },
				updateModel: () => { references++; },
				resolve: async () => { resolutions++; return disposables.add(new ChatEditorModel(freshModel)); },
			});
			const pending = disposables.add(new MutableDisposable<DisposableStore>());
			const container = document.createElement('div');
			const editor = Object.assign(Object.create(ChatEditor.prototype), {
				_input: input,
				_editorContainer: container,
				configurationService,
				_providerReload: pending,
				chatService: { onDidDisposeSession: disposed.event },
				_widget: {
					viewModel: { model: oldModel },
					getViewState: () => ({}),
					getInputState: () => ({ inputText: 'Preserved draft' }),
					setModel: (model: IChatModel | undefined) => bound.push(model),
					restoreViewState: () => { },
				},
			}) as { _reloadChatAfterPolicy(resource: URI): Promise<void> };
			const reloading = editor._reloadChatAfterPolicy(resource);
			await timeout(0);
			const waiting = { references, resolutions, changes: bound.length, loading: loadingState(container) };
			if (cancel === 'navigation') {
				pending.clear();
			} else if (cancel === 'policy') {
				configurationService.blocked = true;
				await editor._reloadChatAfterPolicy(resource);
			}
			references--;
			if (references === 0) {
				disposed.fire({ sessionResources: [resource], reason: 'disposed' });
			}
			await reloading;
			assert.deepStrictEqual({ waiting, resolutions, fresh: bound.at(-1) === freshModel, listening: disposed.hasListeners(), references, restoredDraft, loading: loadingState(container) }, {
				waiting: { references: 1, resolutions: 0, changes: 0, loading: { busy: null, status: null } }, resolutions: cancel ? 0 : 1, fresh: !cancel, listening: false, references: cancel === 'policy' ? 1 : 0, restoredDraft: cancel ? undefined : 'Preserved draft', loading: { busy: null, status: null },
			});
		});
	}

	for (const outcome of ['success', 'navigation', 'policy'] as const) {
		test(`policy recovery owns its loading overlay until ${outcome}`, async () => {
			const resource = URI.parse('agent-host-claude:/deferred-policy');
			const nextResource = outcome === 'navigation' ? URI.parse('agent-host-codex:/next-session') : resource;
			const changed = disposables.add(new Emitter<{ added: string[]; removed: string[] }>());
			const disposed = disposables.add(new Emitter<{ sessionResources: readonly URI[]; reason: 'disposed' }>());
			const started = new DeferredPromise<void>();
			const delayed = new DeferredPromise<IChatModelReference>();
			const nextStarted = new DeferredPromise<void>();
			const nextDelayed = new DeferredPromise<IChatModelReference>();
			const configurationService = new class extends TestConfigurationService {
				blocked = false;
				override inspect<T>(key: string) {
					const value = super.inspect<T>(key);
					return { ...value, policyValue: this.blocked ? value.value : undefined };
				}
			}({ 'chat.agentHost.claudeAgent.enabled': false });
			let restoredDraft: string | undefined;
			const inputModel = upcastPartial<IInputModel>({ state: constObservable(undefined), intendedModel: undefined, setState: state => { restoredDraft = state?.inputText; } });
			const oldModel = upcastPartial<IChatModel>({ sessionResource: resource, inputModel, title: 'Original', onDidChange: Event.None });
			const freshModel = upcastPartial<IChatModel>({ sessionResource: resource, inputModel, title: 'Restored', hasCustomTitle: true, onDidChange: Event.None });
			const nextModel = upcastPartial<IChatModel>({ sessionResource: nextResource, inputModel, title: 'Replacement', hasCustomTitle: true, onDidChange: Event.None });
			const widgetState: { viewModel: { sessionResource: URI; model: IChatModel } | undefined } = { viewModel: { sessionResource: resource, model: oldModel } };
			const bound: IChatModel[] = [];
			const tokens: CancellationToken[] = [];
			let lateDisposed = false;
			const chatService = upcastPartial<IChatService>({
				onDidDisposeSession: disposed.event,
				getSession: () => widgetState.viewModel?.model,
				acquireExistingSession: () => ({ object: oldModel, dispose: () => { widgetState.viewModel = undefined; disposed.fire({ sessionResources: [resource], reason: 'disposed' }); } }),
				acquireOrLoadSession: async (_resource, _location, token) => {
					tokens.push(token);
					if (tokens.length === 1) { started.complete(); return delayed.p; }
					nextStarted.complete();
					return nextDelayed.p;
				},
			});
			const sessions = Object.assign(new MockChatSessionsService(), { onDidChangeContentProviderSchemes: changed.event });
			const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IChatService, chatService);
			instantiationService.stub(IChatSessionsService, sessions);
			instantiationService.stub(IChatOpenDiagnosticsService, disposables.add(new ChatOpenDiagnosticsService(new NullLogService())));
			const createInput = (sessionResource: URI) => disposables.add(new ChatEditorInput(sessionResource, {}, chatService,
				upcastPartial<IDialogService>({}), configurationService, sessions, instantiationService, disposables.add(new TestStorageService()), new NullLogService(), new TestContextService(),
				{ _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
				upcastPartial<IAgentHostConnectionsService>({}), NullTelemetryService, upcastPartial<IProgressService>({}), new NullManagedSettingsService(), settledPolicyGate));
			const input = createInput(resource);
			input.updateModel(oldModel);
			const editor = disposables.add(instantiationService.createInstance(ChatEditor, upcastPartial<IEditorGroup>({ id: 1 })));
			const container = document.createElement('div');
			Object.assign(editor, {
				_input: input, _editorContainer: container, _widget: {
					get viewModel() { return widgetState.viewModel; },
					getViewState: () => ({}), getInputState: () => ({ inputText: 'Preserved deferred draft' }),
					getInput: () => '', unlockFromCodingAgent: () => { },
					setModel: (model: IChatModel | undefined) => { if (model) { bound.push(model); } widgetState.viewModel = model ? { sessionResource: model.sessionResource, model } : undefined; },
					restoreViewState: () => { },
				}
			});
			changed.fire({ removed: [resource.scheme], added: [] });
			changed.fire({ removed: [], added: [resource.scheme] });
			await started.p;
			const loading = loadingState(container);
			let navigating: Promise<void> | undefined;
			let loadingAfterCancel: ReturnType<typeof loadingState> | undefined;
			if (outcome === 'navigation') {
				editor.clearInput();
				loadingAfterCancel = loadingState(container);
				navigating = editor.setInput(createInput(nextResource), undefined, {}, CancellationToken.None);
			} else if (outcome === 'policy') {
				configurationService.blocked = true;
				changed.fire({ removed: [resource.scheme], added: [] });
				changed.fire({ removed: [], added: [resource.scheme] });
				loadingAfterCancel = loadingState(container);
			}
			if (outcome !== 'success') {
				await nextStarted.p;
			}
			const cancelled = tokens[0].isCancellationRequested;
			await delayed.complete({ object: freshModel, dispose: () => { lateDisposed = true; } });
			await timeout(0);
			const afterFirstResult = { loading: loadingState(container), lateDisposed, bound: bound.map(model => model.title) };
			if (outcome !== 'success') {
				await nextDelayed.complete({ object: nextModel, dispose: () => { } });
				await navigating;
				await timeout(0);
			}
			const activeLoading = { busy: 'true', status: { role: 'status', live: 'polite', message: 'Loading...' } };
			const noLoading = { busy: null, status: null };
			assert.deepStrictEqual({ loading, loadingAfterCancel, afterFirstResult, cancelled, loadingAfterBind: loadingState(container), bound: bound.map(model => model.title), restoredDraft }, {
				loading: activeLoading,
				loadingAfterCancel: outcome === 'success' ? undefined : noLoading,
				afterFirstResult: { loading: outcome === 'success' ? noLoading : activeLoading, lateDisposed: outcome !== 'success', bound: outcome === 'success' ? ['Restored'] : [] },
				cancelled: outcome !== 'success', loadingAfterBind: noLoading, bound: [outcome === 'success' ? 'Restored' : 'Replacement'], restoredDraft: outcome === 'navigation' ? undefined : 'Preserved deferred draft',
			});
		});
	}

	for (const toCopilot of [true, false]) {
		test(`editor binds its agent from the resolved model before submission (toCopilot=${toCopilot})`, async () => {
			const destination = toCopilot
				? URI.from({ scheme: SessionType.AgentHostCopilot, path: '/redirected' })
				: LocalChatSessionUri.forSession('fallback');
			const model = upcastPartial<IChatModel>({ sessionResource: destination });
			const input = upcastPartial<ChatEditorInput>({
				getSessionType: () => toCopilot ? localChatSessionType : SessionType.AgentHostCopilot,
				resolve: async () => disposables.add(new ChatEditorModel(model)),
				sessionResource: destination,
			});
			const events: string[] = [];
			let lockedAgent: string | undefined = toCopilot ? undefined : SessionType.AgentHostCopilot;
			const widget = upcastPartial<ChatWidget>({
				getInput: () => '',
				lockToCodingAgent: (_name, _displayName, type) => { lockedAgent = type; events.push(`lock:${type}`); },
				unlockFromCodingAgent: () => { lockedAgent = undefined; events.push('unlock'); },
				setModel: () => { events.push(`bind:${lockedAgent ?? 'default'}`); },
			});
			const sessions = new MockChatSessionsService();
			sessions.setContributions([{
				type: SessionType.AgentHostCopilot, name: SessionType.AgentHostCopilot,
				displayName: 'Copilot', description: '', agentHostProviderId: 'copilotcli',
			}]);
			const editor: ChatEditor = Object.assign(Object.create(ChatEditor.prototype), {
				_widget: widget, chatSessionsService: sessions, loadEditorViewState: () => undefined, layoutService: { isRestored: () => false },
				_openDiagnostics: disposables.add(new MutableDisposable()),
			});
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			assert.deepStrictEqual(events, toCopilot
				? [`lock:${SessionType.AgentHostCopilot}`, `bind:${SessionType.AgentHostCopilot}`]
				: ['unlock', 'bind:default']);
		});
	}

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
		for (const unavailable of [false, true]) {
			test(`${policyKey}=${policyValue} settles before ${required ? 'prohibiting' : 'preserving'} explicit Local (unavailable=${unavailable})`, async () => {
				const ready = new DeferredPromise<void>();
				let rules: string | boolean | undefined = undefined;
				let localStarts = 0;
				const selected: string[] = [];
				const model = upcastPartial<IChatModel>({
					sessionResource: LocalChatSessionUri.forSession('local-policy'),
					hasRequests: false, onDidDispose: Event.None, onDidChange: Event.None,
				});
				const input = disposables.add(new ChatEditorInput(
					ChatEditorInput.getNewEditorUri(), { explicitSessionType: localChatSessionType },
					upcastPartial<IChatService>({
						startNewLocalSession: () => { localStarts++; return { object: model, dispose: () => { } }; },
						acquireOrLoadSession: async resource => {
							selected.push(getChatSessionType(resource));
							if (unavailable) { return undefined; }
							throw new Error('simulated unavailable provider');
						},
					}),
					upcastPartial<IDialogService>({}), new TestConfigurationService(), new MockChatSessionsService(),
					upcastPartial<IInstantiationService>({}), disposables.add(new TestStorageService()), new NullLogService(), new TestContextService(),
					{ _serviceBrand: undefined, enabled: constObservable(!unavailable), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
					upcastPartial<IAgentHostConnectionsService>({}), NullTelemetryService, upcastPartial<IProgressService>({}),
					new class extends NullManagedSettingsService {
						override getManagedSettingValue(key: string) { return key === policyKey ? rules : undefined; }
						override getManagedSettings() { return rules === undefined ? {} : { [policyKey]: rules }; }
					}(),
					{ ...settledPolicyGate, whenInitialized: () => ready.p },
				));
				const pending = input.resolve();
				const before = [...selected];
				rules = policyValue;
				ready.complete();
				if (required) {
					await assert.rejects(pending, /organization requires the new Copilot experience/);
				} else {
					assert.strictEqual((await pending)?.model, model);
				}
				assert.deepStrictEqual({ before, selected, localStarts }, { before: [], selected: required ? [SessionType.AgentHostCopilot] : [], localStarts: required ? 0 : 1 });
			});
		}
	}

	for (const route of ['explicit', 'default', 'missing', 'empty'] as const) {
		for (const abandon of ['cancel', 'dispose'] as const) {
			test(`does not resolve ${route} Local editor after ${abandon} during account policy initialization`, async () => {
				const entered = new DeferredPromise<void>();
				const ready = new DeferredPromise<void>();
				const cancellation = disposables.add(new CancellationTokenSource());
				const sessionResource = LocalChatSessionUri.forSession('local-policy-wait');
				const model = upcastPartial<IChatModel>({ sessionResource, hasRequests: false, onDidDispose: Event.None, onDidChange: Event.None });
				let localStarts = 0;
				const input = disposables.add(new ChatEditorInput(
					route === 'missing' || route === 'empty' ? sessionResource : ChatEditorInput.getNewEditorUri(),
					route === 'explicit' ? { explicitSessionType: localChatSessionType } : {},
					upcastPartial<IChatService>({
						acquireOrLoadSession: async () => route === 'empty' ? { object: model, dispose: () => { } } : undefined,
						startNewLocalSession: () => { localStarts++; return { object: model, dispose: () => { } }; },
					}),
					upcastPartial<IDialogService>({}), new TestConfigurationService(), new MockChatSessionsService(),
					upcastPartial<IInstantiationService>({}), disposables.add(new TestStorageService()), new NullLogService(), new TestContextService(),
					{ _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
					upcastPartial<IAgentHostConnectionsService>({}), NullTelemetryService, upcastPartial<IProgressService>({}),
					new NullManagedSettingsService(),
					{ ...settledPolicyGate, whenInitialized: () => { entered.complete(); return ready.p; } },
				));
				const pending = input.resolve(cancellation.token);
				await entered.p;
				if (abandon === 'cancel') {
					cancellation.cancel();
				} else {
					input.dispose();
				}
				ready.complete();
				const resolved = await pending;
				resolved?.dispose();
				assert.deepStrictEqual({ resolved: resolved !== null, localStarts }, { resolved: false, localStarts: 0 });
			});
		}
	}

	for (const sessionResource of [LocalChatSessionUri.forSession('existing-local'), URI.from({ scheme: SessionType.AgentHostCopilot, path: '/existing-copilot' })]) {
		test(`restores ${sessionResource.scheme} history without waiting for account policy`, async () => {
			const model = upcastPartial<IChatModel>({
				sessionResource, hasRequests: true, onDidDispose: Event.None, onDidChange: Event.None,
			});
			const input = disposables.add(new ChatEditorInput(
				sessionResource, {},
				upcastPartial<IChatService>({ acquireOrLoadSession: async () => ({ object: model, dispose: () => { } }) }),
				upcastPartial<IDialogService>({}), new TestConfigurationService(), new MockChatSessionsService(),
				upcastPartial<IInstantiationService>({}), disposables.add(new TestStorageService()), new NullLogService(), new TestContextService(),
				{ _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
				upcastPartial<IAgentHostConnectionsService>({}), NullTelemetryService, upcastPartial<IProgressService>({}),
				new NullManagedSettingsService(),
				{ ...settledPolicyGate, whenInitialized: () => { throw new Error('Restoring history must not wait for policy'); } },
			));
			assert.strictEqual((await input.resolve())?.model, model);
		});
	}

	for (const throws of [false, true]) {
		test(`reports migration restore resolution ${throws ? 'errors' : 'missing models'}`, async () => {
			const events: { name: string; data: unknown; error: boolean }[] = [];
			const telemetry = new class extends mock<ITelemetryService>() {
				override publicLog2<E, C>(name: string, data?: E): void {
					if (name === 'agentHost.legacyCopilotCliMigrationOpen') {
						events.push({ name, data, error: false });
					}
				}
				override publicLogError2<E, C>(name: string, data?: E): void {
					events.push({ name, data, error: true });
				}
			};
			const connection = new class extends mock<IAgentConnection>() {
				override getSubscription<T>(): IReference<IAgentSubscription<T>> {
					return { object: upcastPartial<IAgentSubscription<T>>({ value: {} as T }), dispose() { } };
				}
			};
			const input = disposables.add(new ChatEditorInput(
				URI.parse('copilotcli:/sess-abc'), {},
				upcastPartial<IChatService>({
					acquireOrLoadSession: async () => {
						if (throws) {
							throw new Error('load failed');
						}
						return undefined;
					},
				}),
				upcastPartial<IDialogService>({}),
				new TestConfigurationService({ [ChatConfiguration.MigrateLegacyCopilotCliSessions]: true }),
				upcastPartial<IChatSessionsService>({}),
				upcastPartial<IInstantiationService>({}),
				upcastPartial<IStorageService>({}),
				new NullLogService(),
				new TestContextService(),
				upcastPartial<IAgentHostEnablementService>({}),
				upcastPartial<IAgentHostConnectionsService>({ ambientConnection: connection }),
				telemetry,
				upcastPartial<IProgressService>({ withProgress: (_options, task) => task({ report() { } }) }),
				new NullManagedSettingsService(),
				settledPolicyGate,
			));
			assert.deepStrictEqual({ resolved: await input.resolve(), events }, {
				resolved: null,
				events: [{
					name: 'agentHost.legacyCopilotCliMigrationOpen', error: throws,
					data: {
						source: 'restore', surfaced: false,
						migrationSessionId: '6a27283bcdda2b8d8ca87884c1ae452dcded34fc',
						reason: throws ? 'resolveFailed' : 'sessionNotSurfaced',
						errorCode: undefined, errorMessage: throws ? 'load failed' : undefined,
					},
				}],
			});
		});
	}

	function createInputWithPendingEdits(willKeepAlive: boolean) {
		const sessionResource = LocalChatSessionUri.forSession('pending-edits');
		const model = upcastPartial<IChatModel>({
			sessionResource,
			onDidDispose: Event.None,
			onDidChange: Event.None,
			willKeepAlive,
			editingSession: upcastPartial<IChatEditingSession>({
				entries: constObservable([upcastPartial<IModifiedFileEntry>({
					state: constObservable(ModifiedFileEntryState.Modified),
				})]),
			}),
		});
		const prompt = mockObject<IDialogService>()().prompt.resolves({ result: false });
		const input = disposables.add(new ChatEditorInput(
			sessionResource, {},
			upcastPartial<IChatService>({ acquireExistingSession: () => ({ object: model, dispose() { } }) }),
			upcastPartial<IDialogService>({ prompt }),
			upcastPartial<IConfigurationService>({}),
			upcastPartial<IChatSessionsService>({}),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IStorageService>({}),
			new NullLogService(),
			new TestContextService(),
			upcastPartial<IAgentHostEnablementService>({}),
			upcastPartial<IAgentHostConnectionsService>({}),
			NullTelemetryService,
			upcastPartial<IProgressService>({}),
			new NullManagedSettingsService(),
			settledPolicyGate,
		));
		input.updateModel(model);
		return { input, prompt };
	}

	test('background-kept editing sessions do not require close confirmation', async () => {
		const { input, prompt } = createInputWithPendingEdits(true);
		assert.deepStrictEqual({
			showConfirm: input.showConfirm(),
			confirmation: await input.confirm([]),
			prompts: prompt.callCount,
		}, { showConfirm: false, confirmation: ConfirmResult.SAVE, prompts: 0 });
	});

	for (const closeResult of [true, false, 'error'] as const) {
		test(`move confirmation suppression is scoped when close returns ${closeResult}`, async () => {
			const { input, prompt } = createInputWithPendingEdits(false);
			const before = input.showConfirm();
			let during: { showConfirm: boolean; confirmation: ConfirmResult } | undefined;
			const error = new Error('Unable to close the editor');
			const group = upcastPartial<IEditorGroup>({
				async closeEditor() {
					during = { showConfirm: input.showConfirm(), confirmation: await input.confirm([]) };
					if (closeResult === 'error') {
						throw error;
					}
					return closeResult;
				},
			});

			let moved: boolean | undefined;
			if (closeResult === 'error') {
				await assert.rejects(input.closeForMove(group), error);
			} else {
				moved = await input.closeForMove(group);
			}

			assert.deepStrictEqual({
				before,
				during,
				after: input.showConfirm(),
				normalConfirmation: await input.confirm([]),
				prompts: prompt.callCount,
				moved,
			}, {
				before: true,
				during: { showConfirm: false, confirmation: ConfirmResult.SAVE },
				after: true,
				normalConfirmation: ConfirmResult.CANCEL,
				prompts: 1,
				moved: closeResult === 'error' ? undefined : closeResult,
			});
		});
	}

	test('explicit local session type starts local session for generic editor URI', async () => {
		const sessionResource = LocalChatSessionUri.forSession('explicit-local');
		const model = {
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource,
		} as Partial<IChatModel> as IChatModel;

		let startCall: { location: ChatAgentLocation; options: IChatSessionStartOptions | undefined } | undefined;
		let didTryDefaultLoad = false;
		const chatService = {
			startNewLocalSession(location: ChatAgentLocation, options?: IChatSessionStartOptions) {
				startCall = { location, options };
				return { object: model, dispose: () => { } };
			},
			async acquireOrLoadSession() {
				didTryDefaultLoad = true;
				return undefined;
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			ChatEditorInput.getNewEditorUri(),
			{ explicitSessionType: localChatSessionType },
			chatService,
			{} as IDialogService,
			new TestConfigurationService(),
			{} as IChatSessionsService,
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
			{ ambientConnection: undefined } as unknown as IAgentHostConnectionsService,
			NullTelemetryService,
			{ withProgress: (_options: unknown, task: (progress: unknown) => unknown) => task({ report() { } }) } as unknown as IProgressService,
			new NullManagedSettingsService(),
			settledPolicyGate,
		);

		try {
			const resolved = await input.resolve();

			assert.deepStrictEqual({
				model: resolved?.model,
				sessionResource: input.sessionResource,
				startLocation: startCall?.location,
				debugOwner: startCall?.options?.debugOwner,
				selectionReason: startCall?.options?.sessionTypeSelectionReason,
				didTryDefaultLoad,
			}, {
				model,
				sessionResource,
				startLocation: ChatAgentLocation.Chat,
				debugOwner: 'ChatEditorInput#resolveExplicitLocal',
				selectionReason: 'explicitOverride',
				didTryDefaultLoad: false,
			});
		} finally {
			input.dispose();
		}
	});

	test('resolved local creation metadata reaches the model and is not serialized', async () => {
		const sessionResource = LocalChatSessionUri.forSession('resolved-local');
		const model = {
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource,
		} as Partial<IChatModel> as IChatModel;

		let acquiredReason: SessionTypeSelectionReason | undefined;
		let startedReason: SessionTypeSelectionReason | undefined;
		const chatService = {
			async acquireOrLoadSession(_resource: URI, _location: ChatAgentLocation, _token: CancellationToken, _debugOwner?: string, sessionTypeSelectionReason?: SessionTypeSelectionReason) {
				acquiredReason = sessionTypeSelectionReason;
				return undefined;
			},
			startNewLocalSession(_location: ChatAgentLocation, options?: IChatSessionStartOptions) {
				startedReason = options?.sessionTypeSelectionReason;
				return { object: model, dispose: () => { } };
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			sessionResource,
			{ sessionTypeSelectionReason: 'currentSession' },
			chatService,
			{} as IDialogService,
			{} as IConfigurationService,
			{} as IChatSessionsService,
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
			{ ambientConnection: undefined } as unknown as IAgentHostConnectionsService,
			NullTelemetryService,
			{ withProgress: (_options: unknown, task: (progress: unknown) => unknown) => task({ report() { } }) } as unknown as IProgressService,
			new NullManagedSettingsService(),
			settledPolicyGate,
		);

		try {
			const resolved = await input.resolve();
			const serialized = new ChatEditorInputSerializer().serialize(input);
			assert.ok(serialized);
			const serializedOptions = (JSON.parse(serialized) as { options: IChatEditorOptions }).options;

			assert.deepStrictEqual({
				model: resolved?.model,
				acquiredReason,
				startedReason,
				serializedOptions,
			}, {
				model,
				acquiredReason: 'currentSession',
				startedReason: 'currentSession',
				serializedOptions: {},
			});
		} finally {
			input.dispose();
		}
	});

	test('resolved remote creation metadata reaches model acquisition', async () => {
		const sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-resolved' });
		const model = {
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource,
		} as Partial<IChatModel> as IChatModel;

		let acquiredReason: SessionTypeSelectionReason | undefined;
		const chatService = {
			async acquireOrLoadSession(_resource: URI, _location: ChatAgentLocation, _token: CancellationToken, _debugOwner?: string, sessionTypeSelectionReason?: SessionTypeSelectionReason) {
				acquiredReason = sessionTypeSelectionReason;
				return { object: model, dispose: () => { } };
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			sessionResource,
			{ sessionTypeSelectionReason: 'copilotPreference' },
			chatService,
			{} as IDialogService,
			{} as IConfigurationService,
			new MockChatSessionsService(),
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
			{ ambientConnection: undefined } as unknown as IAgentHostConnectionsService,
			NullTelemetryService,
			{ withProgress: (_options: unknown, task: (progress: unknown) => unknown) => task({ report() { } }) } as unknown as IProgressService,
			new NullManagedSettingsService(),
			settledPolicyGate,
		);

		try {
			const resolved = await input.resolve();

			assert.deepStrictEqual({ model: resolved?.model, acquiredReason }, { model, acquiredReason: 'copilotPreference' });
		} finally {
			input.dispose();
		}
	});

	test('unavailable Agent Host session falls back to Local with its selection reason', async () => {
		const unavailableResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-unavailable' });
		const localResource = LocalChatSessionUri.forSession('agent-host-unavailable-fallback');
		const model = {
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource: localResource,
		} as Partial<IChatModel> as IChatModel;

		let startCall: { location: ChatAgentLocation; options: IChatSessionStartOptions | undefined } | undefined;
		const chatService = {
			async acquireOrLoadSession() {
				return undefined;
			},
			startNewLocalSession(location: ChatAgentLocation, options?: IChatSessionStartOptions) {
				startCall = { location, options };
				return { object: model, dispose: () => { } };
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			unavailableResource,
			{ sessionTypeSelectionReason: 'explicitOverride' },
			chatService,
			{} as IDialogService,
			new TestConfigurationService(),
			new MockChatSessionsService(),
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
			{ ambientConnection: undefined } as unknown as IAgentHostConnectionsService,
			NullTelemetryService,
			{ withProgress: (_options: unknown, task: (progress: unknown) => unknown) => task({ report() { } }) } as unknown as IProgressService,
			new NullManagedSettingsService(),
			settledPolicyGate,
		);

		try {
			const resolved = await input.resolve();

			assert.deepStrictEqual({
				model: resolved?.model,
				sessionResource: input.sessionResource,
				startLocation: startCall?.location,
				debugOwner: startCall?.options?.debugOwner,
				selectionReason: startCall?.options?.sessionTypeSelectionReason,
			}, {
				model,
				sessionResource: localResource,
				startLocation: ChatAgentLocation.Chat,
				debugOwner: 'ChatEditorInput#resolveUntitledFallback',
				selectionReason: 'agentHostUnavailable',
			});
		} finally {
			input.dispose();
		}
	});

	test('explicit local session type preserves empty local session resource', async () => {
		const sessionResource = LocalChatSessionUri.forSession('explicit-empty-local');
		const model = {
			hasRequests: false,
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource,
		} as Partial<IChatModel> as IChatModel;

		const loadedResources: string[] = [];
		const chatService = {
			async acquireOrLoadSession(resource: URI) {
				loadedResources.push(resource.toString());
				return { object: model, dispose: () => { } };
			},
			startNewLocalSession() {
				throw new Error('Should not create a new local session when the local session resource resolves');
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			sessionResource,
			{ explicitSessionType: localChatSessionType },
			chatService,
			{} as IDialogService,
			new TestConfigurationService(),
			{} as IChatSessionsService,
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) },
			{ ambientConnection: undefined } as unknown as IAgentHostConnectionsService,
			NullTelemetryService,
			{ withProgress: (_options: unknown, task: (progress: unknown) => unknown) => task({ report() { } }) } as unknown as IProgressService,
			new NullManagedSettingsService(),
			settledPolicyGate,
		);

		try {
			const resolved = await input.resolve();

			assert.deepStrictEqual({
				model: resolved?.model,
				sessionResource: input.sessionResource,
				loadedResources,
			}, {
				model,
				sessionResource,
				loadedResources: [sessionResource.toString()],
			});
		} finally {
			input.dispose();
		}
	});

	test('new chat replaces a current extension host Copilot CLI harness', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(IManagedSettingsService, new NullManagedSettingsService());
		instantiationService.set(IAccountPolicyGateService, settledPolicyGate);
		const configurationService = new TestConfigurationService();
		const chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([{
			type: SessionType.CopilotCLI,
			name: 'Copilot CLI',
			displayName: 'Copilot CLI',
			description: 'Copilot CLI',
		}]);
		const storageService = store.add(new TestStorageService());
		const workspaceContextService = new TestContextService();
		const agentHostEnablementService = { _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) } satisfies IAgentHostEnablementService;

		instantiationService.stub(IChatService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(IChatSessionsService, chatSessionsService);
		instantiationService.set(IStorageService, storageService);
		instantiationService.set(ILogService, new NullLogService());
		instantiationService.set(IWorkspaceContextService, workspaceContextService);
		instantiationService.set(IAgentHostEnablementService, agentHostEnablementService);

		const input = store.add(instantiationService.createInstance(
			ChatEditorInput,
			URI.from({ scheme: SessionType.CopilotCLI, path: '/session' }),
			{},
		));
		let replacementResource: URI | undefined;
		let replacementSelectionReason: string | undefined;
		instantiationService.stub(IEditorService, {
			findEditors: () => [{ editor: input, groupId: 1 }],
			replaceEditors: async replacements => {
				const replacement = replacements[0].replacement;
				if (isResourceEditorInput(replacement)) {
					replacementResource = replacement.resource;
					replacementSelectionReason = (replacement.options as IChatEditorOptions | undefined)?.sessionTypeSelectionReason;
				}
			},
		});

		try {
			await instantiationService.invokeFunction(clearChatEditor, input);

			assert.deepStrictEqual({
				currentSessionType: input.sessionResource ? getChatSessionType(input.sessionResource) : undefined,
				replacementSessionType: replacementResource ? getChatSessionType(replacementResource) : undefined,
				replacementSelectionReason,
			}, {
				currentSessionType: SessionType.CopilotCLI,
				replacementSessionType: localChatSessionType,
				replacementSelectionReason: 'computedDefault',
			});
		} finally {
			store.dispose();
		}
	});

	function createInputForCopy(store: DisposableStore, resource: URI, agentHostEnabled: boolean): ChatEditorInput {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(IManagedSettingsService, new NullManagedSettingsService());
		instantiationService.set(IAccountPolicyGateService, settledPolicyGate);
		instantiationService.stub(IChatService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.set(IConfigurationService, new TestConfigurationService());
		instantiationService.set(IChatSessionsService, new MockChatSessionsService());
		instantiationService.set(IStorageService, store.add(new TestStorageService()));
		instantiationService.set(ILogService, new NullLogService());
		instantiationService.set(IWorkspaceContextService, new TestContextService());
		instantiationService.set(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(agentHostEnabled), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) });
		return store.add(instantiationService.createInstance(ChatEditorInput, resource, {}));
	}

	test('copy preserves an agent host session type as a new untitled session', () => {
		const store = disposables.add(new DisposableStore());
		const source = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-source' });
		const input = createInputForCopy(store, source, true);

		const copied = store.add(input.copy() as ChatEditorInput);

		assert.deepStrictEqual({
			copiedType: getChatSessionType(copied.resource),
			copiedUntitled: isUntitledChatSession(copied.resource),
			distinctFromSource: !isEqual(copied.resource, source),
			sourceUnchanged: isEqual(input.resource, source),
			selectionReason: copied.options.sessionTypeSelectionReason,
		}, {
			copiedType: SessionType.AgentHostCopilot,
			copiedUntitled: true,
			distinctFromSource: true,
			sourceUnchanged: true,
			selectionReason: 'currentSession',
		});
	});

	test('copy preserves a local session type as a new local session', () => {
		const store = disposables.add(new DisposableStore());
		const source = LocalChatSessionUri.getNewSessionUri();
		const input = createInputForCopy(store, source, true);

		const copied = store.add(input.copy() as ChatEditorInput);

		assert.deepStrictEqual({
			copiedType: getChatSessionType(copied.resource),
			copiedScheme: copied.resource.scheme,
			distinctFromSource: !isEqual(copied.resource, source),
		}, {
			copiedType: localChatSessionType,
			copiedScheme: LocalChatSessionUri.scheme,
			distinctFromSource: true,
		});
	});

	test('copy falls back to a generic editor URI when the source type cannot start a new session', () => {
		const store = disposables.add(new DisposableStore());
		const source = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-source' });
		const input = createInputForCopy(store, source, false);

		const copied = store.add(input.copy() as ChatEditorInput);

		assert.deepStrictEqual({
			copiedScheme: copied.resource.scheme,
			copiedSessionResource: copied.sessionResource,
			copiedType: getChatSessionType(copied.resource),
		}, {
			copiedScheme: Schemas.vscodeChatEditor,
			copiedSessionResource: undefined,
			copiedType: localChatSessionType,
		});
	});
});

suite('ChatEditor chat open diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('vscode-chat-session://local/abc');

	function createEditor(summaries: string[], options: { restored?: boolean; groupId?: number }): ChatEditor {
		const widget = { getInput: () => '', visible: true, unlockFromCodingAgent: () => { }, setModel: () => { }, restoreViewState: () => { } };
		return Object.assign(Object.create(ChatEditor.prototype), {
			_openDiagnostics: store.add(new MutableDisposable()),
			_widget: widget,
			chatOpenDiagnosticsService: store.add(new ChatOpenDiagnosticsService(new class extends NullLogService {
				override info(message: string): void { summaries.push(message); }
			}())),
			group: { id: options.groupId ?? 1 },
			layoutService: { isRestored: () => options.restored ?? true },
			chatSessionsService: new MockChatSessionsService(), loadEditorViewState: () => undefined,
		});
	}

	function createInput(options: { resolved?: boolean; fail?: boolean; resource?: URI; resolving?: Promise<void> }): ChatEditorInput {
		const resource = options.resource ?? chat;
		return {
			sessionResource: resource,
			hasResolvedModel: options.resolved ?? false,
			getSessionType: () => localChatSessionType,
			resolve: async () => {
				await options.resolving;
				if (options.fail) {
					throw new Error('boom');
				}
				return { model: { sessionResource: resource, inputModel: {} } };
			},
		} as unknown as ChatEditorInput;
	}

	async function open(options: { restored?: boolean; resolved?: boolean; cancelled?: boolean; fail?: boolean; resource?: URI }): Promise<string[][]> {
		const summaries: string[] = [];
		const editor = createEditor(summaries, options);
		const cts = store.add(new CancellationTokenSource());
		if (options.cancelled) {
			cts.cancel();
		}
		if (options.fail) {
			await assert.rejects(editor.setInput(createInput(options), undefined, {}, cts.token), /boom/);
		} else {
			await editor.setInput(createInput(options), undefined, {}, cts.token);
		}
		return summaries.map(summary => {
			const parts = summary.split(' ');
			return [parts[1], parts[2], String(summary.endsWith('alreadyShown=true'))];
		});
	}

	test('host cancellation ends an old load while other editors load independently', async () => {
		const summaries: string[] = [];
		const other = URI.parse('vscode-chat-session://local/other');
		const third = URI.parse('vscode-chat-session://local/third');
		const resolving = new DeferredPromise<void>();
		const cts = store.add(new CancellationTokenSource());
		const first = createEditor(summaries, { groupId: 1 }).setInput(createInput({ resolving: resolving.p }), undefined, {}, cts.token);
		const cancelled = assert.rejects(first);
		await timeout(0);
		cts.cancel();
		await createEditor(summaries, { groupId: 1 }).setInput(createInput({ resource: other }), undefined, {}, CancellationToken.None);
		await createEditor(summaries, { groupId: 2 }).setInput(createInput({ resource: third }), undefined, {}, CancellationToken.None);
		resolving.complete();
		await cancelled;

		assert.deepStrictEqual(summaries.map(summary => [summary.split(' ')[2], summary.endsWith('alreadyShown=true')]), [['cancelled', false], ['completed', false], ['completed', false]]);
	});

	test('binding the chat completes the open', async () => {
		assert.deepStrictEqual(await open({}), [['editor', 'completed', 'false']]);
	});

	test('showing a chat with a resolved model is reported as a re-show', async () => {
		assert.deepStrictEqual(await open({ resolved: true }), [['editor', 'completed', 'true']]);
	});

	test('a failure to resolve the chat fails the open', async () => {
		assert.deepStrictEqual(await open({ fail: true }), [['editor', 'failed', 'false']]);
	});

	test('a re-show whose resolution fails is not logged as completed', async () => {
		assert.deepStrictEqual(await open({ fail: true, resolved: true }), [['editor', 'failed', 'true']]);
	});

	test('a cancelled open is reported as cancelled, also for a re-show', async () => {
		assert.deepStrictEqual([await open({ cancelled: true }), await open({ cancelled: true, resolved: true })], [[['editor', 'cancelled', 'false']], [['editor', 'cancelled', 'true']]]);
	});

	test('restored editors and untitled chats are not measured', async () => {
		assert.deepStrictEqual([await open({ restored: false }), await open({ resource: URI.parse('vscode-chat-session://local/untitled-1') })], [[], []]);
	});
});
