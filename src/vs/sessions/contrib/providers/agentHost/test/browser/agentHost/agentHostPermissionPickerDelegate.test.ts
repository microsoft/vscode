/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IActionListDelegate, IActionListItem, IActionListItemInlineToggle } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentHostPermissionPickerActionItem } from '../../../browser/agentHostPermissionPickerActionItem.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { type IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ResolveSessionConfigResult, SessionConfigPropertySchema } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { getAgentHostCopilotSandboxSettingId, IAgentConnection, IAgentHostNetworkDiagnosticsInfo } from '../../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostCustomTerminalToolEnabledSettingId } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { RootConfigState } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../../workbench/contrib/chat/common/constants.js';
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownModeSchema, isWellKnownModeValue } from '../../../browser/agentHostPermissionPickerDelegate.js';
import { getPermissionLevelMeta } from '../../../../copilotChatSessions/browser/permissionPicker.js';
import { IAgentHostSessionsProvider } from '../../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../../services/sessions/browser/sessionsService.js';
import { IChatPhoneInputPresenter } from '../../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';

const PROVIDER_ID = 'local-agent-host';
const SESSION_ID = 'local-agent-host:s1';

function makeWellKnownConfig(value: string | undefined, levels: readonly string[] = ['default', 'assisted', 'autoApprove']): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.SandboxEnabled]: {
					title: 'Sandbox',
					type: 'string',
					enum: ['default', 'on', 'off'],
					sessionMutable: true,
				},
				autoApprove: {
					title: 'Auto Approve',
					description: '',
					type: 'string',
					enum: [...levels],
					sessionMutable: true,
				},
			},
		},
		values: value === undefined ? {} : { autoApprove: value },
	} as ResolveSessionConfigResult;
}

class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'onDidChangeRootConfig' | 'getSessionConfig' | 'getRootConfig' | 'setSessionConfigValue' | 'trackSessionConfigOperation' | 'isSessionConfigResolving'> {
	readonly id: string = PROVIDER_ID;
	private readonly _onDidChange = new Emitter<string>();
	readonly onDidChangeSessionConfig: Event<string> = this._onDidChange.event;
	private readonly _onDidChangeRoot = new Emitter<void>();
	readonly onDidChangeRootConfig = this._onDidChangeRoot.event;

	config: ResolveSessionConfigResult | undefined;
	readonly sessionConfigs = new Map<string, ResolveSessionConfigResult>();
	rootConfig: RootConfigState | undefined;
	readonly setCalls: Array<[string, string, string]> = [];
	readonly trackedOperations: Array<[string, Promise<void>]> = [];
	readonly resolving = observableValue<boolean>('resolving', false);

	getSessionConfig(sessionId: string): ResolveSessionConfigResult | undefined {
		return this.sessionConfigs.get(sessionId) ?? this.config;
	}
	getRootConfig(): RootConfigState | undefined {
		return this.rootConfig;
	}
	isSessionConfigResolving(_sessionId: string) {
		return this.resolving;
	}
	async setSessionConfigValue(sessionId: string, property: string, value: string): Promise<void> {
		this.setCalls.push([sessionId, property, value]);
		const config = this.sessionConfigs.get(sessionId);
		if (config) {
			config.values[property] = value;
			this.fireChange(sessionId);
		}
	}
	trackSessionConfigOperation(sessionId: string, operation: Promise<void>): void {
		this.trackedOperations.push([sessionId, operation]);
	}
	fireChange(sessionId: string = SESSION_ID): void {
		this._onDidChange.fire(sessionId);
	}
	fireRootChange(): void {
		this._onDidChangeRoot.fire();
	}
	dispose(): void {
		this._onDidChange.dispose();
		this._onDidChangeRoot.dispose();
	}
}

