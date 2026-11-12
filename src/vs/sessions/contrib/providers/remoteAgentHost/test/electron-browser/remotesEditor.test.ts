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
	override async getTunnelStatus(): Promise<TunnelStatus> { return { type: 'disconnected' }; }
	override async getTunnelName(): Promise<string | undefined> { return this.name; }
	override async stopTunnel(): Promise<void> { }
	fireStatus(status: TunnelStatus): void { this.onDidChangeStatusEmitter.fire(status); }
	dispose(): void { this.onDidChangeStatusEmitter.dispose(); }
}

suite('RemotesEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(initialSettings: Record<string, unknown> = {}) {
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true, [ENVIRONMENT_PICKER_SETTING]: true, ...initialSettings });
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
		const input = store.add(new RemotesEditorInput());
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

	test('accessibility help describes focused settings and recovery rather than removed type groups', async () => {
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
			diagnostics: content.includes('Open Diagnostic Report'),
			oldGroupSettings: content.includes('The Dev Tunnels group has an Open Dev Tunnels Settings action.'),
		}, { runBehavior: true, runBehaviorExplained: true, removalActions: true, diagnostics: true, oldGroupSettings: false });
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

	test('sharing replaces the overview and changes nothing until confirmed', async () => {
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
		page.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			before, commands, pageHidden: page.hidden, tableVisible: !table.hidden,
			status: section.querySelector('.remotes-this-computer-status [role="status"]')?.textContent,
			focusRestored: dom.getActiveElement() === section.querySelector('.remotes-this-computer-share .monaco-dropdown-button'),
			descriptions: page.querySelectorAll('.remotes-sharing-choice-description').length,
		}, {
			before: { commands: 0, pageVisible: true, tableHidden: true },
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
		const apply = page.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		apply.click();
		apply.click();
		await timeout(0);
		page.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const pending = {
			commands: commands.length, busy: page.getAttribute('aria-busy'),
			selected: page.querySelector('[aria-checked="true"]')?.getAttribute('data-sharing-method'),
			cancelDisabled: page.querySelector('.remotes-sharing-footer .secondary')?.getAttribute('aria-disabled'),
		};
		await release.complete();
		await timeout(0);
		assert.deepStrictEqual({ pending, closed: page.hidden, commands: commands.length }, {
			pending: { commands: 1, busy: 'true', selected: 'devTunnel', cancelDisabled: 'true' },
			closed: true, commands: 1,
		});
	});

	for (const method of ['githubEnvironment', 'devTunnel'] as const) {
		test(`validates and saves the ${method} name before starting sharing`, async () => {
			const { editor, container, input, instantiation, configuration, sharing } = createEditor({
				[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
			});
			const registrations: (string | undefined)[] = [];
			instantiation.stub(ICommandService, {
				executeCommand: async () => {
					registrations.push(method === 'githubEnvironment' ? sharing.environmentName.get() : configuration.getValue<string>(CONFIGURATION_KEY_HOST_NAME));
					return undefined;
				}
			});
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
			const nameField = container.querySelector<HTMLElement>('.remotes-sharing-name-field')!;
			const hiddenBeforeSelection = nameField.hidden;
			container.querySelector<HTMLElement>(`[data-sharing-method="${method}"]`)!.click();
			const name = container.querySelector<HTMLInputElement>('.remotes-sharing-name-field input')!;
			const start = container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
			const enter = (value: string) => {
				name.value = value;
				name.dispatchEvent(new InputEvent('input', { bubbles: true }));
			};
			enter(method === 'devTunnel' ? '-invalid name' : ' ');
			const invalid = { disabled: start.getAttribute('aria-disabled'), invalid: name.getAttribute('aria-invalid'), validation: name.closest('.monaco-inputbox')?.classList.contains('error') };
			start.click();
			enter('my-dev-machine');
			const beforeStart = { registrations: registrations.length, stored: sharing.environmentName.get() ?? configuration.getValue(CONFIGURATION_KEY_HOST_NAME) };
			start.click();
			await timeout(0);
			assert.deepStrictEqual({ hiddenBeforeSelection, invalid, valid: !name.hasAttribute('aria-invalid'), beforeStart, registrations }, {
				hiddenBeforeSelection: false, invalid: { disabled: 'true', invalid: 'true', validation: true }, valid: true, beforeStart: { registrations: 0, stored: undefined },
				registrations: ['my-dev-machine'],
			});
		});
	}

	test('Cancel discards the edited sharing name without registering or saving it', async () => {
		const { editor, container, input, configuration } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const share = container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!;
		share.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const name = container.querySelector<HTMLInputElement>('.remotes-sharing-name-field input')!;
		name.value = 'unsaved-name';
		name.dispatchEvent(new InputEvent('input', { bubbles: true }));
		container.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
		share.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		assert.deepStrictEqual({ name: name.value, saved: configuration.getValue(CONFIGURATION_KEY_HOST_NAME) }, { name: 'my-workstation', saved: undefined });
	});

	test('a failed name save cannot start sharing with the old name', async () => {
		const { editor, container, input, configuration, instantiation } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const errors: unknown[] = [];
		const commands: string[] = [];
		configuration.updateValue = async () => { throw new Error('Name could not be saved'); };
		instantiation.stub(INotificationService, 'error', (error: unknown) => { errors.push(error); });
		instantiation.stub(ICommandService, { executeCommand: async (id: string) => { commands.push(id); return undefined; } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			commands, errors: errors.map(error => String(error)),
			pageHidden: container.querySelector<HTMLElement>('.remotes-sharing-details')!.hidden,
		}, { commands: [], errors: ['Error: Name could not be saved'], pageHidden: false });
	});

	test('Cancel and Escape discard the sharing choice and restore the collapsed summary', async () => {
		const { editor, container, input, instantiation } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async (id: string) => { commands.push(id); return undefined; } });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const share = container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!;
		const page = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		const states: { selected: number; enabled: string | null; label: string | null; shareHidden: boolean; off: boolean; bullets: number }[] = [];
		for (const close of ['cancel', 'escape']) {
			share.click();
			const start = page.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
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
				page.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
			}
			assert.ok(page.hidden);
		}
		assert.deepStrictEqual({ commands, states, restored: !share.hidden && dom.getActiveElement() === share }, {
			commands: [],
			states: [
				{ selected: 0, enabled: 'true', label: 'Start Sharing', shareHidden: true, off: false, bullets: 2 },
				{ selected: 0, enabled: 'true', label: 'Start Sharing', shareHidden: true, off: false, bullets: 2 },
			],
			restored: true,
		});
	});

	test('opening sharing in a short editor keeps the introduction visible before the choices', async () => {
		const { editor, container, input } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		editor.layout(new dom.Dimension(640, 320));
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const body = container.querySelector<HTMLElement>('.remotes-sharing-body')!;
		const introduction = container.querySelector<HTMLElement>('.remotes-this-computer-description')!;
		assert.deepStrictEqual({
			backFocused: dom.getActiveElement() === container.querySelector('.remotes-task-back .action-label'),
			scrolled: body.scrollTop,
			introductionAtTop: introduction.getBoundingClientRect().top >= body.getBoundingClientRect().top,
		}, { backFocused: true, scrolled: 0, introductionAtTop: true });
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
			renameHints: container.querySelectorAll('.remotes-sharing-rename-hint').length,
			standardToolbar: !!rename.querySelector('.monaco-toolbar .action-label.codicon-edit'),
		}, {
			hiddenBeforeSharing: true, offeredWhileSharing: true,
			prompt: [{ title: 'Rename Tunnel', value: 'my-workstation' }],
			configuredName: 'renamed-computer',
			renameHints: 0,
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
		const apply = page.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!;
		const feedback = page.querySelector<HTMLElement>('.remotes-sharing-feedback')!;
		apply.click();
		await timeout(0);
		page.querySelector<HTMLElement>('.remotes-sharing-feedback-container .monaco-link')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			visible: !page.hidden, errors: errors.length,
			feedback: page.querySelector('.remotes-sharing-feedback')?.textContent,
			retry: apply.getAttribute('aria-disabled'),
			feedbackAfterActions: apply.parentElement!.nextElementSibling === feedback.parentElement,
			feedbackDescribesAction: apply.getAttribute('aria-describedby')?.split(' ').includes(feedback.id),
			commands,
		}, {
			visible: true, errors: 1, feedback: 'Sharing via Dev Tunnel didn\'t start. Open the sharing log for details, then try again. Connection failed', retry: 'false',
			feedbackAfterActions: true, feedbackDescribesAction: true,
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID, 'workbench.action.closeModalEditor', 'workbench.remoteTunnel.actions.showLog'],
		});
		page.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		assert.ok(page.querySelector<HTMLElement>('.remotes-sharing-feedback-container')!.hidden);
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

	for (const width of [360, 900]) {
		test(`sharing radio cards retain circular indicators without moving the form at ${width}px`, async () => {
			const { editor, container, input } = createEditor({
				[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
			});
			for (const size of [20, 40, 60, 80, 120, 160, 200, 240, 280, 320, 360]) {
				container.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
			}
			container.style.setProperty('--vscode-codiconFontSize', '16px');
			container.style.setProperty('--vscode-fontSize-body1', '13px');
			container.style.setProperty('--vscode-cornerRadius-circle', '9999px');
			container.style.setProperty('--vscode-strokeThickness', '1px');
			editor.layout(new dom.Dimension(width, 1200));
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
			const choices = [...container.querySelectorAll<HTMLElement>('.remotes-sharing-choices [role="radio"]')];
			const name = container.querySelector<HTMLInputElement>('.remotes-sharing-name-field input')!;
			const hint = container.querySelector<HTMLElement>('.remotes-sharing-name-hint')!;
			const targetWindow = dom.getWindow(container);
			const layout = () => [...container.querySelectorAll<HTMLElement>('.remotes-sharing-name-field input, .remotes-sharing-choices, .remotes-sharing-choices [role="radio"], .remotes-sharing-footer, .remotes-sharing-help')].map(element => {
				const { x, y, width, height } = element.getBoundingClientRect();
				return { x, y, width, height };
			});
			const overview = container.querySelector<HTMLElement>('.remotes-this-computer-description')!.getBoundingClientRect();
			const types = container.querySelector<HTMLElement>('.remotes-sharing-type-field')!.getBoundingClientRect();
			const nameField = container.querySelector<HTMLElement>('.remotes-sharing-name-field')!.getBoundingClientRect();
			const initial = layout();
			const states = [0, 1, 0].map(index => {
				choices[index].click();
				return {
					stable: JSON.stringify(layout()) === JSON.stringify(initial),
					rings: choices.map(choice => {
						const ring = targetWindow.getComputedStyle(choice, '::before');
						const diameter = parseFloat(ring.width);
						return ring.content !== 'none' && diameter > 0 && ring.width === ring.height
							&& parseFloat(ring.borderRadius) >= diameter / 2 && ring.borderStyle === 'solid'
							&& ring.visibility === 'visible';
					}),
					checkedDots: choices.map(choice => targetWindow.getComputedStyle(choice, '::after').visibility === 'visible'),
					hintVisible: targetWindow.getComputedStyle(hint).visibility === 'visible',
					hintDescribed: !!name.getAttribute('aria-describedby')?.split(' ').includes(hint.id),
					hintInAccessibleView: editor.getAccessibilityContent().includes(hint.textContent!),
				};
			});
			assert.deepStrictEqual({
				sharedContentWidth: overview.width === types.width && overview.left === types.left,
				typeBeforeName: types.bottom <= nameField.top,
				states,
			}, {
				sharedContentWidth: true,
				typeBeforeName: true,
				states: [
					{ stable: true, rings: [true, true], checkedDots: [true, false], hintVisible: false, hintDescribed: false, hintInAccessibleView: false },
					{ stable: true, rings: [true, true], checkedDots: [false, true], hintVisible: true, hintDescribed: true, hintInAccessibleView: true },
					{ stable: true, rings: [true, true], checkedDots: [true, false], hintVisible: false, hintDescribed: false, hintInAccessibleView: false },
				],
			});
		});
	}

	test('sharing explains its scope once, compares types, then asks for the type-specific name', async () => {
		const { editor, container, input } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const nameField = container.querySelector<HTMLElement>('.remotes-sharing-name-field')!;
		const name = nameField.querySelector<HTMLInputElement>('input')!;
		const overview = container.querySelector<HTMLElement>('.remotes-this-computer-description')!;
		const types = container.querySelector<HTMLElement>('.remotes-sharing-type-field')!;
		const footer = container.querySelector<HTMLElement>('.remotes-sharing-footer')!;
		const feedback = container.querySelector<HTMLElement>('.remotes-sharing-feedback')!;
		const help = container.querySelector<HTMLElement>('.remotes-sharing-help')!;
		const beforeSelection = { value: name.value, enabled: !name.disabled, startDisabled: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled') };
		container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		assert.deepStrictEqual({
			beforeSelection,
			heading: container.querySelector('.remotes-task-heading')?.textContent,
			label: nameField.querySelector('label')?.textContent,
			labelForInput: nameField.querySelector('label')?.htmlFor === name.id,
			value: name.value,
			pageName: container.querySelector('.remotes-sharing-details')?.getAttribute('aria-labelledby') === container.querySelector('.remotes-task-title')?.id,
			overview: overview.textContent,
			typeLabel: types.querySelector('h3')?.textContent,
			taskMetadata: container.querySelectorAll('.remotes-sharing-system').length,
			overviewMetadata: !!container.querySelector('.remotes-this-computer-system')?.textContent,
			overviewBeforeTypes: !!(overview.compareDocumentPosition(types) & Node.DOCUMENT_POSITION_FOLLOWING),
			typesBeforeName: !!(types.compareDocumentPosition(nameField) & Node.DOCUMENT_POSITION_FOLLOWING),
			redundantHelpers: container.querySelectorAll('.remotes-sharing-notice, .remotes-sharing-name-description').length,
			actionDescription: footer.querySelector('.monaco-button:not(.secondary)')?.getAttribute('aria-describedby') === `${overview.id} ${feedback.id}`,
			feedbackAfterActions: footer.nextElementSibling === feedback.parentElement,
			guideAfterActions: !!(footer.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING),
			guide: help.textContent,
			accessible: [name.value, overview.textContent!].every(text => editor.getAccessibilityContent().includes(text))
				&& editor.getAccessibilityContent().indexOf('\nChoose a connection method to start sharing\n') < editor.getAccessibilityContent().indexOf('Sharing name:'),
		}, {
			beforeSelection: { value: 'my-workstation', enabled: true, startDisabled: 'true' },
			heading: 'Share this computer', label: 'Sharing name', labelForInput: true,
			value: 'My Workstation (Code - OSS)',
			pageName: true,
			overview: 'Let your other devices use this computer\'s agent sessions, tools, and files. Work runs here, so keep VS Code running and this computer awake and online.',
			typeLabel: 'Choose a connection method to start sharing', taskMetadata: 0, overviewMetadata: true,
			overviewBeforeTypes: true, typesBeforeName: true, redundantHelpers: 0,
			actionDescription: true, feedbackAfterActions: true, guideAfterActions: true, guide: 'Choose how to connect', accessible: true,
		});
	});

	test('sharing distinguishes labels from readable instructions and supplemental help', async () => {
		const { editor, container, input } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		container.style.setProperty('--vscode-fontSize-body1', '13px');
		container.style.setProperty('--vscode-fontSize-label1', '12px');
		container.style.setProperty('--vscode-fontWeight-semiBold', '600');
		container.style.setProperty('--vscode-fontWeight-regular', '400');
		container.style.setProperty('--vscode-foreground', '#dddddd');
		container.style.setProperty('--vscode-descriptionForeground', '#aaaaaa');
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const labels = [...container.querySelectorAll<HTMLElement>('.remotes-sharing-question')];
		const style = (element: HTMLElement) => {
			const computed = dom.getWindow(element).getComputedStyle(element);
			return { size: computed.fontSize, weight: computed.fontWeight, color: computed.color };
		};
		assert.deepStrictEqual({
			labels: [...new Set(labels.map(element => JSON.stringify(style(element))))],
			overview: style(container.querySelector<HTMLElement>('.remotes-this-computer-description')!),
			hint: style(container.querySelector<HTMLElement>('.remotes-sharing-name-hint')!),
			details: [...new Set([...container.querySelectorAll<HTMLElement>('.remotes-sharing-choice-detail')].map(element => JSON.stringify(style(element))))],
			helpSize: style(container.querySelector<HTMLElement>('.remotes-sharing-help')!).size,
			choiceForeground: [...container.querySelectorAll<HTMLElement>('.remotes-sharing-choice-description')].every(element => style(element).color === 'rgb(221, 221, 221)'),
		}, {
			labels: [JSON.stringify({ size: '13px', weight: '600', color: 'rgb(221, 221, 221)' })],
			overview: { size: '13px', weight: '400', color: 'rgb(221, 221, 221)' },
			hint: { size: '12px', weight: '400', color: 'rgb(170, 170, 170)' },
			details: [JSON.stringify({ size: '12px', weight: '400', color: 'rgb(221, 221, 221)' })],
			helpSize: '12px', choiceForeground: true,
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

	test('editing the name before choosing a method retains the draft and validates it for that method', async () => {
		const { editor, container, input, configuration } = createEditor({
			[REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true, [GitHubEnvironmentsEnabledSettingId]: true,
		});
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		const name = container.querySelector<HTMLInputElement>('.remotes-sharing-name-field input')!;
		name.value = 'My computer';
		name.dispatchEvent(new InputEvent('input', { bubbles: true }));
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const tunnel = { value: name.value, invalid: name.getAttribute('aria-invalid'), startDisabled: container.querySelector('.remotes-sharing-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled') };
		container.querySelector<HTMLElement>('[data-sharing-method="githubEnvironment"]')!.click();
		const github = { value: name.value, invalid: name.hasAttribute('aria-invalid') };
		container.querySelector<HTMLElement>('[data-sharing-method="devTunnel"]')!.click();
		const restoredDraft = name.value;
		container.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
		container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button')!.click();
		assert.deepStrictEqual({
			tunnel, github, restoredDraft, reopened: name.value, saved: configuration.getValue(CONFIGURATION_KEY_HOST_NAME),
		}, {
			tunnel: { value: 'My computer', invalid: 'true', startDisabled: 'true' },
			github: { value: 'My Workstation (Code - OSS)', invalid: false },
			restoredDraft: 'My computer', reopened: 'my-workstation', saved: undefined,
		});
	});

	test('sharing Back and Cancel restore the overview without starting sharing', async () => {
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
		await timeout(0);
		const primary = container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-button-dropdown .monaco-text-button')!;
		const arrow = container.querySelector<HTMLElement>('.remotes-this-computer-share .monaco-dropdown-button')!;
		const share = container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!;
		const details = container.querySelector<HTMLElement>('.remotes-sharing-details')!;
		share.click();
		const expanded = {
			visible: !details.hidden, commands: commands.length, headerActionsVisible: primary.getBoundingClientRect().height > 0,
			standardSplit: primary.parentElement?.classList.contains('monaco-button-dropdown'),
			overviewHidden: container.querySelector<HTMLElement>('.remotes-editor-table')!.hidden,
			expanded: share.getAttribute('aria-expanded'),
			actions: [...details.querySelectorAll('.remotes-sharing-footer .monaco-button')].map(button => button.textContent),
		};
		container.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
		const toggledClosed = details.hidden && share.getAttribute('aria-expanded') === 'false';
		share.click();
		details.querySelector<HTMLElement>('.remotes-sharing-footer .secondary')!.click();
		const cancelled = { closed: details.hidden, restored: dom.getActiveElement() === share, commands: commands.length };
		share.click();
		const back = container.querySelector<HTMLElement>('.remotes-task-back .action-label')!;
		back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		const escapedFromNavigation = details.hidden && dom.getActiveElement() === share;
		tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
		assert.strictEqual(arrow.getAttribute('aria-haspopup'), 'true');
		primary.click();
		await timeout(0);
		assert.deepStrictEqual({ expanded, toggledClosed, cancelled, escapedFromNavigation, commands, collapsed: details.hidden, stopped: primary.parentElement?.hidden, entrance: container.querySelector('.remotes-this-computer-share > .monaco-button')?.textContent }, {
			expanded: { visible: true, commands: 0, headerActionsVisible: false, standardSplit: true, overviewHidden: true, expanded: 'true', actions: isWindows ? ['Start Sharing', 'Cancel'] : ['Cancel', 'Start Sharing'] },
			toggledClosed: true,
			cancelled: { closed: true, restored: true, commands: 0 },
			escapedFromNavigation: true,
			commands: [TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID], collapsed: true, stopped: true, entrance: 'Share This Computer',
		});
	});

	test('sharing details align with the summary and active status uses the antenna accent', async () => {
		const { editor, container, input, tunnel } = createEditor({ [REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING]: true });
		for (const [name, value] of Object.entries({
			'--vscode-strokeThickness': '1px', '--vscode-widget-border': '#444444',
			'--vscode-spacing-size20': '2px', '--vscode-spacing-size40': '4px', '--vscode-spacing-size80': '8px',
			'--vscode-spacing-size120': '12px', '--vscode-spacing-size160': '16px', '--vscode-spacing-size200': '20px',
			'--vscode-spacing-size240': '24px', '--vscode-spacing-size280': '28px', '--vscode-focusBorder': '#2266ff',
			'--vscode-fontSize-heading3': '13px', '--vscode-fontSize-body1': '13px',
			'--vscode-fontWeight-semiBold': '600', '--vscode-fontWeight-regular': '400', '--vscode-codiconFontSize': '16px',
		})) {
			container.style.setProperty(name, value);
		}
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const section = container.querySelector<HTMLElement>('.remotes-this-computer')!;
		const sectionContainer = container.querySelector<HTMLElement>('.remotes-editor-this-computer')!;
		const share = section.querySelector<HTMLElement>('.remotes-this-computer-share')!;
		const description = section.querySelector<HTMLElement>('.remotes-this-computer-description')!;
		const heading = section.querySelector<HTMLElement>('h2.remotes-this-computer-title')!;
		const otherHeading = container.querySelector<HTMLElement>('h2.remotes-heading-title')!;
		const name = section.querySelector<HTMLElement>('.remotes-this-computer-name')!;
		const headingStyle = dom.getWindow(section).getComputedStyle(heading);
		const otherHeadingStyle = dom.getWindow(section).getComputedStyle(otherHeading);
		const sharingAlignment = () => [900, 460, 900].map(width => {
			editor.layout(new dom.Dimension(width, 600));
			const nameRow = section.querySelector('.remotes-this-computer-name-row')!.getBoundingClientRect();
			const controls = share.getBoundingClientRect();
			const metadata = section.querySelector('.remotes-this-computer-status')!.getBoundingClientRect();
			return {
				centered: Math.abs(controls.top + controls.height / 2 - nameRow.top - nameRow.height / 2) < 1,
				rightAligned: Math.abs(controls.right - section.getBoundingClientRect().right) < 1,
				statusBelow: metadata.top >= controls.bottom,
				nameSeparate: name.getBoundingClientRect().right <= controls.left,
			};
		});
		const shareAlignment = sharingAlignment();
		const collapsed = {
			flat: dom.getWindow(section).getComputedStyle(section).backgroundColor === 'rgba(0, 0, 0, 0)',
			leftAligned: Math.abs(section.getBoundingClientRect().left - container.querySelector('.remotes-search-row')!.getBoundingClientRect().left) < 1,
			rightAligned: Math.abs(share.getBoundingClientRect().right - section.getBoundingClientRect().right) < 1,
			descriptionHidden: description.getBoundingClientRect().height === 0,
			label: share.querySelector('.monaco-button')?.textContent,
			systemFirst: section.querySelector('.remotes-this-computer-status')?.firstElementChild?.classList.contains('remotes-this-computer-system'),
			separator: dom.getWindow(section).getComputedStyle(sectionContainer).borderBottomStyle,
			sectionGap: container.querySelector('.remotes-heading')!.getBoundingClientRect().top - section.getBoundingClientRect().bottom,
			headingGap: section.querySelector('.remotes-this-computer-header')!.getBoundingClientRect().top - section.querySelector('.remotes-this-computer-heading')!.getBoundingClientRect().bottom,
			heading: heading.textContent,
			matchingTypography: headingStyle.fontSize === otherHeadingStyle.fontSize && headingStyle.fontWeight === otherHeadingStyle.fontWeight,
			headingLabelsSection: section.getAttribute('aria-labelledby') === heading.id,
			detailsBelowHeading: name.getBoundingClientRect().top >= heading.getBoundingClientRect().bottom,
			detailsAligned: Math.abs(name.getBoundingClientRect().left - heading.getBoundingClientRect().left) < 1,
			nameIsContent: name.tagName === 'DIV' && !name.contains(heading),
		};
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		const question = container.querySelector<HTMLElement>('.remotes-sharing-question')!;
		const icon = container.querySelector<HTMLElement>('.remotes-this-computer-heading > .codicon')!;
		const task = {
			aligned: Math.abs(description.getBoundingClientRect().left - question.getBoundingClientRect().left) < 1,
			descriptionVisible: description.getBoundingClientRect().height > 0,
			iconHiddenOnTask: icon.getBoundingClientRect().height === 0,
			headingHiddenOnTask: heading.getBoundingClientRect().height === 0,
			sharingSeparator: dom.getWindow(section).getComputedStyle(sectionContainer).borderBottomStyle,
		};
		container.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
		tunnel.fireStatus({ type: 'connected', info: { tunnelName: 'shared', isAttached: false }, serviceInstallFailed: false });
		const status = container.querySelector<HTMLElement>('.remotes-sharing-status-icon')!;
		assert.deepStrictEqual({
			collapsed,
			shareAlignment,
			stopAlignment: sharingAlignment(),
			...task,
			headingRestored: heading.getBoundingClientRect().height > 0,
			antenna: !!status.querySelector('.codicon-radio-tower'),
			color: dom.getWindow(status).getComputedStyle(status.querySelector('.codicon')!).color,
		}, {
			collapsed: {
				flat: true, leftAligned: true, rightAligned: true, descriptionHidden: true, label: 'Share This Computer', systemFirst: true, separator: 'none', sectionGap: 24, headingGap: 12,
				heading: 'This computer', matchingTypography: true, headingLabelsSection: true, detailsBelowHeading: true, detailsAligned: true, nameIsContent: true,
			},
			shareAlignment: Array.from({ length: 3 }, () => ({ centered: true, rightAligned: true, statusBelow: true, nameSeparate: true })),
			stopAlignment: Array.from({ length: 3 }, () => ({ centered: true, rightAligned: true, statusBelow: true, nameSeparate: true })),
			aligned: true, descriptionVisible: true, iconHiddenOnTask: true, headingHiddenOnTask: true, sharingSeparator: 'none', headingRestored: true, antenna: true, color: 'rgb(34, 102, 255)',
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
