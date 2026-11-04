/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IManagedSettingsService, NullManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { AccountPolicyGateState, IAccountPolicyGateService } from '../../../../services/policies/common/accountPolicyService.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { QuickChat } from '../../browser/widgetHosts/chatQuick.js';
import { IChatModelReference, IChatService, IChatSessionStartOptions } from '../../common/chatService/chatService.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { storeUserSelectedSessionType } from '../../common/chatSessionTypePreference.js';
import { ChatConfiguration, ChatModeKind, SessionTypeSelectionReason } from '../../common/constants.js';
import { IChatModel, IChatModelInputState, IInputModel } from '../../common/model/chatModel.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { getChatSessionType, getNewChatSessionResource } from '../../common/model/chatUri.js';

suite('Quick Chat session routing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createQuickChat(settings: Record<string, boolean> = {}, managedSettings = new NullManagedSettingsService()) {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
			...settings,
		});
		const storage = store.add(new TestStorageService());
		const stateUpdates: Partial<IChatModelInputState>[] = [];
		const boundModels: IChatModel[] = [];
		const localCalls: (IChatSessionStartOptions | undefined)[] = [];
		const acquired: { type: string; reason: SessionTypeSelectionReason | undefined }[] = [];
		let disposed = false;
		let inputState: Partial<IChatModelInputState> = { inputText: 'draft', selections: [] };
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = getNewChatSessionResource(SessionType.AgentHostCopilot);
			override readonly inputModel = new class extends mock<IInputModel>() {
				override setState(state: Partial<IChatModelInputState>): void {
					stateUpdates.push(state);
				}
			}();
		}();
		const reference = Object.assign(store.add(toDisposable(() => disposed = true)), { object: model });
		let acquire: () => Promise<IChatModelReference | undefined> = async () => reference;
		let acquisitionToken: CancellationToken | undefined;
		instantiationService.stub(IChatService, {
			startNewLocalSession: (_location, options) => {
				localCalls.push(options);
				return reference;
			},
			acquireOrLoadSession: async (resource, _location, token, _owner, reason) => {
				acquired.push({ type: getChatSessionType(resource), reason });
				acquisitionToken = token;
				return acquire();
			},
		});
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatSessionsService, { getChatSessionContribution: () => undefined, getAllChatSessionContributions: () => [] });
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IAgentHostEnablementService, { enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
		instantiationService.stub(IManagedSettingsService, managedSettings);
		instantiationService.stub(IAccountPolicyGateService, { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: async () => { } });
		instantiationService.stub(IContextKeyService, {});
		instantiationService.stub(IWorkbenchLayoutService, {});
		instantiationService.stub(IChatWidgetService, {});
		instantiationService.stub(IChatEntitlementService, {});
		instantiationService.stub(IMarkdownRendererService, {});
		const chat = store.add(instantiationService.createInstance(QuickChat));
		Object.assign(chat, {
			widget: {
				getInputState: () => inputState,
				setModel: (value: IChatModel) => boundModels.push(value),
				inputEditor: { setValue: (inputText: string) => inputState = { ...inputState, inputText } },
				attachmentModel: { clear: () => inputState = { ...inputState, attachments: [] } },
				setVisible: () => { },
				layoutDynamicChatTreeItemMode: () => { },
			},
		});
		const updateModel = Reflect.get(chat, 'updateModel') as (this: QuickChat, currentSessionType?: string) => Promise<void>;
		const clear = Reflect.get(chat, 'clear') as (this: QuickChat) => Promise<void>;
		const modelHost = {
			updateModel: (currentSessionType?: string) => updateModel.call(chat, currentSessionType),
			clear: () => clear.call(chat),
		};
		return {
			chat, modelHost, acquired, localCalls, stateUpdates, boundModels, storage, reference,
			setAcquisition: (value: typeof acquire) => acquire = value,
			setInputState: (value: Partial<IChatModelInputState>) => inputState = value,
			isDisposed: () => disposed,
			getAcquisitionToken: () => acquisitionToken,
		};
	}

	test('acquires the default harness while preserving the compact Ask draft', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.modelHost.updateModel();
		await started.p;
		const draft = { inputText: 'typed while starting', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }], selections: [] };
		fixture.setInputState({
			...draft,
			selectedModel: { identifier: 'local-model', metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'local-model' }) },
			modelConfiguration: { reasoningEffort: 'low' },
		});
		await acquisition.complete(fixture.reference);
		await ready;
		assert.deepStrictEqual({
			acquired: fixture.acquired,
			localCalls: fixture.localCalls,
			state: fixture.stateUpdates,
			bound: fixture.boundModels.length,
		}, {
			acquired: [{ type: SessionType.AgentHostCopilot, reason: 'computedDefault' }],
			localCalls: [],
			state: [{ ...draft, mode: { id: 'ask', kind: ChatModeKind.Ask } }],
			bound: 1,
		});
	});

	test('show reuses initialization while the initial session is still loading', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.chat.whenReady();
		await started.p;
		fixture.chat.show();
		const sameInitialization = ready === fixture.chat.whenReady();
		await acquisition.complete(fixture.reference);
		await ready;
		assert.deepStrictEqual({ sameInitialization, acquired: fixture.acquired.length, bound: fixture.boundModels.length }, {
			sameInitialization: true, acquired: 1, bound: 1,
		});
	});

	test('preserves current and remembered Claude and Codex choices', async () => {
		const results = [];
		for (const type of [SessionType.AgentHostClaude, SessionType.AgentHostCodex]) {
			for (const remembered of [false, true]) {
				const fixture = createQuickChat();
				if (remembered) {
					storeUserSelectedSessionType(fixture.storage, type);
				}
				await fixture.modelHost.updateModel(remembered ? undefined : type);
				results.push(fixture.acquired);
			}
		}
		assert.deepStrictEqual(results, [SessionType.AgentHostClaude, SessionType.AgentHostCodex].flatMap(type => [
			[{ type, reason: 'currentSession' }],
			[{ type, reason: 'rememberedSelection' }],
		]));
	});

	test('clearing does not erase input typed while the replacement session starts', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.modelHost.clear();
		await started.p;
		const draft = { inputText: 'new draft', selections: [] };
		fixture.setInputState(draft);
		await acquisition.complete(fixture.reference);
		await ready;
		assert.deepStrictEqual(fixture.stateUpdates, [{ ...draft, mode: { id: 'ask', kind: ChatModeKind.Ask } }]);
	});

	test('respects a user opt-out without changing the Ask mode', async () => {
		const fixture = createQuickChat({ [ChatConfiguration.EditorPreferCopilotHarness]: false });
		storeUserSelectedSessionType(fixture.storage, SessionType.Local);
		await fixture.modelHost.updateModel();
		assert.deepStrictEqual({
			acquired: fixture.acquired,
			local: fixture.localCalls.map(options => ({ keepAlive: options?.disableBackgroundKeepAlive, reason: options?.sessionTypeSelectionReason })),
			mode: fixture.stateUpdates[0].mode,
		}, {
			acquired: [],
			local: [{ keepAlive: true, reason: 'rememberedSelection' }],
			mode: { id: 'ask', kind: ChatModeKind.Ask },
		});
	});

	test('managed restrictions override a remembered Local opt-out', async () => {
		const fixture = createQuickChat({ [ChatConfiguration.EditorPreferCopilotHarness]: false }, new class extends NullManagedSettingsService {
			override getManagedSettings() { return { 'permissions.deny': '["Shell"]' }; }
			override getManagedSettingValue(key: string) { return key === 'permissions.deny' ? '["Shell"]' : undefined; }
		}());
		storeUserSelectedSessionType(fixture.storage, SessionType.Local);
		await fixture.modelHost.updateModel();
		assert.deepStrictEqual({ acquired: fixture.acquired, local: fixture.localCalls }, {
			acquired: [{ type: SessionType.AgentHostCopilot, reason: 'copilotPreference' }],
			local: [],
		});
	});

	test('failed non-local acquisition reports failure without creating Local', async () => {
		const fixture = createQuickChat();
		fixture.setAcquisition(async () => undefined);
		await assert.rejects(fixture.modelHost.updateModel(), /Could not start the selected chat session/);
		assert.deepStrictEqual({ local: fixture.localCalls, bound: fixture.boundModels }, { local: [], bound: [] });
	});

	test('disposal cancels acquisition and releases a late reference', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.modelHost.updateModel();
		await started.p;
		fixture.chat.dispose();
		await acquisition.complete(fixture.reference);
		await assert.rejects(ready, isCancellationError);
		assert.deepStrictEqual({
			cancelled: fixture.getAcquisitionToken()?.isCancellationRequested,
			disposed: fixture.isDisposed(),
			bound: fixture.boundModels,
		}, { cancelled: true, disposed: true, bound: [] });
	});
});
