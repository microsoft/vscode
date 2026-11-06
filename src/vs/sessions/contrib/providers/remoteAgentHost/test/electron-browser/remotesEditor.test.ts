/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { EditorInputCapabilities, IVisibleEditorPane } from '../../../../../../workbench/common/editor.js';
import { AICustomizationManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ModelsManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/chatManagement/chatManagementEditorInput.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID, TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID } from '../../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { IsPhoneLayoutContext } from '../../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { Menus } from '../../../../../../workbench/contrib/sessions/browser/menus.js';
import { RemotesEditorInput } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesEditorInput.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind, RemotesModel } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesModel.js';
import { RemotesEditor } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/electron-browser/remotesEditor.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING } from '../../../../../../workbench/contrib/sessions/common/chatConstants.js';
import '../../electron-browser/remotes.contribution.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly environmentsEnabled = observableValue(this, false);
	readonly tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, undefined);
	async signInToTunnels(): Promise<void> { }
	readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, [
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	]);
	readonly refreshTokens: CancellationToken[] = [];
	pendingRefresh: DeferredPromise<readonly RemoteKind[]> | undefined;
	disposed = false;

	async refresh(token: CancellationToken): Promise<readonly RemoteKind[]> {
		this.refreshTokens.push(token);
		return this.pendingRefresh?.p ?? [];
	}

	async setConnected(): Promise<void> { }
	async rename(): Promise<void> { }
	async copyAddress(): Promise<void> { }
	async changePreferredAgentLocation(): Promise<void> { }
	async updateServer(): Promise<void> { }
	async deleteTunnel(): Promise<void> { }
	async deleteSSHHost(): Promise<void> { }
	async remove(): Promise<void> { }
	setHidden(): void { }

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	private readonly onDidChangeStatusEmitter = new Emitter<TunnelStatus>();
	override readonly onDidChangeTunnelStatus = this.onDidChangeStatusEmitter.event;
	override readonly onDidChangeMode = Event.None;
	override async getMode(): Promise<TunnelMode> { return INACTIVE_TUNNEL_MODE; }
	override async getTunnelStatus(): Promise<TunnelStatus> { return { type: 'disconnected' }; }
	override async getTunnelName(): Promise<string | undefined> { return 'my-workstation'; }
	override async stopTunnel(): Promise<void> { }
	fireStatus(status: TunnelStatus): void { this.onDidChangeStatusEmitter.fire(status); }
	dispose(): void { this.onDidChangeStatusEmitter.dispose(); }
}

