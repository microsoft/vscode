/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { PolicyCategory } from '../../../../../../../base/common/policy.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IRequestContext } from '../../../../../../../base/parts/request/common/request.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationService } from '../../../../../../../platform/configuration/common/configurationService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { SyncDescriptor } from '../../../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, IFileManagedSettingsService, INativeManagedSettingsService, NullFileManagedSettingsService, NullNativeManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { ManagedSettingsFreshnessState } from '../../../../../../../platform/policy/common/managedSettingsFreshness.js';
import { IPolicyService } from '../../../../../../../platform/policy/common/policy.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { IRequestService } from '../../../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { DefaultAccountProvider, DefaultAccountService } from '../../../../../../services/accounts/browser/defaultAccount.js';
import { IAuthenticationExtensionsService, IAuthenticationService } from '../../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../../../services/host/browser/host.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, AccountPolicyService, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../../../../../services/policies/common/accountPolicyService.js';
import { TestProductService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatInputPart, IChatModeChangeEvent } from '../../../../browser/widget/input/chatInputPart.js';
import { ChatMode, IChatMode, IChatModes } from '../../../../common/chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { IChatModelInputState, IInputModel } from '../../../../common/model/chatModel.js';

class TestPolicyConfigurationService extends ConfigurationService {
	constructor(
		settingsResource: URI,
		@IFileService fileService: IFileService,
		@IPolicyService policyService: IPolicyService,
		@ILogService logService: ILogService,
	) {
		super(settingsResource, fileService, policyService, logService);
	}
}