interface ITestRig {
	readonly instantiationService: TestInstantiationService;
	readonly delegate: AgentHostPermissionPickerDelegate;
	readonly provider: FakeProvider;
	readonly activeSessionObs: ReturnType<typeof observableValue<IActiveSession | undefined>>;
	readonly setAssistedPermissionsEnabled: (enabled: boolean) => void;
	readonly setCustomTerminalToolEnabled: (enabled: boolean) => void;
	readonly setManagedSandboxEnforced: (enforced: boolean) => void;
	readonly setConnection: (connection: IAgentConnection | undefined) => void;
	readonly fireConnectionChange: () => void;
	readonly diagnosticsRequests: () => number;
	readonly logErrors: readonly (string | Error)[];
}

function setup(store: Pick<DisposableStore, 'add'>, activeSession: IActiveSession | undefined, configValue?: string, getHostInfo: () => Promise<IAgentHostNetworkDiagnosticsInfo> = async () => ({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] })): ITestRig {
	const provider = new FakeProvider();
	store.add({ dispose: () => provider.dispose() });
	if (configValue !== undefined) {
		provider.config = makeWellKnownConfig(configValue);
	}
	const onDidChangeProviders = store.add(new Emitter<ISessionsProvidersChangeEvent>());
	const sessionsProvidersService = new (class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = onDidChangeProviders.event;
		override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
		override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
			return id === provider.id ? (provider as unknown as T) : undefined;
		}
	})();
	const activeSessionObs = observableValue<IActiveSession | undefined>('activeSession', activeSession);
	const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
	let assistedPermissionsEnabled = true;
	let customTerminalToolEnabled = false;
	const configurationService = new class extends mock<IConfigurationService>() {
		override readonly onDidChangeConfiguration = Event.None;
		override getValue<T>(): T;
		override getValue<T>(section: string): T;
		override getValue<T>(overrides: IConfigurationOverrides): T;
		override getValue<T>(section: string, overrides: IConfigurationOverrides): T;
		override getValue<T>(section?: string | IConfigurationOverrides): T {
			return (section === ChatConfiguration.AssistedPermissionsEnabled
				? assistedPermissionsEnabled
				: section === AgentHostCustomTerminalToolEnabledSettingId
					? customTerminalToolEnabled
					: undefined) as T;
		}
	}();
	const sessionsManagementService = new (class extends mock<ISessionsService>() {
		override readonly activeSession = activeSessionObs;
	})();

	const insta = store.add(new TestInstantiationService());
	const connectionsChanged = store.add(new Emitter<void>());
	let diagnosticsRequests = 0;
	let connection: IAgentConnection | undefined = new class extends mock<IAgentConnection>() {
		override getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
			diagnosticsRequests++;
			return getHostInfo();
		}
	}();
	insta.stub(IAgentHostConnectionsService, {
		onDidChangeSessionResolution: connectionsChanged.event,
		resolveSessionResource: resource => connection ? { connection, connectionAuthority: 'local', backendSession: resource } : undefined,
	});
	const logErrors: (string | Error)[] = [];
	insta.stub(ILogService, { error: message => logErrors.push(message) });
	insta.set(ISessionsService, sessionsManagementService);
	insta.set(ISessionsProvidersService, sessionsProvidersService);
	insta.set(IConfigurationService, configurationService);
	insta.stub(IChatPhoneInputPresenter, { enabled: constObservable(false) });
	insta.set(IAgentHostEnablementService, {
		_serviceBrand: undefined,
		enabled: constObservable(true),
		managedSandboxEnforced,
		managedSandboxAllowsBypass: constObservable(false),
	});

	const delegate = store.add(insta.createInstance(AgentHostPermissionPickerDelegate, activeSessionObs));
	return {
		instantiationService: insta,
		delegate,
		provider,
		activeSessionObs,
		setAssistedPermissionsEnabled: enabled => assistedPermissionsEnabled = enabled,
		setCustomTerminalToolEnabled: enabled => customTerminalToolEnabled = enabled,
		setManagedSandboxEnforced: enforced => managedSandboxEnforced.set(enforced, undefined),
		setConnection: value => {
			connection = value;
			connectionsChanged.fire();
		},
		fireConnectionChange: () => connectionsChanged.fire(),
		diagnosticsRequests: () => diagnosticsRequests,
		logErrors,
	};
}