suite('RemotesEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(initialSettings: Record<string, unknown> = {}) {
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true, [ENVIRONMENT_PICKER_SETTING]: true, ...initialSettings });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = workbenchInstantiationService({ configurationService: () => configuration }, store);
		const telemetry = new TestExperimentTriggerTelemetryService();
		instantiation.stub(ITelemetryService, telemetry);
		instantiation.stub(ISSHRemoteAgentHostService, {});
		instantiation.stub(IPreferencesService, {});
		const tunnel = store.add(new TestRemoteTunnelService());
		instantiation.stub(IRemoteTunnelService, tunnel);
		instantiation.stub(IMissionControlSharingService, new class extends mock<IMissionControlSharingService>() {
			override readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, 'disabled');
			override readonly environmentName = observableValue<string | undefined>(this, undefined);
		}());
		instantiation.stub(IMissionControlAvailabilityService, { available: observableValue('available', true) });
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override async getMissionControlEnvironmentName() { return 'My Workstation (Code - OSS)'; }
		}());
		const model = store.add(new TestRemotesModel());
		instantiation.stubInstance(RemotesModel, model);
		const editor = store.add(instantiation.createInstance(RemotesEditor, new TestEditorGroupView(1)));
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		editor.create(container);
		editor.layout(new dom.Dimension(900, 600));
		const input = store.add(new RemotesEditorInput());
		return { editor, model, container, input, configuration, instantiation, tunnel, telemetry };
	}

	test('uses an independent singleton input that requires a modal', () => {
		const first = store.add(RemotesEditorInput.getOrCreate());
		const same = RemotesEditorInput.getOrCreate();
		first.dispose();
		const second = store.add(RemotesEditorInput.getOrCreate());
		assert.deepStrictEqual({
			name: first.getName(),
			type: first.typeId,
			resource: first.resource,
			singleton: !!(first.capabilities & EditorInputCapabilities.Singleton),
			modal: !!(first.capabilities & EditorInputCapabilities.RequiresModal),
			options: first.getModalEditorOptions(),
			reused: same === first,
			recreated: second !== first,
			matches: first.matches(second),
		}, {
			name: 'Remote Environments', type: 'sessions.input.remotes', resource: undefined,
			singleton: true, modal: true, options: { compactHeader: true, canMoveToEditorArea: false },
			reused: true, recreated: true, matches: true,
		});
	});

	test('uses the same modal contract as Customizations and Language Models', () => {
		const remotes = store.add(new RemotesEditorInput());
		const customizations = store.add(new AICustomizationManagementEditorInput());
		const models = store.add(new ModelsManagementEditorInput());
		assert.deepStrictEqual({
			requiresModal: [remotes, customizations, models].map(input => input.hasCapability(EditorInputCapabilities.RequiresModal)),
			compactOptions: remotes.getModalEditorOptions(),
		}, {
			requiresModal: [true, true, true],
			compactOptions: customizations.getModalEditorOptions(),
		});
	});

	test('accessibility setup help uses the current Dev Tunnels action labels', async () => {
		const { editor, instantiation, input } = createEditor();
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const isVisibleEditor = (pane: RemotesEditor): pane is RemotesEditor & IVisibleEditorPane => pane.input !== undefined;
		assert.ok(isVisibleEditor(editor));
		instantiation.stub(IEditorService, { activeEditorPane: editor });
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'remotes' && implementation.type === AccessibleViewType.Help)!;
		const content = store.add(help.getProvider(instantiation)!).provideContent();
		assert.ok(content.includes('The Dev Tunnels group has an Open Dev Tunnels Settings action.'));
	});

	test('offers the open command in the Command Palette and Sessions overflow only with management, Environment picker, AI and remote gates', () => {
		const menuIds = [MenuId.CommandPalette, Menus.SidebarSessionsHeader];
		const items = menuIds.map(menu => MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter(item => item.command.id === OPEN_REMOTES_EDITOR_COMMAND_ID));
		const enabled: Record<string, boolean> = {
			[ChatContextKeys.enabled.key]: true,
			[`config.${RemoteAgentHostsEnabledSettingId}`]: true,
			[`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`]: true,
			[`config.${ENVIRONMENT_PICKER_SETTING}`]: true,
		};
		const scenarios = [
			enabled,
			...Object.keys(enabled).map(key => ({ ...enabled, [key]: false })),
			{ ...enabled, [IsPhoneLayoutContext.key]: true },
			{},
		];
		assert.deepStrictEqual({
			counts: items.map(entries => entries.length),
			titles: items.map(entries => {
				const title = entries[0]?.command.title;
				return typeof title === 'string' ? title : title?.value;
			}),
			overflowGroup: items[1][0]?.group,
			visibility: scenarios.map(values => items.map(entries => entries[0]?.when?.evaluate({
				getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined,
			}))),
		}, {
			counts: [1, 1],
			titles: ['Manage Remote Environments', 'Manage Remote Environments'],
			overflowGroup: '2_manage',
			visibility: [[true, true], [false, false], [false, false], [false, false], [false, false], [true, false], [false, false]],
		});
	});

	test('This Computer shows how this computer is shared and turns on the chosen connection method', async () => {
		const { editor, container, input, instantiation, tunnel, configuration } = createEditor();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, true);
		const commands: string[] = [];
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string) => {
				commands.push(id);
				tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'my-workstation', isAttached: false }, serviceInstallFailed: false });
				return undefined;
			},
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const section = container.querySelector<HTMLElement>('.remotes-this-computer')!;
		const options = () => [...section.querySelectorAll<HTMLElement>('.monaco-custom-radio > .monaco-button')];
		const read = () => ({
			name: section.querySelector('.remotes-this-computer-name')?.textContent,
			options: options().map(button => button.getAttribute('aria-checked') === 'true' ? `${button.textContent} (selected)` : button.textContent),
			status: section.querySelector('.remotes-this-computer-status')?.textContent,
		});
		const before = read();
		options()[2].click();
		await timeout(0);
		assert.deepStrictEqual({ before, after: read(), commands, accessible: editor.getAccessibilityContent().split('\n\n')[0], optionNames: options().map(button => button.getAttribute('aria-label')) }, {
			before: { name: 'my-workstation', options: ['Off (selected)', 'GitHub Environments (Preview)', 'Dev Tunnels'], status: 'Remote connections are off.' },
			after: { name: 'my-workstation', options: ['Off', 'GitHub Environments (Preview)', 'Dev Tunnels (selected)'], status: 'Remote connections are on via Dev Tunnels.' },
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID],
			accessible: 'This Computer\nSharing name: my-workstation\nRemote connections are on via Dev Tunnels.\nLocal sessions run directly here. Sharing lets other clients access agents and folders on this computer.\nLearn More: https://aka.ms/vscode-agent-environments',
			optionNames: [
				'Off: Only accessible from this machine.',
				'GitHub Environments (Preview): Access agents on this machine from VS Code, vscode.dev/agents, GitHub apps, or github.com/copilot.',
				'Dev Tunnels: Access workspaces and agents on this machine from VS Code or vscode.dev/agents.',
			],
		});
	});

	test('This Computer applies a method chosen while another is still being applied', async () => {
		const { editor, container, input, instantiation, tunnel, configuration } = createEditor();
		await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, true);
		const connected: TunnelStatus = { type: 'connected', info: { tunnelName: 'my-workstation', isAttached: false }, serviceInstallFailed: false };
		let sharing = false;
		let release = new DeferredPromise<void>();
		const commands: string[] = [];
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string) => {
				commands.push(id);
				await release.p;
				sharing = !sharing;
				tunnel.fireStatus(sharing ? connected : { type: 'disconnected' });
				return undefined;
			},
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const section = container.querySelector<HTMLElement>('.remotes-this-computer')!;
		const options = () => [...section.querySelectorAll<HTMLElement>('.monaco-custom-radio > .monaco-button')];
		const option = (label: string) => options().find(button => button.textContent === label)!;
		const selected = () => options().find(button => button.getAttribute('aria-checked') === 'true')?.textContent;
		const status = () => section.querySelector('.remotes-this-computer-status')?.textContent;
		option('Dev Tunnels').click();
		await timeout(0);
		await release.complete();
		release = new DeferredPromise<void>();
		await timeout(0);
		const on = { selected: selected(), status: status() };
		option('Off').click();
		await timeout(0);
		// Choose Dev Tunnels again before turning it off has finished.
		option('Dev Tunnels').click();
		await timeout(0);
		const pending = { selected: selected(), commands: commands.length };
		await release.complete();
		release = new DeferredPromise<void>();
		await timeout(0);
		await release.complete();
		await timeout(0);
		assert.deepStrictEqual({ on, pending, final: { selected: selected(), status: status(), commands: commands.length } }, {
			on: { selected: 'Dev Tunnels', status: 'Remote connections are on via Dev Tunnels.' },
			pending: { selected: 'Dev Tunnels', commands: 2 },
			final: { selected: 'Dev Tunnels', status: 'Remote connections are on via Dev Tunnels.', commands: 3 },
		});
	});

	test('This Computer explains a policy-disabled GitHub Environments option and offers the managed setting', async () => {
		const { editor, container, input, instantiation, configuration } = createEditor();
		await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, true);
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, false);
		const inspect = configuration.inspect.bind(configuration);
		configuration.inspect = <T>(key: string) => key === GitHubEnvironmentsEnabledSettingId ? { ...inspect<T>(key), policyValue: false as T } : inspect<T>(key);
		const opened: unknown[] = [];
		instantiation.stub(IPreferencesService, { openSettings: async (options: unknown) => { opened.push(options); return undefined; } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const section = container.querySelector<HTMLElement>('.remotes-this-computer')!;
		const policy = section.querySelector<HTMLElement>('.remotes-this-computer-policy')!;
		const radio = section.querySelector<HTMLElement>('.monaco-custom-radio')!;
		const github = [...radio.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === 'GitHub Environments (Preview)')!;
		const link = policy.querySelector<HTMLElement>('.monaco-link')!;
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			visible: !policy.hidden,
			text: policy.textContent,
			describes: radio.getAttribute('aria-describedby') === policy.id,
			githubDisabled: github.getAttribute('aria-disabled'),
			linkFocusable: link.tabIndex,
			opened,
			accessible: editor.getAccessibilityContent().includes('GitHub Environments is disabled by your organization. Contact your administrator.'),
		}, {
			visible: true,
			text: 'GitHub Environments is disabled by your organization. Contact your administrator. View Setting',
			describes: true,
			githubDisabled: 'true',
			linkFocusable: 0,
			opened: [{ query: `@id:${GitHubEnvironmentsEnabledSettingId}` }],
			accessible: true,
		});
	});

	test('logs the This Computer experiment trigger in every arm once the editor shows its content', async () => {
		const treatment = `config.${REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING}`;
		const open = async (settings: Record<string, unknown>) => {
			const { editor, input, instantiation, telemetry } = createEditor(settings);
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			const editorTriggers = [...telemetry.triggers];
			const isVisibleEditor = (pane: RemotesEditor): pane is RemotesEditor & IVisibleEditorPane => pane.input !== undefined;
			assert.ok(isVisibleEditor(editor));
			instantiation.stub(IEditorService, { activeEditorPane: editor });
			const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'remotes' && implementation.type === AccessibleViewType.Help)!;
			store.add(help.getProvider(instantiation)!).provideContent();
			return { editor: editorTriggers, withHelp: telemetry.triggers };
		};
		assert.deepStrictEqual({
			control: await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: false }),
			treatment: await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true }),
			editorDisabled: (await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [RemoteAgentHostsEnabledSettingId]: false })).editor,
		}, {
			control: { editor: [treatment], withHelp: [treatment] },
			treatment: { editor: [treatment], withHelp: [treatment] },
			editorDisabled: [],
		});
	});

	test('shows This Computer only while its experimental setting is enabled', async () => {
		const { editor, container, input, configuration } = createEditor();
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const read = () => ({
			hidden: container.querySelector<HTMLElement>('.remotes-editor-this-computer')?.hidden,
			sections: container.querySelectorAll('.remotes-this-computer').length,
			heading: container.querySelector<HTMLElement>('.remotes-heading:not([hidden])')?.textContent,
			region: container.querySelector('.remotes-widget[role="region"]')?.getAttribute('aria-labelledby') === container.querySelector('.remotes-heading-title')?.id,
			accessible: editor.getAccessibilityContent().startsWith('This Computer'),
			accessibleHeading: editor.getAccessibilityContent().includes('\n\nOther Environments\n'),
		});
		const setEnabled = async (enabled: boolean) => {
			await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, enabled);
			configuration.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER, affectedKeys: new Set([REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]),
				change: { keys: [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING], overrides: [] },
				affectsConfiguration: key => key === REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING,
			});
		};
		const initial = read();
		await setEnabled(true);
		const enabled = read();
		await setEnabled(false);
		assert.deepStrictEqual({ initial, enabled, disabled: read() }, {
			initial: { hidden: true, sections: 0, heading: undefined, region: false, accessible: false, accessibleHeading: false },
			enabled: { hidden: false, sections: 1, heading: 'Other Environments', region: true, accessible: true, accessibleHeading: true },
			disabled: { hidden: true, sections: 0, heading: undefined, region: false, accessible: false, accessibleHeading: false },
		});
	});

	test('loads only while visible and cancels discovery when hidden or cleared', async () => {
		const { editor, model, container, input } = createEditor();
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const hiddenRefreshes = model.refreshTokens.length;
		editor.setVisible(true);
		editor.focus();
		const focused = dom.getActiveElement()?.getAttribute('aria-label');
		editor.setVisible(false);
		const canceledWhenHidden = model.refreshTokens[0].isCancellationRequested;
		editor.setVisible(true);
		editor.clearInput();
		await model.pendingRefresh.complete([]);
		await timeout(0);
		assert.deepStrictEqual({
			hiddenRefreshes, focused, canceledWhenHidden,
			canceledWhenCleared: model.refreshTokens[1].isCancellationRequested,
			disposed: model.disposed,
			widgets: container.querySelectorAll('.remotes-widget, .remotes-this-computer').length,
			customizationEditors: container.querySelectorAll('.ai-customization-management-editor').length,
		}, {
			hiddenRefreshes: 0, focused: 'Search remotes', canceledWhenHidden: true,
			canceledWhenCleared: true, disposed: true, widgets: 0, customizationEditors: 0,
		});
	});

	test('disposes the widget when remote hosts are disabled', async () => {
		const { editor, model, container, input, configuration } = createEditor();
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		editor.setVisible(true);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([RemoteAgentHostsEnabledSettingId]),
			change: { keys: [RemoteAgentHostsEnabledSettingId], overrides: [] },
			affectsConfiguration: key => key === RemoteAgentHostsEnabledSettingId,
		});
		const message = container.querySelector<HTMLElement>('.remotes-editor-disabled')!;
		assert.deepStrictEqual({
			disposed: model.disposed,
			widgets: container.querySelectorAll('.remotes-widget').length,
			disabled: !message.hidden,
			text: editor.getAccessibilityContent(),
		}, { disposed: true, widgets: 0, disabled: true, text: 'Remote agent hosts are disabled.' });
	});

	for (const setting of [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING]) {
		test(`disposes an open management widget when ${setting} is disabled`, async () => {
			const { editor, model, container, input, configuration } = createEditor();
			model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			editor.setVisible(true);
			await configuration.setUserConfiguration(setting, false);
			configuration.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER, affectedKeys: new Set([setting]),
				change: { keys: [setting], overrides: [] },
				affectsConfiguration: key => key === setting,
			});
			await model.pendingRefresh.complete([]);
			assert.deepStrictEqual({
				disposed: model.disposed, canceled: model.refreshTokens[0].isCancellationRequested,
				widgets: container.querySelectorAll('.remotes-widget').length, message: editor.getAccessibilityContent(),
			}, { disposed: true, canceled: true, widgets: 0, message: setting === ENVIRONMENT_PICKER_SETTING ? 'The Environment picker is disabled.' : 'Remote Environments management is disabled.' });
		});
	}

	test('Manage routes through the editor service without constructing the Customizations editor', async () => {
		const { instantiation, configuration } = createEditor();
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden: false } });
		const opened: { type: string; options: IEditorOptions | undefined }[] = [];
		instantiation.stub(IEditorService, 'openEditor', async (input: RemotesEditorInput, options?: IEditorOptions) => {
			assert.ok(input instanceof RemotesEditorInput);
			store.add(input);
			opened.push({ type: input.typeId, options });
			return undefined;
		});
		const command = CommandsRegistry.getCommand(OPEN_REMOTES_EDITOR_COMMAND_ID)!;
		await instantiation.invokeFunction(accessor => command.handler(accessor));
		await configuration.setUserConfiguration(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, false);
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /management is disabled/);
		await configuration.setUserConfiguration(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, true);
		await configuration.setUserConfiguration(ENVIRONMENT_PICKER_SETTING, false);
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /Environment picker is disabled/);
		await configuration.setUserConfiguration(ENVIRONMENT_PICKER_SETTING, true);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /disabled/);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden: true } });
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /disabled/);
		assert.deepStrictEqual(opened, [{ type: 'sessions.input.remotes', options: { pinned: true } }]);
	});
});