suite('ChatInputPart mode validation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const refreshGate: IAccountPolicyGateInfo = {
		state: AccountPolicyGateState.Restricted,
		reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
	};
	const inactiveGate: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
	const customMode = upcastPartial<IChatMode>({
		id: 'test-custom-agent',
		kind: ChatModeKind.Agent,
		isBuiltin: false,
	});

	function createInput(initialMode: IChatMode = ChatMode.Agent, initialGate = inactiveGate, agentEnabled = true, services?: { configurationService: ConfigurationService; gateService: IAccountPolicyGateService }) {
		const inputStore = store.add(new DisposableStore());
		const modeChanges = store.add(new Emitter<void>());
		const gateChanges = store.add(new Emitter<IAccountPolicyGateInfo>());
		const testConfigurationService = new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: agentEnabled });
		store.add(testConfigurationService.onDidChangeConfigurationEmitter);
		const configurationService = services?.configurationService ?? testConfigurationService;
		let gateInfo = initialGate;
		let availableModes = [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit, customMode];
		const modes: IChatModes = {
			onDidChange: modeChanges.event,
			get builtin() { return availableModes.filter(mode => mode.isBuiltin); },
			get custom() { return availableModes.filter(mode => !mode.isBuiltin); },
			findModeById: id => availableModes.find(mode => mode.id === id),
			findModeByName: name => availableModes.find(mode => mode.name?.get() === name),
			waitForPendingUpdates: async () => { },
		};
		const accountPolicyGateService = services?.gateService ?? {
			_serviceBrand: undefined,
			get gateInfo() { return gateInfo; },
			onDidChangeGateInfo: gateChanges.event,
			async whenInitialized(): Promise<void> { },
		};
		const currentMode = observableValue<IChatMode>('currentMode', initialMode);
		const persistedState = observableValue<IChatModelInputState>('persistedState', {
			inputText: '',
			attachments: [],
			mode: { id: initialMode.id, kind: initialMode.kind },
			selectedModel: undefined,
			selections: [],
			contrib: {},
		});
		const persistedModes: string[] = [];
		const inputModel = upcastPartial<IInputModel>({
			state: persistedState,
			setState: state => {
				persistedState.set({ ...persistedState.get(), ...state }, undefined);
				persistedModes.push(persistedState.get().mode.id);
			},
		});
		const input: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_store: inputStore,
			options: { supportsChangingModes: true },
			accountPolicyGateService,
			configurationService,
			agentService: { get hasToolsAgent() { return configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled); } },
			_currentModeObservable: currentMode,
			_currentLanguageModel: observableValue('currentLanguageModel', undefined),
			_currentChatModesObservable: observableValue('currentChatModes', modes),
			_onDidChangeCurrentChatMode: store.add(new Emitter<IChatModeChangeEvent>()),
			_inputModel: inputModel,
			_chatSessionIsEmpty: true,
			_emptyInputState: observableValue<IChatModelInputState | undefined>('emptyInputState', undefined),
			logService: new NullLogService(),
			getCurrentInputState: () => ({
				...persistedState.get(),
				mode: { id: currentMode.get().id, kind: currentMode.get().kind },
			}),
		});
		const registerValidation = Reflect.get(ChatInputPart.prototype, 'registerChatModeValidation') as (this: ChatInputPart) => void;
		registerValidation.call(input);
		store.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
				modeChanges.fire();
			}
		}));

		return {
			input,
			persistedModes,
			snapshot: () => ({
				currentMode: currentMode.get().id,
				persistedMode: persistedState.get().mode.id,
				agentEnabled: configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled),
			}),
			setGate: (info: IAccountPolicyGateInfo) => {
				gateInfo = info;
				gateChanges.fire(info);
			},
			setAgentEnabled: async (enabled: boolean) => {
				await testConfigurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, enabled);
				modeChanges.fire();
			},
			setAvailableModes: (available: IChatMode[]) => {
				availableModes = available;
				modeChanges.fire();
			},
		};
	}

	for (const mode of [ChatMode.Agent, customMode]) {
		test(`preserves ${mode.id} through refresh, draft writes and recovery`, async () => {
			const harness = createInput(mode);
			harness.setGate(refreshGate);
			await harness.setAgentEnabled(false);
			harness.setAvailableModes([ChatMode.Ask, ChatMode.Edit]);
			harness.input.validateAgentMode();
			harness.input.flushInputStateToModel();
			const blocked = harness.snapshot();
			harness.setAvailableModes([ChatMode.Agent, ChatMode.Ask, ChatMode.Edit, customMode]);
			await harness.setAgentEnabled(true);
			harness.setGate(inactiveGate);

			assert.deepStrictEqual({ blocked, recovered: harness.snapshot(), writes: harness.persistedModes }, {
				blocked: { currentMode: mode.id, persistedMode: mode.id, agentEnabled: false },
				recovered: { currentMode: mode.id, persistedMode: mode.id, agentEnabled: true },
				writes: [mode.id],
			});
		});
	}

	test('preserves Agent when constructed while the refresh gate is already active', () => {
		const harness = createInput(ChatMode.Agent, refreshGate, false);
		harness.input.validateAgentMode();
		harness.input.flushInputStateToModel();

		assert.deepStrictEqual(harness.snapshot(), { currentMode: 'agent', persistedMode: 'agent', agentEnabled: false });
	});

	test('applies a resolved Agent-disabled policy even when enablement stays false', async () => {
		const harness = createInput();
		harness.setGate(refreshGate);
		await harness.setAgentEnabled(false);
		harness.setGate(inactiveGate);

		assert.deepStrictEqual({ ...harness.snapshot(), writes: harness.persistedModes }, {
			currentMode: 'ask', persistedMode: 'ask', agentEnabled: false, writes: ['ask'],
		});
	});

	test('continues to fall back to Ask when Agent is disabled outside the refresh gate', async () => {
		const harness = createInput();
		await harness.setAgentEnabled(false);

		assert.deepStrictEqual(harness.snapshot(), { currentMode: 'ask', persistedMode: 'ask', agentEnabled: false });
	});

	test('continues to validate other account restrictions', async () => {
		const harness = createInput();
		harness.setGate({ state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved });
		await harness.setAgentEnabled(false);

		assert.deepStrictEqual(harness.snapshot(), { currentMode: 'ask', persistedMode: 'ask', agentEnabled: false });
	});

	test('does not change an existing Ask selection when the gate clears', async () => {
		const harness = createInput(ChatMode.Ask);
		harness.setGate(refreshGate);
		await harness.setAgentEnabled(false);
		await harness.setAgentEnabled(true);
		harness.setGate(inactiveGate);

		assert.deepStrictEqual({ ...harness.snapshot(), writes: harness.persistedModes }, {
			currentMode: 'ask', persistedMode: 'ask', agentEnabled: true, writes: [],
		});
	});

	async function createAccountRefresh() {
		const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const configurationNode: IConfigurationNode = {
			id: 'chatInputModeValidation',
			properties: {
				[ChatConfiguration.AgentEnabled]: {
					type: 'boolean',
					default: true,
					policy: {
						name: 'ChatAgentMode',
						category: PolicyCategory.InteractiveSession,
						minimumVersion: '1.99',
						localization: { description: { key: '', value: '' } },
						value: (policyData: { chat_agent_enabled?: boolean }) => policyData.chat_agent_enabled === false ? false : undefined,
					},
				},
			},
		};
		if (!registry.getConfigurationProperties()[ChatConfiguration.AgentEnabled]) {
			registry.registerConfiguration(configurationNode);
			store.add(toDisposable(() => registry.deregisterConfigurations([configurationNode])));
		}

		const instantiationService = store.add(new TestInstantiationService());
		const logService = new NullLogService();
		const started = new DeferredPromise<void>();
		const delayedResponse = new DeferredPromise<IRequestContext>();
		const settings = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true };
		let delaySettings = false;
		let disableAgent = false;
		let settingsRequests = 0;
		const jsonResponse = (body: object): IRequestContext => ({
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
		});
		instantiationService.stub(IRequestService, {
			request: async options => {
				switch (options.callSite) {
					case 'defaultAccount.entitlements':
						return jsonResponse({ chat_enabled: true });
					case 'defaultAccount.tokenEntitlements':
						return jsonResponse({ token: `agent_mode=${disableAgent ? '0' : '1'};sn=test:signature` });
					case 'defaultAccount.managedSettings':
						settingsRequests++;
						if (delaySettings) {
							started.complete();
							return delayedResponse.p;
						}
						return jsonResponse(settings);
					default:
						throw new Error(`Unexpected request: ${options.callSite}`);
				}
			},
		});
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAuthenticationService, {
			declaredProviders: [],
			isAuthenticationProviderRegistered: () => true,
			getAccounts: async () => [],
			getSessions: async () => [{ id: 'test-session', accessToken: 'test-token', account: { id: 'test-account', label: 'Test' }, scopes: ['user:email'] }],
			onDidChangeDeclaredProviders: Event.None,
			onDidChangeSessions: Event.None,
			onDidRegisterAuthenticationProvider: Event.None,
			onDidUnregisterAuthenticationProvider: Event.None,
		});
		instantiationService.stub(IAuthenticationExtensionsService, { getAccountPreference: () => undefined, onDidChangeAccountPreference: Event.None });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, {});
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IHostService, { hasFocus: true, onDidChangeFocus: Event.None });
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(INativeManagedSettingsService, new NullNativeManagedSettingsService());
		instantiationService.stub(IFileManagedSettingsService, new NullFileManagedSettingsService());
		const provider = store.add(instantiationService.createInstance(DefaultAccountProvider, {
			preferredExtensions: [],
			authenticationProvider: {
				default: { id: 'github', name: 'GitHub' },
				enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
				enterpriseProviderConfig: 'github.copilot.advanced.authProvider',
				scopes: [['user:email']],
			},
			entitlementUrl: 'https://api.example.test/copilot_internal/user',
			tokenEntitlementUrl: 'https://api.example.test/copilot_internal/v2/token',
			mcpRegistryDataUrl: '',
			managedSettingsUrl: 'https://api.example.test/copilot_internal/managed_settings',
		}));
		await provider.refresh();
		const accountService = store.add(instantiationService.createInstance(DefaultAccountService));
		accountService.setDefaultAccountProvider(provider);
		instantiationService.stub(IDefaultAccountService, accountService);
		const gateService = store.add(instantiationService.createInstance<AccountPolicyService>(new SyncDescriptor<AccountPolicyService>(AccountPolicyService)));
		instantiationService.stub(IPolicyService, gateService);
		const fileService = store.add(instantiationService.createInstance(FileService));
		instantiationService.stub(IFileService, fileService);
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const configurationService = store.add(instantiationService.createInstance(TestPolicyConfigurationService, URI.file('/test/settings.json')));
		await configurationService.initialize();

		return {
			provider,
			configurationService,
			gateService,
			get settingsRequests() { return settingsRequests; },
			beginRefresh: (withAgentDisabled = false, hourly = false) => {
				delaySettings = true;
				disableAgent = withAgentDisabled;
				if (hourly) {
					const clock = useFakeTimers({ now: Date.now(), toFake: ['Date'] });
					store.add(toDisposable(() => clock.restore()));
					clock.setSystemTime(Date.now() + 60 * 60 * 1000 + 1);
					return provider.refresh();
				}
				return provider.refresh({ forceRefresh: true });
			},
			whenSettingsRequested: started.p,
			finishRefresh: () => delayedResponse.complete(jsonResponse(settings)),
		};
	}

	for (const { name, disableAgent, hourly } of [
		{ name: 'forced refresh', disableAgent: false, hourly: false },
		{ name: 'hourly cache expiry', disableAgent: false, hourly: true },
		{ name: 'resolved Agent-disabled policy', disableAgent: true, hourly: false },
	]) {
		test(`forceRemoteSettingsRefresh preserves selection until the response resolves (${name})`, async () => {
			const refresh = await createAccountRefresh();
			const harness = createInput(ChatMode.Agent, inactiveGate, true, refresh);
			const initial = harness.snapshot();
			const restricted = Event.toPromise(Event.filter(refresh.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.AgentEnabled)));
			const pending = refresh.beginRefresh(disableAgent, hourly);
			await refresh.whenSettingsRequested;
			await restricted;
			harness.input.validateAgentMode();
			harness.input.flushInputStateToModel();
			const blocked = { ...harness.snapshot(), freshness: refresh.provider.managedSettingsFreshness.state, gate: refresh.gateService.gateInfo.state };
			const settled = Event.toPromise(Event.filter(refresh.gateService.onDidChangeGateInfo, info => info.state === AccountPolicyGateState.Inactive));
			const disabled = disableAgent ? Event.toPromise(Event.filter(refresh.configurationService.onDidChangeConfiguration, e =>
				e.affectsConfiguration(ChatConfiguration.AgentEnabled)
				&& refresh.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled) === false
				&& refresh.gateService.gateInfo.state === AccountPolicyGateState.Inactive
			)) : undefined;
			refresh.finishRefresh();
			await pending;
			await settled;
			await disabled;

			assert.deepStrictEqual({
				initial,
				blocked,
				recovered: harness.snapshot(),
				freshness: refresh.provider.managedSettingsFreshness.state,
				forceRemoteSettingsRefresh: refresh.provider.policyData?.managedSettings?.[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY],
				settingsRequests: refresh.settingsRequests,
				writes: harness.persistedModes,
			}, {
				initial: { currentMode: 'agent', persistedMode: 'agent', agentEnabled: true },
				blocked: { currentMode: 'agent', persistedMode: 'agent', agentEnabled: false, freshness: ManagedSettingsFreshnessState.Pending, gate: AccountPolicyGateState.Restricted },
				recovered: { currentMode: disableAgent ? 'ask' : 'agent', persistedMode: disableAgent ? 'ask' : 'agent', agentEnabled: !disableAgent },
				freshness: ManagedSettingsFreshnessState.Satisfied,
				forceRemoteSettingsRefresh: true,
				settingsRequests: 2,
				writes: disableAgent ? ['agent', 'ask'] : ['agent'],
			});
		});
	}
});