function makeActiveSession(sessionType = 'copilotcli'): IActiveSession {
	return { providerId: PROVIDER_ID, sessionId: SESSION_ID, sessionType, resource: URI.from({ scheme: `agent-host-${sessionType}`, path: '/s1' }) } as IActiveSession;
}

suite('AgentHostPermissionPickerDelegate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const os of ['linux', 'win32']) {
		test(`selects the ${os} host sandbox setting without assuming the UI OS`, async () => {
			const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
			const { delegate, diagnosticsRequests } = setup(store, makeActiveSession(), 'default', () => pending.p);
			const before = { setting: delegate.getSandboxToggleSettingId(), resolving: delegate.isResolving.get() };
			await pending.complete({ version: '1', os, arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
			await timeout(0);
			assert.deepStrictEqual({
				before,
				setting: delegate.getSandboxToggleSettingId(),
				requests: diagnosticsRequests(),
			}, {
				before: { setting: undefined, resolving: false },
				setting: getAgentHostCopilotSandboxSettingId(os === 'win32'),
				requests: 1,
			});
		});
	}

	test('reuses the host OS lookup for sessions sharing a connection', async () => {
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const { delegate, activeSessionObs, diagnosticsRequests, instantiationService } = setup(store, makeActiveSession(), 'default', () => pending.p);
		const secondDelegate = store.add(instantiationService.createInstance(AgentHostPermissionPickerDelegate, activeSessionObs));
		activeSessionObs.set({ ...makeActiveSession(), sessionId: 'local-agent-host:s2', resource: URI.parse('agent-host-copilotcli:/s2') }, undefined);
		await pending.complete({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		await timeout(0);
		const expectedSettingId = getAgentHostCopilotSandboxSettingId(false);
		assert.deepStrictEqual({
			settings: [delegate.getSandboxToggleSettingId(), secondDelegate.getSandboxToggleSettingId()],
			requests: diagnosticsRequests(),
		}, { settings: [expectedSettingId, expectedSettingId], requests: 1 });
	});

	test('ignores stale host OS results after switching connections and clears them on disconnect', async () => {
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const { delegate, setConnection, activeSessionObs } = setup(store, makeActiveSession(), 'default', () => pending.p);
		const windowsConnection = new class extends mock<IAgentConnection>() {
			override async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
				return { version: '1', os: 'win32', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] };
			}
		}();
		setConnection(windowsConnection);
		activeSessionObs.set({ ...makeActiveSession(), sessionId: 'remote:s2', resource: URI.parse('remote-host-copilotcli:/s2') }, undefined);
		await timeout(0);
		const settings = [delegate.getSandboxToggleSettingId()];
		await pending.complete({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		await timeout(0);
		settings.push(delegate.getSandboxToggleSettingId());
		setConnection(undefined);
		settings.push(delegate.getSandboxToggleSettingId());
		assert.deepStrictEqual(settings, [getAgentHostCopilotSandboxSettingId(true), getAgentHostCopilotSandboxSettingId(true), undefined]);
	});

	test('logs a failed host OS lookup and retries when returning to the session', async () => {
		const { delegate, activeSessionObs, diagnosticsRequests, logErrors } = setup(store, makeActiveSession(), 'default', async () => {
			throw new Error('Host diagnostics unavailable');
		});
		await timeout(0);
		activeSessionObs.set(undefined, undefined);
		activeSessionObs.set(makeActiveSession(), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			setting: delegate.getSandboxToggleSettingId(),
			resolving: delegate.isResolving.get(),
			requests: diagnosticsRequests(),
			errors: logErrors.length,
		}, { setting: undefined, resolving: false, requests: 2, errors: 2 });
	});

	test('retries a failed host OS lookup when the same connection recovers', async () => {
		let available = false;
		const { delegate, fireConnectionChange, diagnosticsRequests, logErrors } = setup(store, makeActiveSession(), 'default', async () => {
			if (!available) {
				throw new Error('Host diagnostics unavailable');
			}
			return { version: '1', os: 'win32', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] };
		});
		await timeout(0);
		const before = delegate.getSandboxToggleSettingId();
		available = true;
		fireConnectionChange();
		await timeout(0);
		fireConnectionChange();
		await timeout(0);

		assert.deepStrictEqual({
			before,
			setting: delegate.getSandboxToggleSettingId(),
			requests: diagnosticsRequests(),
			errors: logErrors.length,
		}, { before: undefined, setting: getAgentHostCopilotSandboxSettingId(true), requests: 2, errors: 1 });
	});

	test('shares recovery lookups when connection recovery precedes an in-flight rejection', async () => {
		const interrupted = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const recovered = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		let available = false;
		const { delegate, instantiationService, activeSessionObs, fireConnectionChange, diagnosticsRequests, logErrors } = setup(store, makeActiveSession(), 'default', () => available ? recovered.p : interrupted.p);
		const secondDelegate = store.add(instantiationService.createInstance(AgentHostPermissionPickerDelegate, activeSessionObs));
		available = true;
		fireConnectionChange();
		fireConnectionChange();
		await interrupted.error(new Error('Host reconnecting'));
		await timeout(0);
		fireConnectionChange();
		await recovered.complete({ version: '1', os: 'win32', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		await timeout(0);

		assert.deepStrictEqual({
			settings: [delegate.getSandboxToggleSettingId(), secondDelegate.getSandboxToggleSettingId()],
			requests: diagnosticsRequests(),
			errors: logErrors.length,
		}, {
			settings: [getAgentHostCopilotSandboxSettingId(true), getAgentHostCopilotSandboxSettingId(true)],
			requests: 2,
			errors: 2,
		});
	});

	test('ignores host OS results after disposal', async () => {
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const { delegate } = setup(store, makeActiveSession(), 'default', () => pending.p);
		delegate.dispose();
		await pending.complete({ version: '1', os: 'win32', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		await timeout(0);
		assert.strictEqual(delegate.getSandboxToggleSettingId(), undefined);
	});

	for (const dispose of [false, true]) {
		test(`does not retry an interrupted lookup after ${dispose ? 'disposal' : 'disconnection'}`, async () => {
			const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
			const { delegate, fireConnectionChange, setConnection, diagnosticsRequests } = setup(store, makeActiveSession(), 'default', () => pending.p);
			fireConnectionChange();
			if (dispose) {
				delegate.dispose();
			} else {
				setConnection(undefined);
			}
			await pending.error(new Error('Host reconnecting'));
			await timeout(0);
			fireConnectionChange();
			await timeout(0);

			assert.deepStrictEqual({
				setting: delegate.getSandboxToggleSettingId(),
				requests: diagnosticsRequests(),
			}, { setting: undefined, requests: 1 });
		});
	}

	test('does not request the host OS until a Copilot sandbox configuration is available', async () => {
		const { delegate, provider, activeSessionObs, diagnosticsRequests } = setup(store, makeActiveSession('claude'), 'default');
		const requestsForClaude = diagnosticsRequests();
		provider.config = undefined;
		activeSessionObs.set(makeActiveSession(), undefined);
		const requestsWithoutConfig = diagnosticsRequests();
		provider.config = makeWellKnownConfig('default');
		provider.fireChange();
		await timeout(0);
		assert.deepStrictEqual({
			requestsForClaude,
			requestsWithoutConfig,
			requestsWithConfig: diagnosticsRequests(),
			setting: delegate.getSandboxToggleSettingId(),
		}, { requestsForClaude: 0, requestsWithoutConfig: 0, requestsWithConfig: 1, setting: getAgentHostCopilotSandboxSettingId(false) });
	});

	test('running-session picker renders sandbox status as an icon and writes only session choices', async () => {
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const { instantiationService, provider, activeSessionObs, setManagedSandboxEnforced } = setup(store, makeActiveSession(), 'autoApprove', () => pending.p);
		const config = makeWellKnownConfig('autoApprove');
		config.values[SessionConfigKey.SandboxEnabled] = 'default';
		provider.sessionConfigs.set(SESSION_ID, config);
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
		const settingId = getAgentHostCopilotSandboxSettingId(false);
		await configurationService.setUserConfiguration(settingId, 'on');
		await configurationService.setUserConfiguration(getAgentHostCopilotSandboxSettingId(true), 'off');
		let toggle: IActionListItemInlineToggle | undefined;
		let onHide: (() => void) | undefined;
		let menuUpdates = 0;
		let menuHides = 0;
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(IContextKeyService, store.add(new ContextKeyService(configurationService)));
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.set(IDialogService, new class extends mock<IDialogService>() { }());
		instantiationService.set(IOpenerService, new class extends mock<IOpenerService>() { }());
		instantiationService.set(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.set(ITelemetryService, NullTelemetryService);
		instantiationService.set(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover() { return { dispose: () => { } }; }
		}());
		instantiationService.set(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				toggle = items.find(item => item.standaloneToggle)?.standaloneToggle;
				onHide = delegate.onHide;
			}
			override updateItems(): void { menuUpdates++; }
			override hide(): void {
				menuHides++;
				onHide?.();
			}
		}());
		const action = instantiationService.createInstance(MenuItemAction, { id: 'test.permissions', title: 'Permissions' }, undefined, undefined, undefined, undefined);
		const compact = observableValue('compact', false);
		const picker = store.add(instantiationService.createInstance(AgentHostPermissionPickerActionItem, action, { compact }, activeSessionObs));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(trigger);
		const readPresentation = () => ({
			label: trigger.querySelector('.chat-input-picker-label')?.textContent,
			sandboxIcon: !!trigger.querySelector('.chat-input-picker-sandbox-icon'),
			accessibleSandboxed: trigger.ariaLabel?.includes('(sandboxed)'),
		});
		picker.show();
		const beforeHostResolution = { ...readPresentation(), toggleAvailable: !!toggle };
		await pending.complete({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		await timeout(0);
		const afterHostResolution = { ...readPresentation(), menuHides };
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		provider.fireChange();
		const initial = readPresentation();
		picker.show();
		assert.ok(toggle);
		toggle.onChange(true);
		const enabled = readPresentation();
		toggle.onChange(false);
		const disabled = readPresentation();
		setManagedSandboxEnforced(true);
		const managed = readPresentation();
		toggle.onChange(false);
		onHide?.();
		assert.deepStrictEqual({ beforeHostResolution, afterHostResolution, initial, enabled, disabled, managed, writes: provider.setCalls, global: configurationService.getValue(settingId), menuUpdates }, {
			beforeHostResolution: { label: 'Allow all', sandboxIcon: false, accessibleSandboxed: false, toggleAvailable: false },
			afterHostResolution: { label: 'Allow all', sandboxIcon: true, accessibleSandboxed: true, menuHides: 1 },
			initial: { label: 'Allow all', sandboxIcon: false, accessibleSandboxed: false },
			enabled: { label: 'Allow all', sandboxIcon: true, accessibleSandboxed: true },
			disabled: { label: 'Allow all', sandboxIcon: false, accessibleSandboxed: false },
			managed: { label: 'Allow all', sandboxIcon: true, accessibleSandboxed: true },
			writes: [[SESSION_ID, SessionConfigKey.SandboxEnabled, 'on'], [SESSION_ID, SessionConfigKey.SandboxEnabled, 'off']],
			global: 'on',
			menuUpdates: 0,
		});
	});

	test('returns Default when there is no active session', () => {
		const { delegate } = setup(store, undefined);

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('offers the standalone sandbox toggle only for Copilot Agent Host sessions', async () => {
		const { delegate, activeSessionObs, setCustomTerminalToolEnabled } = setup(store, makeActiveSession(), 'default');
		await timeout(0);

		assert.deepStrictEqual({
			copilotApplicable: delegate.isSandboxToggleApplicable(),
			sdkSetting: delegate.getSandboxToggleSettingId(),
		}, {
			copilotApplicable: true,
			sdkSetting: getAgentHostCopilotSandboxSettingId(false),
		});

		setCustomTerminalToolEnabled(true);
		assert.strictEqual(delegate.getSandboxToggleSettingId(), getAgentHostCopilotSandboxSettingId(false));

		activeSessionObs.set(makeActiveSession('claude'), undefined);
		assert.deepStrictEqual({
			claudeApplicable: delegate.isSandboxToggleApplicable(),
			claudeSetting: delegate.getSandboxToggleSettingId(),
		}, {
			claudeApplicable: false,
			claudeSetting: undefined,
		});
	});

	test('exposes managed sandbox enforcement to picker surfaces', () => {
		const { delegate, setManagedSandboxEnforced } = setup(store, makeActiveSession(), 'default');
		const before = delegate.managedSandboxEnforced.get();

		setManagedSandboxEnforced(true);

		assert.deepStrictEqual({ before, after: delegate.managedSandboxEnforced.get() }, { before: false, after: true });
	});

	test('sandbox choices are retained by the selected session', () => {
		const { delegate, provider, activeSessionObs } = setup(store, makeActiveSession(), 'default');
		const secondSessionId = 'local-agent-host:s2';
		provider.sessionConfigs.set(SESSION_ID, makeWellKnownConfig('default'));
		provider.sessionConfigs.set(secondSessionId, makeWellKnownConfig('default'));

		delegate.setSandboxEnabled(false);
		const firstSessionValue = delegate.sandboxEnabled.get();
		activeSessionObs.set({ ...makeActiveSession(), sessionId: secondSessionId }, undefined);
		delegate.setSandboxEnabled(true);
		const secondSessionValue = delegate.sandboxEnabled.get();
		activeSessionObs.set(makeActiveSession(), undefined);

		assert.deepStrictEqual({
			writes: provider.setCalls,
			firstSessionValue,
			secondSessionValue,
			restoredFirstSessionValue: delegate.sandboxEnabled.get(),
		}, {
			writes: [
				[SESSION_ID, SessionConfigKey.SandboxEnabled, 'off'],
				[secondSessionId, SessionConfigKey.SandboxEnabled, 'on'],
			],
			firstSessionValue: false,
			secondSessionValue: true,
			restoredFirstSessionValue: false,
		});
	});

	test('reads restored sandbox choices and follows session changes', () => {
		const { delegate, provider, activeSessionObs } = setup(store, makeActiveSession(), 'default');
		const values = [delegate.sandboxEnabled.get()];
		for (const value of ['off', 'on', 'default']) {
			provider.config!.values[SessionConfigKey.SandboxEnabled] = value;
			provider.fireChange();
			values.push(delegate.sandboxEnabled.get());
		}
		activeSessionObs.set(undefined, undefined);
		values.push(delegate.sandboxEnabled.get());
		assert.deepStrictEqual(values, [undefined, false, true, undefined, undefined]);
	});

	test('does not expose a global fallback toggle for older hosts', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');
		delete provider.config!.schema.properties[SessionConfigKey.SandboxEnabled];
		provider.fireChange();
		assert.strictEqual(delegate.isSandboxToggleApplicable(), false);
		assert.throws(() => delegate.setSandboxEnabled(false), /Sandbox configuration is unavailable/);
		assert.deepStrictEqual(provider.setCalls, []);
	});

	test('returns Default when the active session has no config seeded yet', () => {
		const { delegate } = setup(store, makeActiveSession());

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('reflects the active session\'s autoApprove value and updates on provider change', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'autoApprove');

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.AutoApprove);

		provider.config = makeWellKnownConfig('default');
		provider.fireChange();
		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('reflects whether the active session config is resolving', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');
		assert.strictEqual(delegate.isResolving.get(), false);

		provider.resolving.set(true, undefined);

		assert.strictEqual(delegate.isResolving.get(), true);
	});

	test('maps a legacy autoApprove=autopilot value to Default (Autopilot moved onto the mode axis)', () => {
		const { delegate } = setup(store, makeActiveSession(), 'autopilot');

		// `autopilot` is no longer a valid approval level — the picker does not
		// offer it, so the chip must surface Default rather than a level it
		// cannot render.
		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('falls back to Default when the stored value is unrecognized', () => {
		const { delegate } = setup(store, makeActiveSession(), 'something-else');

		assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
	});

	test('setPermissionLevel writes through to the active session and tracks the first-send operation', async () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');

		await delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
		await delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
		await delegate.setPermissionLevel(ChatPermissionLevel.Default);

		assert.deepStrictEqual({
			setCalls: provider.setCalls,
			trackedSessions: provider.trackedOperations.map(([sessionId]) => sessionId),
		}, {
			setCalls: [
				[SESSION_ID, 'autoApprove', 'autoApprove'],
				[SESSION_ID, 'autoApprove', 'assisted'],
				[SESSION_ID, 'autoApprove', 'default'],
			],
			trackedSessions: [SESSION_ID, SESSION_ID, SESSION_ID],
		});
	});

	test('offers Manual permissions, Assisted permissions, and Allow all in order', () => {
		const { delegate } = setup(store, makeActiveSession(), 'assisted');

		assert.deepStrictEqual({
			current: delegate.currentPermissionLevel.get(),
			metadata: delegate.availableLevels.map(level => {
				const baseMeta = getPermissionLevelMeta(level);
				const { label, detail, hover, icon } = delegate.getPermissionLevelMeta(level, baseMeta);
				return { label, detail, hover, icon: icon.id };
			}),
			available: delegate.availableLevels,
		}, {
			current: ChatPermissionLevel.Assisted,
			metadata: [
				{ label: 'Manual permissions', detail: 'Asks when approval settings don\'t apply', hover: undefined, icon: 'key' },
				{ label: 'Assisted permissions', detail: 'Evaluates risk before running tools', hover: 'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.', icon: 'sparkle' },
				{ label: 'Allow all', detail: 'Runs tool calls without asking', hover: undefined, icon: 'warning' },
			],
			available: [
				ChatPermissionLevel.Default,
				ChatPermissionLevel.Assisted,
				ChatPermissionLevel.AutoApprove,
			],
		});
	});

	test('offers only levels advertised by the active schema', () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');
		provider.config = makeWellKnownConfig('default', ['default', 'autoApprove']);
		provider.fireChange();

		assert.deepStrictEqual(delegate.availableLevels, [
			ChatPermissionLevel.Default,
			ChatPermissionLevel.AutoApprove,
		]);
	});

	test('hides and rejects Assisted permissions when the setting is disabled', async () => {
		const { delegate, provider, setAssistedPermissionsEnabled } = setup(store, makeActiveSession(), 'default');
		setAssistedPermissionsEnabled(false);

		await delegate.setPermissionLevel(ChatPermissionLevel.Assisted);

		assert.deepStrictEqual({
			available: delegate.availableLevels,
			setCalls: provider.setCalls,
		}, {
			available: [
				ChatPermissionLevel.Default,
				ChatPermissionLevel.AutoApprove,
			],
			setCalls: [],
		});
	});

	test('does not write a level omitted by the active schema', async () => {
		const { delegate, provider } = setup(store, makeActiveSession(), 'default');
		provider.config = makeWellKnownConfig('default', ['default', 'autoApprove']);
		provider.fireChange();

		await delegate.setPermissionLevel(ChatPermissionLevel.Assisted);

		assert.deepStrictEqual(provider.setCalls, []);
	});

	test('setPermissionLevel is a no-op when there is no active session', async () => {
		const { delegate, provider } = setup(store, undefined);

		await delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);

		assert.deepStrictEqual(provider.setCalls, []);
	});

	test('provides agent-host-specific hover copy for permission levels', () => {
		const { delegate } = setup(store, makeActiveSession(), 'autoApprove');

		assert.strictEqual(
			delegate.getPermissionLevelHover(ChatPermissionLevel.AutoApprove, getPermissionLevelMeta(ChatPermissionLevel.AutoApprove)),
			'Copilot runs all tools without asking for approval.'
		);
	});

	test('provides agent-host-specific hover copy for Approve When Safe', () => {
		const { delegate } = setup(store, makeActiveSession(), 'assisted');

		assert.strictEqual(
			delegate.getPermissionLevelHover(ChatPermissionLevel.Assisted, getPermissionLevelMeta(ChatPermissionLevel.Assisted)),
			'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.'
		);
	});

	test('isApplicable reacts to active session and config changes', () => {
		const { delegate, provider, activeSessionObs } = setup(store, undefined);

		// No active session → false
		assert.strictEqual(delegate.isApplicable.get(), false);

		// Active session, no config seeded → false
		activeSessionObs.set(makeActiveSession(), undefined);
		assert.strictEqual(delegate.isApplicable.get(), false);

		// Active session with well-known schema → true
		provider.config = makeWellKnownConfig('default');
		provider.fireChange();
		assert.strictEqual(delegate.isApplicable.get(), true);

		// Active session cleared → false (covers the 'back to new chat view' regression)
		activeSessionObs.set(undefined, undefined);
		assert.strictEqual(delegate.isApplicable.get(), false);
	});
});

suite('isWellKnownAutoApproveSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function schema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
		return {
			title: 'Auto Approve',
			description: 'desc',
			type: 'string',
			enum: ['default', 'assisted', 'autoApprove'],
			...overrides,
		} as SessionConfigPropertySchema;
	}

	test('matches the canonical three-value enum', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema()), true);
	});

	test('still accepts a legacy enum that contains "autopilot" for backward compatibility', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default', 'autoApprove', 'autopilot'] })), true);
	});

	test('matches a subset that still contains "default"', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default', 'autoApprove'] })), true);
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default'] })), true);
	});

	test('rejects schemas missing the required "default" value', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['autoApprove', 'autopilot'] })), false);
	});

	test('rejects schemas with unknown enum values', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ['default', 'custom'] })), false);
	});

	test('rejects non-string types and missing/empty enums', () => {
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ type: 'number' as 'string' })), false);
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: undefined })), false);
		assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: [] })), false);
	});
});

