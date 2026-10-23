/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
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
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { getDefaultSessionCreationEnvironment, getEnvironmentWorkspaceProvider, getSessionCreationEnvironments, isEnvironmentPickerLocalIsolationEnabled, ISessionCreationEnvironment, SessionEnvironmentPicker } from '../../browser/sessionEnvironmentPicker.js';
import { ENVIRONMENT_PICKER_LOCAL_ISOLATION_SETTING, ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';
import { isWeb } from '../../../../../base/common/platform.js';

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
		assert.deepStrictEqual(getSessionCreationEnvironments(providers, false), getSessionCreationEnvironments(providers));
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

	test('local isolation is opt-in and requires the desktop environment picker', () => {
		const settings = [UNIFIED_WORKSPACE_PICKER_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, ENVIRONMENT_PICKER_SETTING, ENVIRONMENT_PICKER_LOCAL_ISOLATION_SETTING];
		const enabled = Object.fromEntries(settings.map(setting => [setting, true]));
		const configurations = [enabled, ...settings.map(setting => ({ ...enabled, [setting]: false }))];
		assert.deepStrictEqual(configurations.map(values => {
			const configuration = new TestConfigurationService(values);
			store.add(configuration.onDidChangeConfigurationEmitter);
			return isEnvironmentPickerLocalIsolationEnabled(configuration);
		}), [!isWeb, false, false, false, false]);
	});

	test('splits local environments without changing cloud and remote destinations', () => {
		const providers = [
			provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local', { setIsolationMode: async () => { } }),
			provider('folder-only', 'local'),
			provider('cloud', 'cloud'),
		];
		assert.deepStrictEqual(getSessionCreationEnvironments(providers, true).map(({ id, label, isolation, providerIds }) => ({ id, label, isolation, providerIds })), [
			{ id: 'local:folder', label: 'Local Folder', isolation: 'folder', providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID, 'folder-only'] },
			{ id: 'local:worktree', label: 'New Worktree', isolation: 'worktree', providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] },
			{ id: 'cloud', label: 'Cloud', isolation: undefined, providerIds: ['cloud'] },
		]);
	});

	test('New Worktree requires worktree support for the chosen workspace', () => {
		const environments = getSessionCreationEnvironments([provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local', { setIsolationMode: async () => { } })], true);
		const worktree = environments.find(environment => environment.isolation === 'worktree')!;
		const unsupported = provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local');
		const supported = provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local', {
			getSessionTypes: () => [{ id: 'copilot', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.GitHub, supportsWorktreeConfiguration: true }],
		});
		assert.deepStrictEqual([
			getEnvironmentWorkspaceProvider(worktree, [unsupported], folder)?.id,
			getEnvironmentWorkspaceProvider(worktree, [supported], folder)?.id,
			getDefaultSessionCreationEnvironment(environments, folder, LOCAL_AGENT_HOST_PROVIDER_ID)?.id,
		], [undefined, LOCAL_AGENT_HOST_PROVIDER_ID, 'local:folder']);
	});

	test('an explicitly selected host never resolves through another host or a hidden provider', () => {
		const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['agenthost-remote-selected'] };
		const selected = upcastPartial<IAgentHostSessionsProvider>({
			...provider('agenthost-remote-selected', 'remote'),
			isVisibleInEnvironmentPicker: constObservable(false),
		});
		assert.strictEqual(getEnvironmentWorkspaceProvider(remote, [selected, provider('agenthost-remote-other', 'remote')], folder), undefined);
	});

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

	for (const remotesEnabled of [false, true]) {
		for (const manageEnabled of [undefined, false, true]) {
			test(`Manage visibility follows the setting and remote-host availability (remotes: ${remotesEnabled}, manage: ${manageEnabled})`, async () => {
				const instantiation = store.add(new TestInstantiationService());
				const configuration = new TestConfigurationService({
					[RemoteAgentHostsEnabledSettingId]: remotesEnabled,
					...(manageEnabled === undefined ? {} : { [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: manageEnabled }),
				});
				store.add(configuration.onDidChangeConfigurationEmitter);
				instantiation.stub(IConfigurationService, configuration);
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
				instantiation.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
					isVisible: false,
					hide: () => { calls.push('hide'); hide?.(); },
					show: <T>(_user: string, _preview: boolean, items: IActionListItem<T>[], delegate: IActionListDelegate<T>) => {
						menu = items.map(item => ({ label: item.label, separator: item.kind === ActionListItemKind.Separator }));
						hide = () => delegate.onHide();
						accept = index => delegate.onSelect(items[index].item!);
					},
				}));
				const selected = observableValue<ISessionCreationEnvironment | undefined>(store, local);
				const picker = store.add(instantiation.createInstance(SessionEnvironmentPicker, constObservable([local]), selected, async environment => {
					calls.push(`select:${environment.id}`);
					selected.set(environment, undefined);
				}, () => []));
				const container = dom.$('div');
				store.add(picker.render(container));
				const trigger = container.querySelector<HTMLElement>('[role="button"]')!;
				assert.deepStrictEqual(telemetry.triggers, []);
				trigger.click();
				const showManage = remotesEnabled && manageEnabled === true;
				if (showManage) {
					accept!(menu.length - 1);
					await Promise.resolve();
				}
				assert.deepStrictEqual({
					menu, calls, selected: selected.get()?.id, expanded: trigger.getAttribute('aria-expanded'), triggers: telemetry.triggers,
				}, {
					menu: [
						{ label: 'This Computer', separator: false },
						{ label: '', separator: true },
						{ label: 'Connect via SSH...', separator: false },
						...(showManage ? [{ label: '', separator: true }, { label: 'Manage...', separator: false }] : []),
					],
					calls: showManage ? ['hide', `command:${OPEN_REMOTES_EDITOR_COMMAND_ID}:`] : [],
					selected: 'local', expanded: showManage ? 'false' : 'true',
					triggers: remotesEnabled ? [`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`] : [],
				});
				hide?.();
				await configuration.setUserConfiguration(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, !manageEnabled);
				trigger.click();
				assert.deepStrictEqual({
					visibleAfterSettingChange: menu.some(item => item.label === 'Manage...'),
					triggers: telemetry.triggers,
				}, {
					visibleAfterSettingChange: remotesEnabled && !manageEnabled,
					triggers: remotesEnabled ? [`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`] : [],
				});
			});
		}
	}
});
