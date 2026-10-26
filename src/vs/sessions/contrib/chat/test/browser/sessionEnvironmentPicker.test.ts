/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, NullRemoteAgentHostService, readWebSocketRemoteAgentHostEntries, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { getDefaultSessionCreationEnvironment, getEnvironmentWorkspaceProvider, getRemoteSessionCreationEnvironment, getSessionCreationEnvironments, ISessionCreationEnvironment, SessionEnvironmentPicker } from '../../browser/sessionEnvironmentPicker.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../common/constants.js';
import { isWindows } from '../../../../../base/common/platform.js';

suite('SessionEnvironmentPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/project');
	const workspace = upcastPartial<ISessionWorkspace>({ uri: folder });
	const local: ISessionCreationEnvironment = { id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] };
	const cloud: ISessionCreationEnvironment = { id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: ['cloud'] };

	function provider(id: string, environment: string, options: Partial<ISessionsProvider> = {}): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({
			id, environment: { id: environment, label: environment }, label: id, icon: Codicon.remote,
			resolveWorkspace: () => workspace,
			getSessionTypes: () => [],
			...options,
		});
	}

	test('defaults local folders to This Computer even when Cloud resolves the recent workspace first', () => {
		const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['remote'] };
		const container: ISessionCreationEnvironment = { ...local, id: 'container:local', kind: 'container' };
		const environments = [cloud, local, remote, container];
		assert.deepStrictEqual([
			getDefaultSessionCreationEnvironment(environments, folder, 'cloud')?.id,
			getDefaultSessionCreationEnvironment(environments, undefined, undefined)?.id,
			getDefaultSessionCreationEnvironment(environments, URI.parse('vscode-agent-host://host/project'), 'remote')?.id,
			getDefaultSessionCreationEnvironment(environments, URI.parse('github:/owner/repo'), 'cloud')?.id,
			getDefaultSessionCreationEnvironment(environments, folder, LOCAL_AGENT_HOST_PROVIDER_ID, true)?.id,
			getDefaultSessionCreationEnvironment([cloud], folder, 'cloud')?.id,
		], ['local', 'local', 'remote', 'cloud', 'container:local', 'cloud']);
	});

	test('groups logical local and cloud destinations and excludes hidden hosts and internal backends', () => {
		const providers = [
			provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local'),
			provider('another-local', 'local'),
			provider('cloud', 'cloud'),
			upcastPartial<IAgentHostSessionsProvider>({
				...provider('agenthost-remote-visible', 'remote'),
				connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
			}),
			upcastPartial<IAgentHostSessionsProvider>({
				...provider('agenthost-remote-hidden', 'remote'),
				connectionStatus: constObservable(RemoteAgentHostConnectionStatus.disconnected),
				isVisibleInEnvironmentPicker: constObservable(false),
			}),
			provider('agenthost-remote-backend', 'cloud', { supportsWorkspaceSelection: false }),
		];
		assert.deepStrictEqual(getSessionCreationEnvironments(providers).map(({ id, kind, providerIds, description }) => ({ id, kind, providerIds, description })), [
			{ id: 'local', kind: 'local', providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID, 'another-local'], description: undefined },
			{ id: 'cloud', kind: 'cloud', providerIds: ['cloud'], description: undefined },
			{ id: 'agenthost-remote-visible', kind: 'remote', providerIds: ['agenthost-remote-visible'], description: 'Connected' },
		]);
	});

	test('Cloud requires a supported session type, not merely a resolvable local folder', () => {
		const localProvider = provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local');
		const cloudProvider = provider('cloud', 'cloud');
		const supportedCloud = provider('cloud', 'cloud', {
			getSessionTypes: () => [{ id: 'cloud-agent', label: 'Cloud', icon: Codicon.cloud, authRequirement: SessionTypeAuthRequirement.GitHub }],
		});

		assert.deepStrictEqual([
			getEnvironmentWorkspaceProvider(local, [localProvider, cloudProvider], folder)?.id,
			getEnvironmentWorkspaceProvider(cloud, [localProvider, cloudProvider], folder)?.id,
			getEnvironmentWorkspaceProvider(cloud, [localProvider, supportedCloud], folder)?.id,
		], [LOCAL_AGENT_HOST_PROVIDER_ID, undefined, 'cloud']);
	});

	test('connection descriptions use the shared Connected, Connecting and Disconnected labels', () => {
		const states = [
			RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.connecting,
			RemoteAgentHostConnectionStatus.disconnected, RemoteAgentHostConnectionStatus.reconnecting,
			RemoteAgentHostConnectionStatus.incompatible('Update required', ['1']),
		];
		const providers = states.map((connectionStatus, index) => upcastPartial<IAgentHostSessionsProvider>({
			...provider(`agenthost-remote-${index}`, 'remote'), connectionStatus: constObservable(connectionStatus),
		}));
		assert.deepStrictEqual(getSessionCreationEnvironments(providers).map(environment => environment.description), [
			'Connected', 'Connecting', 'Disconnected', 'Disconnected', 'Disconnected',
		]);
	});

	test('keeps worktree-capable providers in This Computer without separate isolation environments', () => {
		const providers = [
			provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local', { setIsolationMode: async () => { } }),
			provider('folder-only', 'local'),
			provider('cloud', 'cloud'),
		];
		assert.deepStrictEqual(getSessionCreationEnvironments(providers).map(({ id, label, providerIds }) => ({ id, label, providerIds })), [
			{ id: 'local', label: 'This Computer', providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID, 'folder-only'] },
			{ id: 'cloud', label: 'Cloud', providerIds: ['cloud'] },
		]);
	});

	test('an explicitly selected host never resolves through another host or an unavailable provider', () => {
		const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['agenthost-remote-selected'] };
		const selected = upcastPartial<IAgentHostSessionsProvider>({
			...provider('agenthost-remote-selected', 'remote'),
			isVisibleInEnvironmentPicker: constObservable(false),
		});
		assert.strictEqual(getEnvironmentWorkspaceProvider(remote, [selected, provider('agenthost-remote-other', 'remote')], folder), undefined);
	});

	test('a hidden but available remote stays resolvable for a selected draft without returning to the picker', () => {
		const selected = upcastPartial<IAgentHostSessionsProvider>({
			...provider('agenthost-selected', 'remote'),
			connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
			isAvailableInEnvironmentPicker: constObservable(true),
			isVisibleInEnvironmentPicker: constObservable(false),
		});
		const environment = getRemoteSessionCreationEnvironment(selected)!;
		assert.deepStrictEqual({
			picker: getSessionCreationEnvironments([selected]),
			selected: environment.id,
			resolved: getEnvironmentWorkspaceProvider(environment, [selected], folder)?.id,
		}, { picker: [], selected: selected.id, resolved: selected.id });
	});

	for (const containerRequested of [false, true]) {
		test(`restored hidden remote retains its destination without adding it to the picker (container: ${containerRequested})`, () => {
			const remote = upcastPartial<IAgentHostSessionsProvider>({
				...provider('agenthost-hidden', 'remote'), connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
				isVisibleInEnvironmentPicker: constObservable(false), isAvailableInEnvironmentPicker: constObservable(true),
			});
			const environments = getSessionCreationEnvironments([provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local'), remote]);
			const selected = getDefaultSessionCreationEnvironment(environments, URI.parse('vscode-agent-host://host/project'), remote.id, containerRequested, remote);
			assert.deepStrictEqual({
				selected: selected && { id: selected.id, kind: selected.kind, label: selected.label, providers: selected.providerIds },
				picker: environments.map(environment => environment.id),
				resolved: selected && getEnvironmentWorkspaceProvider(selected, [remote], folder)?.id,
			}, {
				selected: { id: containerRequested ? `container:${remote.id}` : remote.id, kind: containerRequested ? 'container' : 'remote', label: containerRequested ? 'Dev Container' : remote.label, providers: [remote.id] },
				picker: ['local'], resolved: remote.id,
			});
		});
	}

	test('renders before repository controls, updates its accessible name, and selects through the action widget', async () => {
		const instantiation = store.add(new TestInstantiationService());
		let hide: (() => void) | undefined;
		let accept: ((index: number) => void) | undefined;
		let labels: (string | undefined)[] = [];
		const selected = observableValue<ISessionCreationEnvironment | undefined>('environment', local);
		const tooltipLabels: string[] = [];
		instantiation.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			hide: () => hide?.(),
			show: <T>(_user: string, _preview: boolean, items: IActionListItem<T>[], delegate: IActionListDelegate<T>) => {
				labels = items.map(item => item.label);
				hide = () => delegate.onHide();
				accept = index => delegate.onSelect(items[index].item!);
			},
		}));
		instantiation.stub(IMenuService, { getMenuActions: () => [] });
		instantiation.stub(IContextKeyService, new MockContextKeyService());
		instantiation.stub(IKeybindingService, new class extends MockKeybindingService {
			override appendKeybinding(label: string): string {
				tooltipLabels.push(label);
				return `${label} (Ctrl+K Ctrl+E)`;
			}
		}());
		instantiation.stub(IHoverService, NullHoverService);
		instantiation.stub(ICommandService, {});
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: false });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ISessionsProvidersService, { getProvider: () => undefined });
		instantiation.stub(IRemoteAgentHostService, new NullRemoteAgentHostService());
		instantiation.stub(IMissionControlEnvironmentService, { enabled: false, hosts: constObservable([]) });
		const picker = store.add(instantiation.createInstance(SessionEnvironmentPicker, constObservable([local, cloud]), selected, async environment => selected.set(environment, undefined), () => []));
		const container = dom.$('div');
		dom.append(container, dom.$('span', undefined, 'Repository'));
		store.add(picker.render(container, {
			focusCommand: { id: 'sessions.focusEnvironmentPicker', when: ContextKeyExpr.true(), enabled: constObservable(true) },
		}));
		const trigger = container.querySelector<HTMLElement>('[role="button"]')!;
		picker.showPicker();
		accept?.(1);
		await Promise.resolve();
		assert.deepStrictEqual({
			order: container.textContent,
			labels,
			selected: selected.get()?.id,
			ariaLabel: trigger.getAttribute('aria-label'),
			expanded: trigger.getAttribute('aria-expanded'),
			toolbar: !!trigger.closest('.monaco-toolbar'),
			tooltipLabels,
		}, {
			order: 'CloudRepository', labels: ['This Computer', 'Cloud'], selected: 'cloud', ariaLabel: 'Choose Environment, Cloud', expanded: 'false', toolbar: true,
			tooltipLabels: ['Choose Environment, This Computer', 'Choose Environment, Cloud'],
		});
	});

	for (const { remotesEnabled, environmentPickerEnabled } of [false, true].flatMap(remotesEnabled => [false, true].map(environmentPickerEnabled => ({ remotesEnabled, environmentPickerEnabled })))) {
		for (const manageEnabled of [undefined, false, true]) {
			test(`Manage visibility follows all gates (remotes: ${remotesEnabled}, picker: ${environmentPickerEnabled}, manage: ${manageEnabled})`, async () => {
				const instantiation = store.add(new TestInstantiationService());
				const configuration = new TestConfigurationService({
					[RemoteAgentHostsEnabledSettingId]: remotesEnabled,
					[ENVIRONMENT_PICKER_SETTING]: environmentPickerEnabled,
					...(manageEnabled === undefined ? {} : { [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: manageEnabled }),
					[RemoteAgentHostsSettingId]: [
						{ name: 'WebSocket', address: 'ws://localhost:3000' },
						{ name: 'Secure WebSocket', address: 'wss://host.example.com:3000' },
					],
				});
				store.add(configuration.onDidChangeConfigurationEmitter);
				instantiation.stub(IConfigurationService, configuration);
				const entries: readonly IRemoteAgentHostEntry[] = [
					{ name: 'SSH', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:remote', hostName: 'remote' } },
					{ name: 'Tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'remote', clusterId: 'test' } },
					{ name: 'WSL', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } },
					{ name: 'Environment', connection: { type: RemoteAgentHostEntryType.CloudSandbox, address: 'cloudsandbox:remote', environmentId: 'remote', environmentKind: 'user-local' } },
					{ name: 'Dev Container', connection: { type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:remote', hostPath: '/project' } },
					...readWebSocketRemoteAgentHostEntries(configuration),
				];
				const providers: ISessionsProvider[] = entries.map((entry, index) => upcastPartial<IAgentHostSessionsProvider>({
					...provider(`agenthost-remote-${index}`, 'remote'),
					label: entry.name,
					remoteAddress: getEntryAddress(entry),
					connectionStatus: constObservable(index % 2 ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected),
				}));
				providers.push(upcastPartial<IAgentHostSessionsProvider>({
					...provider('agenthost-remote-unknown', 'remote'), label: 'Unknown',
					remoteAddress: 'unknown:remote', connectionStatus: constObservable(RemoteAgentHostConnectionStatus.disconnected),
				}));
				const otherEnvironments = [
					{ id: 'managed', kind: 'managed-sandbox', label: 'Managed Sandbox' },
					{ id: 'future', kind: 'future-kind', label: 'Future Environment' },
				];
				for (const host of otherEnvironments) {
					providers.push(upcastPartial<IAgentHostSessionsProvider>({
						...provider(`agenthost-${host.id}`, 'remote'), label: host.label,
						remoteAddress: `cloudsandbox:${host.id}`, connectionStatus: constObservable(RemoteAgentHostConnectionStatus.disconnected),
					}));
				}
				const hosts = observableValue<readonly IMissionControlHost[]>(store, [
					{ id: 'remote', name: 'Environment', kind: 'user-local', status: 'online' },
					...otherEnvironments.map(host => ({ ...host, name: host.label, status: 'online' })),
				]);
				const inventory = { enabled: true, accountKey: 'account' as string | undefined };
				instantiation.stub(IMissionControlEnvironmentService, {
					hosts,
					get enabled() { return inventory.enabled; },
					get accountKey() { return inventory.accountKey; },
				});
				instantiation.stub(ISessionsProvidersService, { getProvider: <T extends ISessionsProvider>(id: string) => providers.find(provider => provider.id === id) as T | undefined });
				let configuredEntries = entries.filter(entry => entry.connection.type !== RemoteAgentHostEntryType.CloudSandbox);
				instantiation.stub(IRemoteAgentHostService, { get configuredEntries() { return configuredEntries; } });
				const telemetry = new TestExperimentTriggerTelemetryService();
				instantiation.stub(ITelemetryService, telemetry);
				instantiation.stub(IContextKeyService, new MockContextKeyService());
				instantiation.stub(IHoverService, NullHoverService);
				instantiation.stub(IKeybindingService, new MockKeybindingService());
				const calls: string[] = [];
				instantiation.stub(ICommandService, {
					executeCommand: async (id, ...args) => {
						calls.push(`command:${id}:${args.join(',')}`);
						return undefined;
					},
				});
				const connectionAction = instantiation.createInstance(MenuItemAction, { id: 'test.connect', title: 'Connect via SSH...', icon: Codicon.remote }, undefined, undefined, undefined, undefined);
				instantiation.stub(IMenuService, { getMenuActions: () => [['navigation', [connectionAction]]] });
				let accept: ((index: number) => void) | undefined;
				let hide: (() => void) | undefined;
				let menu: { label: string | undefined; separator: boolean }[] = [];
				let submenus: (readonly string[] | undefined)[] = [];
				let websocketActions: readonly IAction[] | undefined;
				let hideDefaultKeybindingTooltip: boolean | undefined;
				instantiation.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
					isVisible: false,
					hide: () => { calls.push('hide'); hide?.(); },
					show: (...args: Parameters<IActionWidgetService['show']>) => {
						const [, , items, delegate, , , , , options] = args;
						hideDefaultKeybindingTooltip = options?.hideDefaultKeybindingTooltip;
						menu = items.map(item => ({ label: item.label, separator: item.kind === ActionListItemKind.Separator }));
						submenus = items.filter(item => item.kind === ActionListItemKind.Action).map(item => item.submenuActions?.map(action => action.label));
						websocketActions = items.find(item => item.label === 'WebSocket')?.submenuActions;
						hide = () => delegate.onHide();
						accept = index => delegate.onSelect(items[index].item!);
					},
				}));
				const selected = observableValue<ISessionCreationEnvironment | undefined>(store, local);
				const remoteEnvironments = getSessionCreationEnvironments(providers);
				const picker = store.add(instantiation.createInstance(SessionEnvironmentPicker, constObservable([local, ...remoteEnvironments]), selected, async environment => {
					calls.push(`select:${environment.id}`);
					selected.set(environment, undefined);
				}, environment => environment.kind === 'remote' ? [toAction({
					id: `manage.${environment.id}`, label: `Manage ${environment.label}`, run: () => { calls.push(`manage:${environment.label}`); },
				})] : []));
				const container = dom.$('div');
				store.add(picker.render(container));
				const trigger = container.querySelector<HTMLElement>('[role="button"]')!;
				assert.deepStrictEqual(telemetry.triggers, []);
				trigger.click();
				const showManage = remotesEnabled && environmentPickerEnabled && manageEnabled === true;
				await websocketActions?.[0].run();
				if (showManage) {
					accept!(menu.length - 1);
					await Promise.resolve();
				}
				assert.deepStrictEqual({
					menu, hideDefaultKeybindingTooltip, remoteSubmenus: submenus.slice(1, providers.length + 1), calls, selected: selected.get()?.id, expanded: trigger.getAttribute('aria-expanded'), triggers: telemetry.triggers,
				}, {
					menu: [
						{ label: 'This Computer', separator: false },
						...providers.map(provider => ({ label: provider.label, separator: false })),
						{ label: '', separator: true },
						{ label: 'Connect via SSH...', separator: false },
						...(showManage ? [{ label: '', separator: true }, { label: 'Manage...', separator: false }] : []),
					],
					hideDefaultKeybindingTooltip: true,
					remoteSubmenus: [
						showManage ? undefined : ['Manage SSH'],
						showManage ? undefined : ['Manage Tunnel'],
						showManage && isWindows ? undefined : ['Manage WSL'],
						showManage ? undefined : ['Manage Environment'],
						['Manage Dev Container'], ['Manage WebSocket'], ['Manage Secure WebSocket'], ['Manage Unknown'],
						['Manage Managed Sandbox'], ['Manage Future Environment'],
					],
					calls: ['manage:WebSocket', ...(showManage ? ['hide', `command:${OPEN_REMOTES_EDITOR_COMMAND_ID}:`] : [])],
					selected: 'local', expanded: showManage ? 'false' : 'true',
					triggers: remotesEnabled && environmentPickerEnabled ? [`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`] : [],
				});
				hide?.();
				configuredEntries = [...entries];
				await configuration.setUserConfiguration(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, !manageEnabled);
				trigger.click();
				assert.deepStrictEqual({
					visibleAfterSettingChange: menu.some(item => item.label === 'Manage...'),
					sshSubmenu: submenus[1], environmentSubmenu: submenus[4], websocketSubmenu: submenus[6],
					triggers: telemetry.triggers,
				}, {
					visibleAfterSettingChange: remotesEnabled && environmentPickerEnabled && !manageEnabled,
					sshSubmenu: remotesEnabled && environmentPickerEnabled && !manageEnabled ? undefined : ['Manage SSH'],
					environmentSubmenu: remotesEnabled && environmentPickerEnabled && !manageEnabled ? undefined : ['Manage Environment'],
					websocketSubmenu: ['Manage WebSocket'],
					triggers: remotesEnabled && environmentPickerEnabled ? [`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`] : [],
				});
				if (showManage) {
					await configuration.setUserConfiguration(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, true);
					const environmentSubmenu = () => {
						hide?.();
						trigger.click();
						return submenus[4];
					};
					await configuration.setUserConfiguration(ENVIRONMENT_PICKER_SETTING, false);
					const pickerDisabled = environmentSubmenu();
					const manageWithoutPicker = menu.some(item => item.label === 'Manage...');
					await configuration.setUserConfiguration(ENVIRONMENT_PICKER_SETTING, true);
					const pickerReenabled = environmentSubmenu();
					hosts.set(hosts.get().map(host => ({ ...host, status: 'offline' })), undefined);
					const offline = environmentSubmenu();
					accept!(4);
					await Promise.resolve();
					const selectedEnvironment = selected.get()?.id;
					inventory.enabled = false;
					const disabled = environmentSubmenu();
					inventory.enabled = true;
					inventory.accountKey = undefined;
					const signedOut = environmentSubmenu();
					inventory.accountKey = 'other-account';
					hosts.set([], undefined);
					const withdrawn = environmentSubmenu();
					assert.deepStrictEqual({ pickerDisabled, manageWithoutPicker, pickerReenabled, offline, selectedEnvironment, disabled, signedOut, withdrawn }, {
						pickerDisabled: ['Manage Environment'], manageWithoutPicker: false, pickerReenabled: undefined,
						offline: undefined, selectedEnvironment: remoteEnvironments[3].id,
						disabled: ['Manage Environment'], signedOut: ['Manage Environment'], withdrawn: ['Manage Environment'],
					});
				}
			});
		}
	}
});