suite('isWellKnownModeSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function schema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
		return {
			title: 'Agent Mode',
			description: 'desc',
			type: 'string',
			enum: ['interactive', 'plan'],
			...overrides,
		} as SessionConfigPropertySchema;
	}

	test('matches the canonical two-value enum', () => {
		assert.strictEqual(isWellKnownModeSchema(schema()), true);
	});

	test('matches a subset that still contains "interactive"', () => {
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: ['interactive'] })), true);
	});

	test('rejects schemas missing the required "interactive" value', () => {
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: ['plan'] })), false);
	});

	test('rejects non-string types and missing/empty enums', () => {
		assert.strictEqual(isWellKnownModeSchema(schema({ type: 'number' as 'string' })), false);
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: undefined })), false);
		assert.strictEqual(isWellKnownModeSchema(schema({ enum: [] })), false);
	});

	test('accepts only values still present in the current schema', () => {
		assert.deepStrictEqual({
			interactive: isWellKnownModeValue(schema(), 'interactive'),
			plan: isWellKnownModeValue(schema(), 'plan'),
			removed: isWellKnownModeValue(schema({ enum: ['interactive'] }), 'plan'),
			unknownSchema: isWellKnownModeValue(schema({ enum: ['plan'] }), 'plan'),
		}, {
			interactive: true,
			plan: true,
			removed: false,
			unknownSchema: false,
		});
	});
});

suite('isWellKnownClaudePermissionModeSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function schema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
		return {
			title: 'Approvals',
			description: 'desc',
			type: 'string',
			enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
			...overrides,
		} as SessionConfigPropertySchema;
	}

	test('matches the canonical permission-mode enum', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema()), true);
	});

	test('matches a subset that still contains "default"', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['default', 'acceptEdits'] })), true);
	});

	test('rejects schemas that include unsupported SDK-only values', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk'] })), false);
	});

	test('rejects schemas missing "default" or containing custom values', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['acceptEdits', 'plan'] })), false);
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ['default', 'custom'] })), false);
	});

	test('rejects non-string types and missing enums', () => {
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ type: 'number' as 'string' })), false);
		assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: undefined })), false);
	});
});
