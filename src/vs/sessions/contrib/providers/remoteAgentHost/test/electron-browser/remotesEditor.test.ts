/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { AnchorAlignment } from '../../../../../../base/browser/ui/contextview/contextview.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Color } from '../../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isWindows } from '../../../../../../base/common/platform.js';
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
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { getIconsStyleSheet } from '../../../../../../platform/theme/browser/iconsStyleSheet.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { EditorInputCapabilities, IVisibleEditorPane } from '../../../../../../workbench/common/editor.js';
import { AICustomizationManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ModelsManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/chatManagement/chatManagementEditorInput.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { ColorThemeData } from '../../../../../../workbench/services/themes/common/colorThemeData.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID, TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID } from '../../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { IsPhoneLayoutContext } from '../../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { Menus } from '../../../../../../workbench/contrib/sessions/browser/menus.js';
import { RemotesEditorInput } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesEditorInput.js';
import { ICustomizationRemote, IRemotesModel, IRemoteTroubleshootingInfo, RemoteKind, RemotesModel } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesModel.js';
import { RemotesEditor } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/electron-browser/remotesEditor.js';
import { RemoteTunnelCommandIds } from '../../../../../../workbench/contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING, REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING } from '../../../../../../workbench/contrib/sessions/common/chatConstants.js';
import '../../electron-browser/remotes.contribution.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly onDidChangeTroubleshootingInfo = Event.None;
	readonly environmentsEnabled = observableValue(this, false);
	readonly canCreateDevContainer = observableValue(this, false);
	readonly tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, undefined);
	async signInToTunnels(): Promise<void> { }
	readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, [
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected },
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
	getPreferredAgentLocation(): undefined { return undefined; }
	async changePreferredAgentLocation(): Promise<undefined> { return undefined; }
	async updateServer(): Promise<void> { }
	async setSharedAsGitHubEnvironment(): Promise<void> { }
	async deleteTunnel(): Promise<void> { }
	async deleteSSHHost(): Promise<void> { }
	async createDevContainer(): Promise<void> { }
	async deleteDevContainer(): Promise<void> { }
	async remove(): Promise<void> { }
	setHidden(): void { }
	async getTroubleshootingInfo(): Promise<IRemoteTroubleshootingInfo> { return {}; }
	async forgetSSHHostKey(): Promise<void> { }
	async restartWSLDistribution(): Promise<void> { }
	async showConnectionLog(): Promise<void> { }

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

	function createEditor(initialSettings: Record<string, unknown> = {}, existingInput?: RemotesEditorInput) {
		// Most tests cover the sharing setup; the segmented control suite opts out.
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true, [ENVIRONMENT_PICKER_SETTING]: true, [REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING]: true, ...initialSettings });
		configuration.updateValue = async (key, value) => configuration.setUserConfiguration(key, value);
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = workbenchInstantiationService({ configurationService: () => configuration }, store);
		let menuActions: readonly IAction[] = [];
		let menuAnchor: HTMLElement | undefined;
		let menuAlignment: AnchorAlignment | undefined;
		instantiation.stub(IContextMenuService, {
			showContextMenu: delegate => {
				menuActions = delegate.getActions?.() ?? [];
				const anchor = delegate.getAnchor();
				menuAnchor = dom.isHTMLElement(anchor) ? anchor : undefined;
				menuAlignment = delegate.anchorAlignment;
			}
		});
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
		const input = existingInput ?? store.add(new RemotesEditorInput());
		return { editor, model, container, input, configuration, instantiation, tunnel, telemetry, sharing, menuActions: () => menuActions, menuPlacement: () => ({ anchor: menuAnchor, alignment: menuAlignment }) };
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

	test('accessibility help describes focused settings and connection failures rather than removed type groups', async () => {
		const { editor, instantiation, input } = createEditor();
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const isVisibleEditor = (pane: RemotesEditor): pane is RemotesEditor & IVisibleEditorPane => pane.input !== undefined;
		assert.ok(isVisibleEditor(editor));
		instantiation.stub(IEditorService, { activeEditorPane: editor });
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'remotes' && implementation.type === AccessibleViewType.Help)!;
		const content = store.add(help.getProvider(instantiation)!).provideContent();
		assert.deepStrictEqual({
			runBehavior: content.includes('Configure Agent Run Behavior'),
			runBehaviorExplained: ['tasks you want to leave running', 'when available', 'If a Dev Tunnel is shared', 'Existing sessions are not moved'].every(explanation => content.includes(explanation)),
			removalActions: ['Remove Environment', 'Forget SSH Connection', 'Delete Dev Tunnel'].every(label => content.includes(label)),
			connectionFailures: ['a notification shows the error', 'Connect action shows a warning', 'select Connect to try again'].every(explanation => content.includes(explanation)),
			oldGroupSettings: content.includes('The Dev Tunnels group has an Open Dev Tunnels Settings action.'),
		}, { runBehavior: true, runBehaviorExplained: true, removalActions: true, connectionFailures: true, oldGroupSettings: false });
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
		assert.deepStrictEqual({
			status: section.querySelector('[role="status"]')?.textContent,
			statusIconHidden: section.querySelector<HTMLElement>('.remotes-sharing-status-icon')?.hidden,
		}, { status: 'Not shared', statusIconHidden: true });
		section.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const table = container.querySelector<HTMLElement>('.remotes-editor-table')!;
		const defaultChoice = page.querySelector('[aria-checked="true"]')?.getAttribute('data-sharing-method');
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const before = { commands: commands.length, pageVisible: !page.hidden, tableHidden: table.hidden };
		container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			before, defaultChoice, commands, pageHidden: page.hidden, tableVisible: !table.hidden,
			status: section.querySelector('.remotes-this-computer-status [role="status"]')?.textContent,
			focusRestored: dom.getActiveElement() === section.querySelector('.remotes-this-computer-share .monaco-dropdown-button'),
			descriptions: page.querySelectorAll('.remotes-sharing-choice-description').length,
		}, {
			before: { commands: 0, pageVisible: true, tableHidden: false },
			defaultChoice: 'githubEnvironment',
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID],
			pageHidden: true, tableVisible: true, status: 'Sharing via Dev Tunnel', focusRestored: true, descriptions: 2,
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
				tunnel.fireStatus(connected);
				await release.p;
				return undefined;
			},
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const section = container.querySelector<HTMLElement>('.remotes-this-computer')!;
		section.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const apply = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		apply.click();
		apply.click();
		await timeout(0);
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const pending = {
			commands: commands.length, busy: page.getAttribute('aria-busy'),
			selected: page.querySelector('[aria-checked="true"]')?.getAttribute('data-sharing-method'),
			cancelDisabled: container.querySelector('.remotes-sharing-footer .secondary')?.getAttribute('aria-disabled'),
			label: apply.textContent,
		};
		await release.complete();
		await timeout(0);
		assert.deepStrictEqual({ pending, closed: page.hidden, commands: commands.length }, {
			pending: { commands: 1, busy: 'true', selected: 'devTunnel', cancelDisabled: 'true', label: 'Start Sharing' },
			closed: true, commands: 1,
		});
	});

	test('Cancel and Escape discard the sharing choice and restore the collapsed summary', async () => {
		const { editor, container, input, instantiation } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async (id: string) => { commands.push(id); return undefined; } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const share = container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!;
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const states: { selected: number; enabled: string | null; label: string | null; shareHidden: boolean; off: boolean; bullets: number }[] = [];
		for (const close of ['cancel', 'escape']) {
			share.click();
			const start = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
			states.push({
				selected: page.querySelectorAll('[aria-checked="true"]').length,
				enabled: start.getAttribute('aria-disabled'), label: start.textContent,
				shareHidden: share.hidden === true, off: !!page.querySelector('[data-sharing-method="off"]'),
				bullets: page.querySelectorAll('.remotes-sharing-choice-description li').length,
			});
			page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
			if (close === 'escape') {
				page.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			} else {
				container.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
			}
			assert.ok(page.hidden);
		}
		assert.deepStrictEqual({ commands, states, restored: !share.hidden && dom.getActiveElement() === share }, {
			commands: [],
			states: [
				{ selected: 1, enabled: 'false', label: 'Start Sharing', shareHidden: true, off: false, bullets: 2 },
				{ selected: 1, enabled: 'false', label: 'Start Sharing', shareHidden: true, off: false, bullets: 2 },
			],
			restored: true,
		});
	});

	test('the active sharing name offers a pencil that renames the active registration', async () => {
		const { editor, container, input, instantiation, tunnel, configuration } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const prompts: (IInputOptions | undefined)[] = [];
		configuration.updateValue = async (key, value) => {
			await configuration.setUserConfiguration(key, value);
			if (key === CONFIGURATION_KEY_HOST_NAME && typeof value === 'string') {
				tunnel.name = value;
				tunnel.fireStatus({ type: 'connected', info: { tunnelName: value, isAttached: false }, serviceInstallFailed: false });
			}
		};
		instantiation.stub(IQuickInputService, {
			input: async options => {
				prompts.push(options);
				return 'renamed-computer';
			}
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const rename = container.querySelector<HTMLElement>('.remotes-this-computer-rename')!;
		const hiddenBeforeSharing = rename.hidden;
		tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'my-workstation', isAttached: false }, serviceInstallFailed: false });
		const offeredWhileSharing = !rename.hidden;
		rename.querySelector<HTMLElement>('.action-label')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			hiddenBeforeSharing, offeredWhileSharing,
			prompt: prompts.map(prompt => ({ title: prompt?.title, value: prompt?.value })),
			configuredName: configuration.getValue(CONFIGURATION_KEY_HOST_NAME),
			standardToolbar: !!rename.querySelector('.monaco-toolbar .action-label.codicon-edit'),
		}, {
			hiddenBeforeSharing: false, offeredWhileSharing: true,
			prompt: [{ title: 'Rename Tunnel', value: 'my-workstation' }],
			configuredName: 'renamed-computer',
			standardToolbar: true,
		});
	});

	for (const method of ['devTunnel', 'githubEnvironment'] as const) {
		test(`sharing offers rename without an unusable copy action (${method})`, async () => {
			const { editor, container, input, tunnel, sharing } = createEditor({
				[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true,
				[AgentHostRemoteConnectionsSettingId]: method,
			});
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			const toolbar = container.querySelector<HTMLElement>('.remotes-this-computer-rename')!;
			if (method === 'githubEnvironment') {
				sharing.environmentName.set('Shared computer', undefined);
				sharing.state.set('enabled', undefined);
			} else {
				tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared-computer', isAttached: false }, serviceInstallFailed: false });
			}
			await timeout(0);
			assert.deepStrictEqual({
				visible: !toolbar.hidden,
				actions: [...toolbar.querySelectorAll('.action-label')].map(element => element.getAttribute('aria-label')),
			}, { visible: true, actions: ['Change Sharing Name'] });
		});
	}

	for (const method of ['devTunnel', 'githubEnvironment'] as const) {
		test(`starting ${method} preserves the existing name configuration when sign-in is canceled`, async () => {
			const { editor, container, input, instantiation, configuration, sharing } = createEditor({
				[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
			});
			const updates: string[] = [];
			configuration.updateValue = async (key, value) => {
				updates.push(key);
				await configuration.setUserConfiguration(key, value);
			};
			instantiation.stub(ICommandService, {}, 'executeCommand', async () => 'canceled');
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
			container.querySelector<HTMLElement>(`[data-sharing-method="${method}"]`)!.click();
			container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
			await timeout(0);
			assert.deepStrictEqual({
				override: configuration.getValue(CONFIGURATION_KEY_HOST_NAME), environmentName: sharing.environmentName.get(),
				updates, expanded: !container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
				feedback: container.querySelector('.remotes-sharing-feedback')?.textContent,
			}, { override: undefined, environmentName: undefined, updates: method === 'devTunnel' ? [] : [AgentHostRemoteConnectionsSettingId], expanded: true, feedback: '' });
		});

		for (const otherOutcome of ['pending', 'failed'] as const) {
			test(`${method} becomes ready independently when the other name lookup is ${otherOutcome}`, async () => {
				const { editor, container, input, instantiation, tunnel } = createEditor({
					[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
				});
				const pendingName = new DeferredPromise<string | undefined>();
				const errors: Error[] = [];
				instantiation.stub(INotificationService, 'error', (error: Error) => { errors.push(error); });
				instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
					override async getMissionControlEnvironmentName() {
						return method === 'githubEnvironment' ? 'Available environment' : pendingName.p;
					}
				}());
				tunnel.getTunnelName = async () => method === 'devTunnel' ? 'available-tunnel' : pendingName.p;
				await editor.setInput(input, undefined, {}, CancellationToken.None);
				if (otherOutcome === 'failed') {
					await pendingName.error(new Error('Name lookup failed'));
				}
				await timeout(0);
				container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
				container.querySelector<HTMLElement>(`[data-sharing-method="${method}"]`)!.click();
				assert.deepStrictEqual({
					name: container.querySelector('.remotes-this-computer-name')?.textContent,
					startDisabled: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
					errors: errors.map(error => error.message),
				}, {
					name: method === 'devTunnel' ? 'available-tunnel' : 'Available environment', startDisabled: 'false',
					errors: otherOutcome === 'failed' ? ['Name lookup failed'] : [],
				});
				editor.dispose();
				if (otherOutcome === 'pending') {
					await pendingName.complete('Late name');
				}
				await timeout(0);
			});
		}
	}

	test('reopening management after diagnostics restores the sharing draft and failure', async () => {
		const firstInput = store.add(RemotesEditorInput.getOrCreate());
		const first = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true }, firstInput);
		const commands: string[] = [];
		first.instantiation.stub(INotificationService, 'error', () => { });
		first.instantiation.stub(ICommandService, {}, 'executeCommand', async (id: string) => {
			commands.push(id);
			if (id === TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID) {
				throw new Error('Connection failed');
			}
			if (id === 'workbench.action.closeModalEditor') {
				first.editor.clearInput();
				first.editor.dispose();
				firstInput.dispose();
			}
		});
		await first.editor.setInput(firstInput, undefined, {}, CancellationToken.None);
		await timeout(0);
		first.container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		first.container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		first.container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		first.container.querySelector<HTMLElement>('.remotes-sharing-feedback-container .monaco-link')!.click();
		await timeout(0);
		const reopenedInput = store.add(RemotesEditorInput.getOrCreate());
		const reopened = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true }, reopenedInput);
		await reopened.editor.setInput(reopenedInput, undefined, {}, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({
			recreatedInput: reopenedInput !== firstInput,
			expanded: !reopened.container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
			selected: reopened.container.querySelector('[aria-checked="true"]')?.getAttribute('data-sharing-method'),
			feedback: reopened.container.querySelector('.remotes-sharing-feedback')?.textContent,
			retryDisabled: reopened.container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
			consumed: reopenedInput.sharingState === undefined, commands,
		}, {
			recreatedInput: true, expanded: true, selected: 'devTunnel',
			feedback: 'Sharing via Dev Tunnel didn\'t start. Open the sharing log for details, then try again. Connection failed',
			retryDisabled: 'false', consumed: true,
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID, 'workbench.action.closeModalEditor', RemoteTunnelCommandIds.showLog],
		});
	});

	for (const width of [900, 360]) {
		for (const expanded of [true, false]) {
			test(`sharing feedback retains controls through pending, failure and retry at width ${width}, expanded=${expanded}`, async () => {
				const { editor, container, input, instantiation, tunnel } = createEditor({
					[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
				});
				for (const size of [40, 60, 80, 120, 160, 200, 240, 320, 360]) {
					container.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
				}
				container.style.setProperty('--vscode-codiconFontSize', '16px');
				dom.append(container, dom.$('style')).textContent = store.add(getIconsStyleSheet(undefined)).getCSS().toString();
				container.style.width = `${width}px`;
				editor.layout(new dom.Dimension(width, 600));
				let pending = new DeferredPromise<void>();
				instantiation.stub(INotificationService, 'error', () => { });
				instantiation.stub(ICommandService, {
					executeCommand: async () => {
						await pending.p;
						if (expanded) {
							tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
						} else {
							tunnel.fireStatus({ type: 'disconnected' });
						}
					}
				});
				await editor.setInput(input, undefined, {}, CancellationToken.None);
				await timeout(0);
				if (expanded) {
					container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
					container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
				} else {
					tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
				}
				const selector = expanded ? '.remotes-sharing-footer .monaco-button:not(.secondary)' : '.remotes-this-computer-share .monaco-button-dropdown .monaco-text-button:not(.monaco-dropdown-button)';
				const control = container.querySelector<HTMLElement>(selector)!;
				control.focus();
				const geometry = () => [selector, expanded ? '.remotes-sharing-help' : '.remotes-editor-table'].map(selector => {
					const rect = container.querySelector(selector)!.getBoundingClientRect();
					return [rect.x, rect.y, rect.width, rect.height];
				});
				const before = geometry();
				control.click();
				const during = geometry();
				await pending.error(new Error('Connection failed'));
				await timeout(0);
				const failed = geometry();
				const error = container.querySelector('.remotes-sharing-feedback')?.textContent;
				pending = new DeferredPromise<void>();
				control.click();
				const retry = geometry();
				await pending.error(new Error('Connection failed'));
				await timeout(0);
				const retried = geometry();
				const focused = dom.getActiveElement() === control;
				pending = new DeferredPromise<void>();
				control.click();
				const finalPending = geometry();
				await pending.complete();
				await timeout(0);
				assert.deepStrictEqual({
					during, controlAfterFailure: failed[0], retry, retried, finalPending,
					focused, same: control === container.querySelector(selector), actionable: error?.includes('Open the sharing log'),
					completed: container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
					errorCleared: container.querySelector<HTMLElement>('.remotes-sharing-feedback-container')!.hidden,
				}, {
					during: before, controlAfterFailure: before[0], retry: failed, retried: failed, finalPending: failed,
					focused: true, same: true, actionable: true, completed: true, errorCleared: true,
				});
			});
		}
	}

	test('failed sharing stays on the page with explicit feedback and can be retried', async () => {
		const { editor, container, input, instantiation } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		const errors: unknown[] = [];
		const commands: string[] = [];
		instantiation.stub(INotificationService, 'error', (error: unknown) => { errors.push(error); });
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string) => {
				commands.push(id);
				if (id === TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID) {
					throw new Error('Connection failed');
				}
			}
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const apply = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		const feedback = container.querySelector<HTMLElement>('.remotes-sharing-feedback')!;
		apply.click();
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-sharing-feedback-container .monaco-link')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			visible: !page.hidden, errors: errors.length,
			feedback: container.querySelector('.remotes-sharing-feedback')?.textContent,
			retry: apply.getAttribute('aria-disabled'),
			feedbackAfterActions: !!(apply.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING),
			feedbackDescribesAction: apply.getAttribute('aria-describedby')?.split(' ').includes(feedback.id),
			commands,
		}, {
			visible: true, errors: 1, feedback: 'Sharing via Dev Tunnel didn\'t start. Open the sharing log for details, then try again. Connection failed', retry: 'false',
			feedbackAfterActions: true, feedbackDescribesAction: true,
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID, 'workbench.action.closeModalEditor', 'workbench.remoteTunnel.actions.showLog'],
		});
		page.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		assert.ok(container.querySelector<HTMLElement>('.remotes-sharing-feedback-container')!.hidden);
	});

	test('Stop Sharing can stop a connection that is still starting without an Off option', async () => {
		const { editor, container, input, instantiation, tunnel } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const commands: string[] = [];
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string) => {
				commands.push(id);
				tunnel.fireStatus({ type: 'disconnected' });
				return undefined;
			}
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		tunnel.fireStatus({ type: 'connecting' });
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-dropdown-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const stop = container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button-dropdown .monaco-text-button')!;
		const before = { label: stop.textContent, disabled: stop.getAttribute('aria-disabled') };
		stop.click();
		await timeout(0);
		assert.deepStrictEqual({ before, commands, closed: page.hidden }, {
			before: { label: 'Stop Sharing', disabled: 'false' },
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID], closed: true,
		});
	});

	test('active sharing offers a direct mode switch without reopening the guided page', async () => {
		const { editor, container, input, instantiation, tunnel, menuActions, menuPlacement, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async (id: string) => { commands.push(id); return undefined; } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-dropdown-button')!.click();
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const before = {
			labels: menuActions().map(action => action.label), pageHidden: page.hidden, commands: commands.length,
			alignedToSplitButton: menuPlacement().anchor === container.querySelector('.remotes-this-computer-share .monaco-button-dropdown'),
			rightAligned: menuPlacement().alignment === AnchorAlignment.RIGHT,
		};
		await menuActions()[0].run();
		assert.deepStrictEqual({ before, commands, method: configuration.getValue(AgentHostRemoteConnectionsSettingId) }, {
			before: { labels: ['Share via GitHub Environment (Preview)'], pageHidden: true, commands: 0, alignedToSplitButton: true, rightAligned: true },
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID], method: 'githubEnvironment',
		});
	});

	test('a failed direct mode switch keeps the overview and reports the failure', async () => {
		const { editor, container, input, instantiation, tunnel, menuActions } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		const errors: unknown[] = [];
		instantiation.stub(INotificationService, 'error', (error: unknown) => { errors.push(error); });
		instantiation.stub(ICommandService, { executeCommand: async () => { throw new Error('Connection failed'); } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-dropdown-button')!.click();
		await menuActions()[0].run();
		assert.deepStrictEqual({
			pageHidden: container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
			status: container.querySelector('.remotes-this-computer-status [role="status"]')?.textContent,
			feedback: container.querySelector('.remotes-this-computer > .remotes-sharing-feedback-container')?.textContent,
			errors: errors.map(error => String(error)),
		}, {
			pageHidden: true, status: 'Not shared',
			feedback: 'Sharing via GitHub Environment didn\'t start. Open the sharing log for details, then try again. Connection failedOpen Sharing Log',
			errors: ['Error: Connection failed'],
		});
	});

	test('sharing cards expose both explanations before selection and retain keyboard navigation', async () => {
		const { editor, container, input } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const github = container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!;
		const tunnel = container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!;
		const before = [...container.querySelectorAll('.remotes-sharing-choice-description li, .remotes-sharing-choice-detail')].map(point => point.textContent);
		github.focus();
		github.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			before,
			focused: dom.getActiveElement() === tunnel,
			selected: tunnel.getAttribute('aria-checked'),
			segmented: tunnel.parentElement?.classList.contains('segmented'),
			explanationUnchanged: [...container.querySelectorAll('.remotes-sharing-choice-description li, .remotes-sharing-choice-detail')].every((point, index) => point.textContent === before[index]),
			accessibleChoices: before.every(point => editor.getAccessibilityContent().includes(point!))
				&& [github, tunnel].every(choice => before.filter(point => choice.textContent?.includes(point!)).every(point => choice.getAttribute('aria-label')?.includes(point!))),
			preview: github.querySelector('.remotes-sharing-preview')?.textContent,
			start: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
		}, {
			before: [
				'Connect from VS Code, the browser-based Agents window, or supported Copilot clients',
				'Make this computer discoverable through your GitHub account',
				'GitHub stores session actions for history. Conversation content isn\'t end-to-end encrypted.',
				'Connect from VS Code or the browser-based Agents window',
				'Connect with the GitHub account used to share this computer',
			],
			focused: true, selected: 'true', segmented: false, preview: 'Preview',
			explanationUnchanged: true, accessibleChoices: true,
			start: 'false',
		});
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

	test('inline sharing keeps both sections and search visible, with actions beside the section heading', async () => {
		const { editor, container, input, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const search = container.querySelector<HTMLInputElement>('.remotes-search-row input')!;
		search.value = 'build';
		search.dispatchEvent(new InputEvent('input'));
		const share = container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!;
		const visibleActions = () => [...share.parentElement!.querySelectorAll<HTMLElement>('.monaco-button')].filter(button => button.getClientRects().length > 0).map(button => button.textContent);
		const collapsedActions = visibleActions();
		share.click();
		container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		const start = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		assert.deepStrictEqual({
			disclosures: container.querySelectorAll('.remotes-this-computer details, .remotes-overview > summary').length,
			tableVisible: !container.querySelector<HTMLElement>('.remotes-editor-table')!.hidden,
			nameVisible: container.querySelector<HTMLElement>('.remotes-this-computer-name')!.getBoundingClientRect().height > 0,
			name: container.querySelector('.remotes-this-computer-name')?.textContent,
			back: container.querySelector('.remotes-task-navigation'),
			actionsInHeading: !!start.closest('.remotes-this-computer-heading'),
			actions: [...start.parentElement!.children].map(element => element.textContent),
			collapsedActions,
			visibleActions: visibleActions(),
			search: search.value,
			accessibleList: editor.getAccessibilityContent().includes('Build server'),
			unchanged: configuration.getValue(AgentHostRemoteConnectionsSettingId),
		}, {
			disclosures: 0, tableVisible: true, nameVisible: true, name: 'My Workstation (Code - OSS)',
			back: null, actionsInHeading: true,
			actions: isWindows ? ['Start Sharing', 'Cancel'] : ['Cancel', 'Start Sharing'],
			collapsedActions: ['Share This Computer'],
			visibleActions: isWindows ? ['Start Sharing', 'Cancel'] : ['Cancel', 'Start Sharing'],
			search: 'build', accessibleList: true, unchanged: undefined,
		});
		container.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
		assert.deepStrictEqual({
			closed: container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
			search: search.value,
			shareFocused: dom.getActiveElement() === container.querySelector('.remotes-this-computer-share > .monaco-button'),
			visibleActions: visibleActions(),
		}, { closed: true, search: 'build', shareFocused: true, visibleActions: ['Share This Computer'] });
	});

	test('the pencil renames the selected sharing method through native input before starting', async () => {
		const { editor, container, input, instantiation, sharing, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		const prompts: string[] = [];
		instantiation.stub(IQuickInputService, {
			input: async (options: IInputOptions) => {
				prompts.push(options.value ?? '');
				return 'Studio workstation';
			},
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		container.querySelector<HTMLElement>('.remotes-this-computer-rename .action-label')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			prompts, renamed: sharing.environmentName.get(),
			displayed: container.querySelector('.remotes-this-computer-name')?.textContent,
			unchanged: configuration.getValue(AgentHostRemoteConnectionsSettingId),
			choicesOpen: !container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
		}, {
			prompts: ['My Workstation (Code - OSS)'], renamed: 'Studio workstation',
			displayed: 'Studio workstation', unchanged: undefined, choicesOpen: true,
		});
	});

	test('invalid tunnel names remain visible and require native rename before sharing', async () => {
		const { editor, container, input, tunnel } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		tunnel.name = 'Invalid tunnel name';
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		assert.deepStrictEqual({
			name: container.querySelector('.remotes-this-computer-name')?.textContent,
			disabled: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
			errorVisible: !container.querySelector<HTMLElement>('.remotes-sharing-feedback-container')!.hidden,
			error: container.querySelector('.remotes-sharing-feedback')?.textContent,
			pencilEnabled: !container.querySelector('.remotes-this-computer-rename .action-item')?.classList.contains('disabled'),
		}, {
			name: 'Invalid tunnel name', disabled: 'true', errorVisible: true,
			error: 'The name must only consist of letters, numbers, underscore and dash. It must not start with a dash.', pencilEnabled: true,
		});
	});
	test('section typography, controls, and table edges stay consistent at wide and narrow sizes', async () => {
		const { editor, container, input } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		for (const size of [40, 60, 80, 100, 120, 160, 200, 240]) {
			container.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
		}
		container.style.setProperty('--vscode-fontSize-heading2', '18px');
		container.style.setProperty('--vscode-fontSize-body1', '13px');
		container.style.setProperty('--vscode-fontWeight-semiBold', '600');
		container.style.setProperty('--vscode-fontWeight-regular', '400');
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const observations = [900, 360, 900].map(width => {
			container.style.width = `${width}px`;
			editor.layout(new dom.Dimension(width, 600));
			const table = container.querySelector('.remotes-table-container')!.getBoundingClientRect();
			const share = container.querySelector('.remotes-this-computer-share')!.getBoundingClientRect();
			const search = container.querySelector('.remotes-search-row')!.getBoundingClientRect();
			const refresh = container.querySelector('.remotes-header-actions .monaco-button')!.getBoundingClientRect();
			const row = container.querySelector('[data-remote-id]')!.getBoundingClientRect();
			const title = container.querySelector<HTMLElement>('.remotes-this-computer-title')!;
			const otherTitle = container.querySelector<HTMLElement>('.remotes-heading-title')!;
			const name = container.querySelector<HTMLElement>('.remotes-this-computer-name')!;
			const titleStyle = dom.getWindow(title).getComputedStyle(title);
			const otherTitleStyle = dom.getWindow(otherTitle).getComputedStyle(otherTitle);
			const nameStyle = dom.getWindow(name).getComputedStyle(name);
			const titleBounds = title.getBoundingClientRect();
			const focusRingsFit = [...container.querySelectorAll<HTMLElement>('.remotes-this-computer-share > .monaco-button:not([hidden]), .remotes-header-actions .monaco-button')].every(button => {
				button.focus();
				const style = dom.getWindow(button).getComputedStyle(button);
				const extent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
				const bounds = button.getBoundingClientRect();
				if (!(extent > 0)) {
					return false;
				}
				for (let ancestor = button.parentElement; ancestor && container.contains(ancestor); ancestor = ancestor.parentElement) {
					const clip = ancestor.getBoundingClientRect();
					const overflow = dom.getWindow(ancestor).getComputedStyle(ancestor);
					if (overflow.overflowX !== 'visible' && (bounds.left - extent < clip.left || bounds.right + extent > clip.right)
						|| overflow.overflowY !== 'visible' && (bounds.top - extent < clip.top || bounds.bottom + extent > clip.bottom)) {
						return false;
					}
				}
				return true;
			});
			return {
				focusRingsFit,
				rightAligned: [share.right, search.right, refresh.right, row.right].every(right => Math.abs(right - table.right) < 1),
				leftAligned: Math.abs(row.left - table.left) < 1,
				refreshFits: refresh.width > 0 && refresh.left >= table.left,
				shareBesideHeading: Math.abs(share.top + share.height / 2 - titleBounds.top - titleBounds.height / 2) < 1,
				sectionHierarchy: titleStyle.fontSize === otherTitleStyle.fontSize && titleStyle.fontWeight === otherTitleStyle.fontWeight
					&& parseFloat(titleStyle.fontSize) > parseFloat(nameStyle.fontSize) && parseInt(titleStyle.fontWeight) > parseInt(nameStyle.fontWeight),
			};
		});
		assert.deepStrictEqual(observations, Array.from({ length: 3 }, () => ({ focusRingsFit: true, rightAligned: true, leftAligned: true, refreshFits: true, shareBesideHeading: true, sectionHierarchy: true })));
	});

	test('inline choices keep summary actions aligned and the environment list reachable in a short narrow editor', async () => {
		const { editor, container, input } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		for (const size of [40, 60, 80, 120, 160, 200, 240, 320, 360]) {
			container.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
		}
		container.style.setProperty('--vscode-fontSize-heading2', '18px');
		container.style.setProperty('--vscode-fontSize-body1', '13px');
		container.style.setProperty('--vscode-fontWeight-regular', '400');
		container.style.setProperty('--vscode-codiconFontSize', '16px');
		container.style.width = '360px';
		editor.layout(new dom.Dimension(360, 320));
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		const geometry = () => {
			const { x, y, width, height } = container.querySelector('.remotes-sharing-footer')!.getBoundingClientRect();
			return { x, y, width, height };
		};
		const initial = geometry();
		const instruction = container.querySelector<HTMLElement>('.remotes-sharing-instruction')!;
		const instructionStyle = dom.getWindow(container).getComputedStyle(instruction);
		const instructionBounds = instruction.getBoundingClientRect();
		const nameBounds = container.querySelector('.remotes-this-computer-name')!.getBoundingClientRect();
		const cardsAligned = [...container.querySelectorAll('.remotes-sharing-choices [role="radio"]')].every(card => {
			const bounds = card.getBoundingClientRect();
			return Math.abs(bounds.left - instructionBounds.left) < 1
				&& Math.abs(bounds.right - instructionBounds.right) < 1
				&& Math.abs(bounds.left - nameBounds.left) < 1;
		});
		const selections = ['githubEnvironment', 'devTunnel', 'githubEnvironment'].map(method => {
			container.querySelector<HTMLElement>(`[data-sharing-method="${method}"]`)!.click();
			return geometry();
		});
		const content = container.querySelector<HTMLElement>('.remotes-editor-content')!;
		content.scrollTop = content.scrollHeight;
		const host = content.getBoundingClientRect();
		const search = container.querySelector('.remotes-search-row')!.getBoundingClientRect();
		assert.deepStrictEqual({
			selections,
			cardsAligned,
			instruction: {
				element: instruction.tagName,
				fontSize: instructionStyle.fontSize,
				fontWeight: instructionStyle.fontWeight,
				labelsChoices: container.querySelector('.remotes-sharing-choices')?.getAttribute('aria-labelledby') === instruction.id,
			},
			actionsAligned: Math.abs(initial.x + initial.width - search.right) < 1,
			choicesRightAligned: [...container.querySelectorAll('.remotes-sharing-choices [role="radio"]')].every(card => Math.abs(card.getBoundingClientRect().right - search.right) < 1),
			scrolls: content.scrollTop > 0,
			searchReachable: search.top >= host.top && search.bottom <= host.bottom,
			noHorizontalOverflow: content.scrollWidth <= content.clientWidth,
		}, {
			selections: [initial, initial, initial], cardsAligned: true,
			instruction: { element: 'P', fontSize: '13px', fontWeight: '400', labelsChoices: true },
			actionsAligned: true,
			choicesRightAligned: true,
			scrolls: true, searchReachable: true, noHorizontalOverflow: true,
		});
	});

	test('environment details receive focus while inline sharing choices are preserved', async () => {
		const { editor, container, input, menuActions } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const overflow = container.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .codicon-toolbar-more')!;
		overflow.focus();
		overflow.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		await menuActions().find(action => action.id === 'remotes.locationPreference')!.run();
		editor.focus();
		const details = {
			localHidden: container.querySelector<HTMLElement>('.remotes-editor-this-computer')!.hidden,
			focus: dom.getActiveElement() === container.querySelector('.remotes-task-back .action-label'),
			accessible: editor.getAccessibilityContent().includes('Agent run behavior'),
		};
		editor.closeEnvironmentDetails();
		assert.deepStrictEqual({
			details,
			restored: !container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
			selected: container.querySelector('[data-sharing-method="devTunnel"]')?.getAttribute('aria-checked'),
		}, {
			details: { localHidden: true, focus: true, accessible: true },
			restored: true, selected: 'true',
		});
	});

	test('sharing status uses normal foreground except when not shared', async () => {
		const { editor, container, input, sharing } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true,
			[GitHubEnvironmentsEnabledSettingId]: true,
			[AgentHostRemoteConnectionsSettingId]: 'githubEnvironment',
		});
		container.style.setProperty('--vscode-foreground', '#dddddd');
		container.style.setProperty('--vscode-descriptionForeground', '#aaaaaa');
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const status = container.querySelector<HTMLElement>('.remotes-this-computer-status [role="status"]')!;
		const color = () => dom.getWindow(status).getComputedStyle(status).color;
		const notShared = color();
		sharing.state.set('connecting', undefined);
		await timeout(0);
		const connecting = color();
		sharing.state.set('enabled', undefined);
		await timeout(0);
		assert.deepStrictEqual({
			notShared,
			connecting,
			shared: color(),
			status: status.textContent,
		}, {
			notShared: 'rgb(170, 170, 170)',
			connecting: 'rgb(221, 221, 221)',
			shared: 'rgb(221, 221, 221)',
			status: 'Sharing via GitHub Environment',
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
			describes: radio.getAttribute('aria-describedby')?.split(' ').includes(policy.id),
			githubDisabled: github.getAttribute('aria-disabled'),
			selected: radio.querySelector('[aria-checked="true"]')?.getAttribute('data-sharing-method'),
			linkFocusable: link.tabIndex,
			opened,
			accessible: editor.getAccessibilityContent().includes('Sharing through GitHub Environments is disabled by your organization. Contact your administrator.'),
		}, {
			visible: true,
			text: 'Sharing through GitHub Environments is disabled by your organization. Contact your administrator. View Setting',
			describes: true,
			githubDisabled: 'true',
			selected: 'devTunnel',
			linkFocusable: 0,
			opened: [{ query: `@id:${GitHubEnvironmentsEnabledSettingId}` }],
			accessible: true,
		});
	});

	suite('segmented This Computer (sharing setup control arm)', () => {
		const createControlEditor = () => createEditor({ [REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING]: false });

		test('shows how this computer is shared and turns on the chosen connection method', async () => {
			const { editor, container, input, instantiation, tunnel, configuration } = createControlEditor();
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
			const section = container.querySelector<HTMLElement>('.remotes-segmented-this-computer')!;
			const options = () => [...section.querySelectorAll<HTMLElement>('.monaco-custom-radio > .monaco-button')];
			const read = () => ({
				name: section.querySelector('.remotes-segmented-this-computer-name')?.textContent,
				options: options().map(button => button.getAttribute('aria-checked') === 'true' ? `${button.textContent} (selected)` : button.textContent),
				status: section.querySelector('.remotes-segmented-this-computer-status')?.textContent,
			});
			const before = read();
			options()[2].click();
			await timeout(0);
			assert.deepStrictEqual({ before, after: read(), commands, sharingSetup: !!container.querySelector('.remotes-this-computer'), accessible: editor.getAccessibilityContent().split('\n\n')[0], optionNames: options().map(button => button.getAttribute('aria-label')) }, {
				before: { name: 'my-workstation', options: ['Off (selected)', 'GitHub Environments (Preview)', 'Dev Tunnels'], status: 'Remote connections are off.' },
				after: { name: 'my-workstation', options: ['Off', 'GitHub Environments (Preview)', 'Dev Tunnels (selected)'], status: 'Remote connections are on via Dev Tunnels.' },
				commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID],
				sharingSetup: false,
				accessible: 'This computer\nSharing name: my-workstation\nRemote connections are on via Dev Tunnels.\nLocal sessions run directly here. Sharing lets other devices use agents and folders on this computer. Files and tools stay here.\nLearn More: https://aka.ms/vscode-agent-environments',
				optionNames: [
					'Off: Sharing through this app is off. Agent tasks keep running on this computer.',
					'GitHub Environments (Preview): Connect from VS Code, the browser-based Agents window, or supported Copilot clients. Make this computer discoverable through your GitHub account.',
					'Dev Tunnels: Connect from VS Code or the browser-based Agents window.',
				],
			});
		});

		test('applies a method chosen while another is still being applied', async () => {
			const { editor, container, input, instantiation, tunnel, configuration } = createControlEditor();
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
			const section = container.querySelector<HTMLElement>('.remotes-segmented-this-computer')!;
			const options = () => [...section.querySelectorAll<HTMLElement>('.monaco-custom-radio > .monaco-button')];
			const option = (label: string) => options().find(button => button.textContent === label)!;
			const selected = () => options().find(button => button.getAttribute('aria-checked') === 'true')?.textContent;
			const status = () => section.querySelector('.remotes-segmented-this-computer-status')?.textContent;
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

		test('explains a policy-disabled GitHub Environments option and offers the managed setting', async () => {
			const { editor, container, input, instantiation, configuration } = createControlEditor();
			await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, true);
			await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, false);
			const inspect = configuration.inspect.bind(configuration);
			configuration.inspect = <T>(key: string) => key === GitHubEnvironmentsEnabledSettingId ? { ...inspect<T>(key), policyValue: false as T } : inspect<T>(key);
			const opened: unknown[] = [];
			instantiation.stub(IPreferencesService, { openSettings: async (options: unknown) => { opened.push(options); return undefined; } });
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			const section = container.querySelector<HTMLElement>('.remotes-segmented-this-computer')!;
			const policy = section.querySelector<HTMLElement>('.remotes-segmented-this-computer-policy')!;
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

		test('switches between the segmented control and sharing setup when the setting changes', async () => {
			const { editor, container, input, configuration, instantiation } = createControlEditor();
			await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING, true);
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			const isVisibleEditor = (pane: RemotesEditor): pane is RemotesEditor & IVisibleEditorPane => pane.input !== undefined;
			assert.ok(isVisibleEditor(editor));
			instantiation.stub(IEditorService, { activeEditorPane: editor });
			const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'remotes' && implementation.type === AccessibleViewType.Help)!;
			const read = () => {
				const content = store.add(help.getProvider(instantiation)!).provideContent();
				return {
					segmented: container.querySelectorAll('.remotes-segmented-this-computer').length,
					sharingSetup: container.querySelectorAll('.remotes-this-computer').length,
					help: { allowConnections: content.includes('Allow Connections Here'), shareThisComputer: content.includes('Select Share This Computer') },
				};
			};
			const setSharingSetup = async (enabled: boolean) => {
				await configuration.setUserConfiguration(REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING, enabled);
				configuration.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER, affectedKeys: new Set([REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING]),
					change: { keys: [REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING], overrides: [] },
					affectsConfiguration: key => key === REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING,
				});
				await timeout(0);
			};
			const control = read();
			await setSharingSetup(true);
			const treatment = read();
			await setSharingSetup(false);
			assert.deepStrictEqual({ control, treatment, restored: read() }, {
				control: { segmented: 1, sharingSetup: 0, help: { allowConnections: true, shareThisComputer: false } },
				treatment: { segmented: 0, sharingSetup: 1, help: { allowConnections: false, shareThisComputer: true } },
				restored: { segmented: 1, sharingSetup: 0, help: { allowConnections: true, shareThisComputer: false } },
			});
		});
	});

	test('logs the This Computer experiment triggers in every arm once the editor shows its content', async () => {
		const thisComputer = `config.${REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING}`;
		const sharingSetup = `config.${REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING}`;
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
			hidden: await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: false }),
			segmented: await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING]: false }),
			sharingSetup: await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING]: true }),
			editorDisabled: (await open({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [RemoteAgentHostsEnabledSettingId]: false })).editor,
		}, {
			hidden: { editor: [thisComputer], withHelp: [thisComputer] },
			segmented: { editor: [thisComputer, sharingSetup], withHelp: [thisComputer, sharingSetup] },
			sharingSetup: { editor: [thisComputer, sharingSetup], withHelp: [thisComputer, sharingSetup] },
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
			accessibleHeading: editor.getAccessibilityContent().includes('\n\nOther environments\n'),
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
		editor.clearInput();
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const reopened = read();
		await setEnabled(false);
		assert.deepStrictEqual({ initial, enabled, reopened, disabled: read() }, {
			initial: { hidden: true, sections: 0, heading: undefined, region: false, accessible: false, accessibleHeading: false },
			enabled: { hidden: false, sections: 1, heading: 'Other environments', region: true, accessible: true, accessibleHeading: true },
			reopened: { hidden: false, sections: 1, heading: 'Other environments', region: true, accessible: true, accessibleHeading: true },
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
			hiddenRefreshes: 0, focused: 'Search environments', canceledWhenHidden: true,
			canceledWhenCleared: true, disposed: true, widgets: 0, customizationEditors: 0,
		});
	});

	test('disposes the widget when remote hosts are disabled', async () => {
		const { editor, model, container, input, configuration } = createEditor();
		container.style.height = '600px';
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
			inView: message.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom,
			text: editor.getAccessibilityContent(),
		}, { disposed: true, widgets: 0, disabled: true, inView: true, text: 'Remote agent hosts are disabled.' });
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
			}, { disposed: true, canceled: true, widgets: 0, message: setting === ENVIRONMENT_PICKER_SETTING ? 'The environment picker is disabled.' : 'Remote Environments management is disabled.' });
		});
	}

	test('Manage uses shared modal sizing and routes through the editor service without constructing the Customizations editor', async () => {
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
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /environment picker is disabled/i);
		await configuration.setUserConfiguration(ENVIRONMENT_PICKER_SETTING, true);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /disabled/);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden: true } });
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /disabled/);
		assert.deepStrictEqual(opened, [{ type: 'sessions.input.remotes', options: { pinned: true } }]);
	});
});
