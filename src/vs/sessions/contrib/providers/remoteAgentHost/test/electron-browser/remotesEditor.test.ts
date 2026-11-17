/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Color } from '../../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsSettingId, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IInputOptions, IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { EditorInputCapabilities, IVisibleEditorPane } from '../../../../../../workbench/common/editor.js';
import { AICustomizationManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ModelsManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/chatManagement/chatManagementEditorInput.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { executeToggleRemoteConnections } from '../../../../../../workbench/contrib/chat/electron-browser/tunnelHost.contribution.js';
import { RemoteTunnelCommandIds } from '../../../../../../workbench/contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ColorThemeData } from '../../../../../../workbench/services/themes/common/colorThemeData.js';
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
	async setSharedAsGitHubEnvironment(): Promise<void> { }
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
	name = 'my-workstation';
	private readonly onDidChangeStatusEmitter = new Emitter<TunnelStatus>();
	override readonly onDidChangeTunnelStatus = this.onDidChangeStatusEmitter.event;
	override readonly onDidChangeMode = Event.None;
	override async getMode(): Promise<TunnelMode> { return INACTIVE_TUNNEL_MODE; }
	private status: TunnelStatus = { type: 'disconnected' };
	override async getTunnelStatus(): Promise<TunnelStatus> { return this.status; }
	override async getTunnelName(): Promise<string | undefined> { return this.name; }
	override async stopTunnel(): Promise<void> { }
	fireStatus(status: TunnelStatus): void {
		this.status = status;
		this.onDidChangeStatusEmitter.fire(status);
	}
	dispose(): void { this.onDidChangeStatusEmitter.dispose(); }
}

