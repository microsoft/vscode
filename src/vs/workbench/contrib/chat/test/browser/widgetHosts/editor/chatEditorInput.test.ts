/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { IManagedSettingsService, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { AccountPolicyGateState, IAccountPolicyGateService } from '../../../../../../services/policies/common/accountPolicyService.js';
import { DisposableStore, IReference } from '../../../../../../../base/common/lifecycle.js';
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
import { IChatService, IChatSessionStartOptions } from '../../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, SessionTypeSelectionReason } from '../../../../common/constants.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../../common/editing/chatEditingService.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from '../../../../common/model/chatUri.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';

suite('ChatEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const settledPolicyGate: IAccountPolicyGateService = {
		_serviceBrand: undefined, gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: async () => { },
	};

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
				_widget: widget, chatSessionsService: sessions, loadEditorViewState: () => undefined,
			});
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			assert.deepStrictEqual(events, toCopilot
				? [`lock:${SessionType.AgentHostCopilot}`, `bind:${SessionType.AgentHostCopilot}`]
				: ['unlock', 'bind:default']);
		});
	}

	for (const policyKey of ['permissions.allow', 'sandbox.enabled']) {
		for (const unavailable of [false, true]) {
			test(`${policyKey} settles before routing explicit Local and never fall back (unavailable=${unavailable})`, async () => {
				const ready = new DeferredPromise<void>();
				let rules: string | boolean | undefined = undefined;
				let localStarts = 0;
				const selected: string[] = [];
				const input = disposables.add(new ChatEditorInput(
					ChatEditorInput.getNewEditorUri(), { explicitSessionType: localChatSessionType },
					upcastPartial<IChatService>({
						startNewLocalSession: () => { localStarts++; throw new Error('Local must not start'); },
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
					new class extends NullManagedSettingsService { override getManagedSettingValue(key: string) { return key === policyKey ? rules : undefined; } }(),
					{ ...settledPolicyGate, whenInitialized: () => ready.p },
				));
				const pending = input.resolve();
				const before = [...selected];
				rules = policyKey === 'sandbox.enabled' ? true : '["Read"]';
				ready.complete();
				await assert.rejects(pending, /organization requires the new Copilot experience/);
				assert.deepStrictEqual({ before, selected, localStarts }, { before: [], selected: [SessionType.AgentHostCopilot], localStarts: 0 });
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
