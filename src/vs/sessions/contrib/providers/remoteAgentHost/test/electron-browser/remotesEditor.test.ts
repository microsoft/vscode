/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISharedProcessService } from '../../../../../../platform/ipc/electron-browser/services.js';
import { EditorInputCapabilities, IVisibleEditorPane } from '../../../../../../workbench/common/editor.js';
import { AICustomizationManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ModelsManagementEditorInput } from '../../../../../../workbench/contrib/chat/browser/chatManagement/chatManagementEditorInput.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../../common/sessionCommands.js';
import { IsPhoneLayoutContext } from '../../../../../common/contextkeys.js';
import { Menus } from '../../../../../browser/menus.js';
import { RemotesEditorInput } from '../../browser/remotesEditorInput.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind, RemotesModel } from '../../browser/remotesModel.js';
import { RemotesEditor } from '../../electron-browser/remotesEditor.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../chat/common/constants.js';
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

suite('RemotesEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor() {
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true, [ENVIRONMENT_PICKER_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = workbenchInstantiationService({ configurationService: () => configuration }, store);
		instantiation.stub(ISSHRemoteAgentHostService, {});
		instantiation.stub(IPreferencesService, {});
		instantiation.stub(ISharedProcessService, { getChannel: () => ({ call: async (): Promise<never> => { throw new Error('Unexpected IPC call'); }, listen: () => Event.None }) });
		const model = store.add(new TestRemotesModel());
		instantiation.stubInstance(RemotesModel, model);
		const editor = store.add(instantiation.createInstance(RemotesEditor, new TestEditorGroupView(1)));
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		editor.create(container);
		editor.layout(new dom.Dimension(900, 600));
		const input = store.add(new RemotesEditorInput());
		return { editor, model, container, input, configuration, instantiation };
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
			widgets: container.querySelectorAll('.remotes-widget').length,
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