suite('RemotesEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(initialSettings: Record<string, unknown> = {}) {
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true, [ENVIRONMENT_PICKER_SETTING]: true, ...initialSettings });
		configuration.updateValue = async (key, value) => configuration.setUserConfiguration(key, value);
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = workbenchInstantiationService({ configurationService: () => configuration }, store);
		const telemetry = new TestExperimentTriggerTelemetryService();
		instantiation.stub(ITelemetryService, telemetry);
		instantiation.stub(ISSHRemoteAgentHostService, {});
		instantiation.stub(IPreferencesService, {});
		const tunnel = store.add(new TestRemoteTunnelService());
		instantiation.stub(IRemoteTunnelService, tunnel);
		const sharing = new class extends mock<IMissionControlSharingService>() {
			override readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, 'disabled');
			override readonly environmentName = observableValue<string | undefined>(this, undefined);
			override async setEnvironmentName(name: string): Promise<void> { this.environmentName.set(name.trim(), undefined); }
		}();
		instantiation.stub(IMissionControlSharingService, sharing);
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
		return { editor, model, container, input, configuration, instantiation, tunnel, telemetry, sharing };
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

	test('sharing expands inline and changes nothing until confirmed', async () => {
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
		section.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const table = container.querySelector<HTMLElement>('.remotes-editor-table')!;
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const before = { commands: commands.length, pageVisible: !page.hidden, tableHidden: table.hidden };
		container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			before, commands, pageHidden: page.hidden, tableVisible: !table.hidden,
			status: section.querySelector('.remotes-this-computer-status [role="status"]')?.textContent,
			focusRestored: dom.getActiveElement() === section.querySelector('.remotes-this-computer-share .monaco-dropdown-button'),
			descriptions: page.querySelectorAll('.remotes-sharing-choice-description').length,
			accessible: editor.getAccessibilityContent().includes('Sharing via Dev Tunnel'),
		}, {
			before: { commands: 0, pageVisible: true, tableHidden: false },
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID],
			pageHidden: true, tableVisible: true, status: 'Sharing via Dev Tunnel', focusRestored: true, descriptions: 2, accessible: true,
		});
	});

	test('guided sharing prevents duplicate application and retains the selected card while busy', async () => {
		const { editor, container, input, instantiation, tunnel, configuration } = createEditor();
		await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, true);
		const connected: TunnelStatus = { type: 'connected', info: { tunnelName: 'my-workstation', isAttached: false }, serviceInstallFailed: false };
		const release = new DeferredPromise<void>();
		const commands: string[] = [];
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string) => {
				commands.push(id);
				await release.p;
				tunnel.fireStatus(connected);
				return undefined;
			},
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const section = container.querySelector<HTMLElement>('.remotes-this-computer')!;
		section.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const apply = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		apply.click();
		apply.click();
		await timeout(0);
		const pending = {
			commands: commands.length, busy: page.getAttribute('aria-busy'),
			selected: page.querySelector('[aria-checked="true"]')?.getAttribute('data-sharing-method'),
			cancelDisabled: container.querySelector('.remotes-sharing-footer .secondary')?.getAttribute('aria-disabled'),
		};
		await release.complete();
		await timeout(0);
		assert.deepStrictEqual({ pending, closed: page.hidden, commands: commands.length }, {
			pending: { commands: 1, busy: 'true', selected: 'devTunnel', cancelDisabled: 'true' },
			closed: true, commands: 1,
		});
	});

	test('Cancel and Escape discard the sharing choice and restore focus without changing sharing', async () => {
		const { editor, container, input, instantiation } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async (id: string) => { commands.push(id); return undefined; } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const share = container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!;
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const states = [];
		for (const close of ['cancel', 'escape']) {
			share.click();
			states.push({
				selected: page.querySelectorAll('[aria-checked="true"]').length,
				disabled: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')!.getAttribute('aria-disabled'),
			});
			page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
			if (close === 'escape') {
				page.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			} else {
				container.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
			}
			states.push({ closed: page.hidden, focused: dom.getActiveElement() === share });
		}
		assert.deepStrictEqual({ states, commands }, {
			states: [
				{ selected: 0, disabled: 'true' }, { closed: true, focused: true },
				{ selected: 0, disabled: 'true' }, { closed: true, focused: true },
			],
			commands: [],
		});
	});

	test('failed sharing retains the draft and exposes feedback and the sharing log', async () => {
		const { editor, container, input, instantiation, tunnel } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const errors: string[] = [];
		const commands: string[] = [];
		let fail = true;
		instantiation.stub(INotificationService, 'error', (error: Error) => { errors.push(error.message); });
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string) => {
				commands.push(id);
				if (id === TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID) {
					if (fail) {
						throw new Error('Connection failed');
					}
					tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'my-workstation', isAttached: false }, serviceInstallFailed: false });
				}
			},
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const apply = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		apply.click();
		await timeout(0);
		const feedback = container.querySelector<HTMLElement>('.remotes-sharing-feedback')!;
		const failed = { visible: !page.hidden, feedback: feedback.textContent, retryDisabled: apply.getAttribute('aria-disabled'), described: apply.getAttribute('aria-describedby') === feedback.id };
		container.querySelector<HTMLElement>('.remotes-sharing-feedback-container .monaco-link')!.click();
		await timeout(0);
		fail = false;
		apply.click();
		await timeout(0);
		assert.deepStrictEqual({ failed, errors, commands, closed: page.hidden }, {
			failed: { visible: true, feedback: 'Sharing via Dev Tunnel didn\'t start. Open the sharing log for details, then try again. Connection failed', retryDisabled: 'false', described: true },
			errors: ['Connection failed'],
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID, 'workbench.action.closeModalEditor', 'workbench.remoteTunnel.actions.showLog', TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID],
			closed: true,
		});
	});

	test('canceling sign-in keeps the sharing draft without reporting a failure', async () => {
		const { editor, container, input, instantiation } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const commands: string[] = [];
		const errors: Error[] = [];
		instantiation.stub(INotificationService, 'error', (error: Error) => { errors.push(error); });
		instantiation.stub(ICommandService, {}, 'executeCommand', async (id: string) => {
			commands.push(id);
			if (id === TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID) {
				return instantiation.invokeFunction(executeToggleRemoteConnections);
			}
			assert.strictEqual(id, RemoteTunnelCommandIds.turnOn);
			throw new CancellationError();
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const start = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		start.click();
		await timeout(0);
		assert.deepStrictEqual({
			expanded: !container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
			feedbackHidden: container.querySelector<HTMLElement>('.remotes-sharing-feedback-container')!.hidden,
			selected: container.querySelector('[data-sharing-method="devTunnel"]')!.getAttribute('aria-checked'),
			retryDisabled: start.getAttribute('aria-disabled'), focusRestored: dom.getActiveElement() === start, commands, errors,
		}, {
			expanded: true, feedbackHidden: true, selected: 'true', retryDisabled: 'false', focusRestored: true,
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID, RemoteTunnelCommandIds.turnOn], errors: [],
		});
	});

	test('sharing cards expose their explanations and arrow keys select only a draft', async () => {
		const { editor, container, input, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const github = container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!;
		const tunnel = container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!;
		const points = [...container.querySelectorAll('.remotes-sharing-choice-description li, .remotes-sharing-choice-detail')].map(point => point.textContent!);
		github.focus();
		github.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			points, focused: dom.getActiveElement() === tunnel, selected: tunnel.getAttribute('aria-checked'),
			accessible: points.every(point => editor.getAccessibilityContent().includes(point)),
			unchanged: configuration.getValue(AgentHostRemoteConnectionsSettingId),
		}, {
			points: [
				'Connect from VS Code, the browser-based Agents window, or supported Copilot clients',
				'Make this computer discoverable through your GitHub account',
				'GitHub stores session actions for history. Conversation content isn\'t end-to-end encrypted.',
				'Connect from VS Code or the browser-based Agents window',
				'Connect with the GitHub account used to share this computer',
			],
			focused: true, selected: 'true', accessible: true, unchanged: undefined,
		});
	});

	test('the pencil renames the selected method without starting sharing', async () => {
		const { editor, container, input, instantiation, sharing, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		const prompts: string[] = [];
		instantiation.stub(IQuickInputService, {
			input: async (options: IInputOptions) => { prompts.push(options.value ?? ''); return 'Studio workstation'; },
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		container.querySelector<HTMLElement>('.remotes-this-computer-rename .action-label')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			prompts, renamed: sharing.environmentName.get(), displayed: container.querySelector('.remotes-this-computer-name')?.textContent,
			unchanged: configuration.getValue(AgentHostRemoteConnectionsSettingId), state: sharing.state.get(),
		}, { prompts: ['My Workstation (Code - OSS)'], renamed: 'Studio workstation', displayed: 'Studio workstation', unchanged: undefined, state: 'disabled' });
	});

	test('sharing selection indicators contrast with their composited surface in all theme types', async () => {
		const { editor, container, input } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		container.style.setProperty('--vscode-spacing-size120', '12px');
		container.style.setProperty('--vscode-strokeThickness', '1px');
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const choices = [...container.querySelectorAll<HTMLElement>('.remotes-sharing-choices [role="radio"]')];
		const targetWindow = dom.getWindow(container);
		const results = ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(selector => {
			const theme = ColorThemeData.createUnloadedTheme(selector);
			const surface = theme.getColor('editorWidget.background')!;
			for (const id of ['radio.activeForeground', 'radio.activeBackground', 'radio.activeBorder', 'radio.inactiveForeground', 'radio.inactiveBackground', 'radio.inactiveBorder']) {
				container.style.setProperty(`--vscode-${id.replace('.', '-')}`, theme.getColor(id)?.toString() ?? 'transparent');
			}
			return choices.map(choice => {
				choice.click();
				const style = targetWindow.getComputedStyle(choice);
				const ring = targetWindow.getComputedStyle(choice, '::before');
				const dot = targetWindow.getComputedStyle(choice, '::after');
				const background = Color.Format.CSS.parse(style.backgroundColor)!.makeOpaque(surface);
				const indicator = Color.Format.CSS.parse(dot.backgroundColor)!.makeOpaque(background);
				return {
					ring: ring.content !== 'none' && parseFloat(ring.borderTopWidth) > 0,
					selectedDot: dot.content !== 'none' && dot.visibility === 'visible' && parseFloat(dot.width) > 0,
					contrast: indicator.getContrastRatio(background) >= 3,
				};
			});
		});
		assert.deepStrictEqual(results, Array.from({ length: 4 }, () => choices.map(() => ({ ring: true, selectedDot: true, contrast: true }))));
	});

	test('inline choices keep the environment list reachable in a short narrow editor', async () => {
		const { editor, container, input } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		for (const size of [40, 60, 80, 120, 160, 200, 240, 320, 360]) {
			container.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
		}
		container.style.width = '360px';
		editor.layout(new dom.Dimension(360, 320));
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const content = container.querySelector<HTMLElement>('.remotes-editor-content')!;
		content.scrollTop = content.scrollHeight;
		const host = content.getBoundingClientRect();
		const search = container.querySelector('.remotes-search-row')!.getBoundingClientRect();
		assert.deepStrictEqual({
			scrolls: content.scrollTop > 0,
			searchReachable: search.top >= host.top && search.bottom <= host.bottom,
			noHorizontalOverflow: content.scrollWidth <= content.clientWidth,
		}, { scrolls: true, searchReachable: true, noHorizontalOverflow: true });
	});

	test('invalid tunnel names remain visible and prevent starting sharing', async () => {
		const { editor, container, input, tunnel } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		tunnel.name = 'Invalid tunnel name';
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		assert.deepStrictEqual({
			name: container.querySelector('.remotes-this-computer-name')?.textContent,
			disabled: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
			errorVisible: !container.querySelector<HTMLElement>('.remotes-sharing-feedback-container')!.hidden,
			error: container.querySelector('.remotes-sharing-feedback')?.textContent,
		}, {
			name: 'Invalid tunnel name', disabled: 'true', errorVisible: true,
			error: 'The name must only consist of letters, numbers, underscore and dash. It must not start with a dash.',
		});
	});

	test('active sharing can be stopped while connecting and stale method-switch actions respect policy', async () => {
		const { editor, container, input, instantiation, tunnel, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		let actions: readonly IAction[] = [];
		instantiation.stub(IContextMenuService, { showContextMenu: delegate => { actions = delegate.getActions?.() ?? []; } });
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async (id: string) => { commands.push(id); tunnel.fireStatus({ type: 'disconnected' }); } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-dropdown-button')!.click();
		const labels = actions.map(action => action.label);
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, false);
		await actions[0].run();
		const blocked = { commands: commands.length, method: configuration.getValue(AgentHostRemoteConnectionsSettingId) };
		tunnel.fireStatus({ type: 'connecting' });
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button-dropdown .monaco-text-button')!.click();
		await timeout(0);
		assert.deepStrictEqual({ labels, blocked, commands, status: container.querySelector('.remotes-this-computer-status [role="status"]')?.textContent }, {
			labels: ['Share via GitHub Environment (Preview)'], blocked: { commands: 0, method: undefined },
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID], status: 'Not shared',
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
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const policy = container.querySelector<HTMLElement>('.remotes-sharing-policy')!;
		const radio = container.querySelector<HTMLElement>('.remotes-sharing-choices')!;
		const github = radio.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!;
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
			accessible: editor.getAccessibilityContent().includes('Sharing through GitHub Environments is disabled by your organization. Contact your administrator.'),
		}, {
			visible: true,
			text: 'Sharing through GitHub Environments is disabled by your organization. Contact your administrator. View Setting',
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
			accessible: editor.getAccessibilityContent().startsWith('This computer'),
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

	test('disabled explanations stay inside the editor in both sharing-section arms', async () => {
		const results = [];
		for (const sharingEnabled of [false, true]) {
			for (const gate of [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, RemoteAgentHostsEnabledSettingId, 'chat.disableAIFeatures']) {
				const { editor, container, input, configuration } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: sharingEnabled });
				await editor.setInput(input, undefined, {}, CancellationToken.None);
				await configuration.setUserConfiguration(gate, gate === 'chat.disableAIFeatures');
				configuration.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER, affectedKeys: new Set([gate]),
					change: { keys: [gate], overrides: [] }, affectsConfiguration: key => key === gate,
				});
				const message = container.querySelector<HTMLElement>('.remotes-editor-disabled')!;
				const host = container.querySelector('.remotes-editor')!.getBoundingClientRect();
				const bounds = message.getBoundingClientRect();
				results.push({
					wrapperHidden: container.querySelector<HTMLElement>('.remotes-editor > .monaco-scrollable-element')!.hidden,
					messageVisible: !message.hidden && bounds.height > 0 && bounds.top >= host.top && bounds.bottom <= host.bottom,
				});
			}
		}
		assert.deepStrictEqual(results, Array.from({ length: 8 }, () => ({ wrapperHidden: true, messageVisible: true })));
	});

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
