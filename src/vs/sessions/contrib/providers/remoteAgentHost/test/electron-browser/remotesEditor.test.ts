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
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISharedProcessService } from '../../../../../../platform/ipc/electron-browser/services.js';
import { EditorInputCapabilities } from '../../../../../../workbench/common/editor.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../../common/sessionCommands.js';
import { RemotesEditorInput } from '../../browser/remotesEditorInput.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind, RemotesModel } from '../../browser/remotesModel.js';
import { RemotesEditor } from '../../electron-browser/remotesEditor.js';
import '../../electron-browser/remotes.contribution.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
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
	async remove(): Promise<void> { }

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

suite('RemotesEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor() {
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
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
			name: 'Remotes', type: 'sessions.input.remotes', resource: undefined,
			singleton: true, modal: true, options: { compactHeader: true, canMoveToEditorArea: false },
			reused: true, recreated: true, matches: true,
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

	test('Manage routes through the editor service without constructing the Customizations editor', async () => {
		const { instantiation, configuration } = createEditor();
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden: false } });
		const opened: string[] = [];
		instantiation.stub(IEditorService, {
			openEditor: async input => {
				assert.ok(input instanceof RemotesEditorInput);
				store.add(input);
				opened.push(input.typeId);
				return undefined;
			}
		});
		const command = CommandsRegistry.getCommand(OPEN_REMOTES_EDITOR_COMMAND_ID)!;
		await instantiation.invokeFunction(accessor => command.handler(accessor));
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor)), /disabled/);
		assert.deepStrictEqual(opened, ['sessions.input.remotes']);
	});
});
