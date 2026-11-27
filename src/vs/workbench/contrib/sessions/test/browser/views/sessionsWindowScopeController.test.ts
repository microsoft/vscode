/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchMode, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchWorkspaceContextService } from '../../../../../services/workspaces/common/workbenchWorkspaceContextService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../../common/chatConstants.js';
import { SessionsListFilters } from '../../../browser/views/sessionsListFilters.js';
import { SessionsWindowScopeController } from '../../../browser/views/sessionsWindowScopeController.js';

suite('SessionsWindowScopeController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type WindowKind = 'agents' | 'empty' | 'folder' | 'multiRoot';

	function createScope({ chatEnabled = true, hidden = false, kind = 'agents' as WindowKind } = {}) {
		const folder = URI.file('/work/repo');
		let scope: URI | undefined = folder;
		const state = kind === 'folder' ? WorkbenchState.FOLDER : kind === 'multiRoot' ? WorkbenchState.WORKSPACE : WorkbenchState.EMPTY;
		const workspace = new class extends mock<IWorkbenchWorkspaceContextService>() {
			override onDidChangeWorkspaceFolders = Event.None;
			override onDidChangeWorkbenchState = Event.None;
			override onDidChangeWorkbenchMode = Event.None;
			override getWorkbenchMode() { return kind === 'agents' ? WorkbenchMode.Agents : WorkbenchMode.Editor; }
			override getWorkbenchState() { return state; }
			override getWorkspace() { return { id: 'repo', uri: folder, folders: [] }; }
			override getWorkbenchScope() { return scope; }
			override setWorkbenchScope(value: URI | undefined) { scope = value; }
			override resetWorkbenchScope() { scope = folder; }
		}();
		const configuration = new TestConfigurationService({ [SESSIONS_LIST_WORKSPACES_FILTER_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const identity = upcastPartial<IUriIdentityService>({ extUri: extUriIgnorePathCase });
		const contextKeyService = new MockContextKeyService();
		contextKeyService.createKey(ChatContextKeys.enabled.key, chatEnabled);
		const sentiment = observableValue<IChatSentiment>('sentiment', { hidden });
		const controller = store.add(new SessionsWindowScopeController(workspace, configuration, identity, contextKeyService, upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment })));
		const storage = store.add(new InMemoryStorageService());
		const filters = () => store.add(new SessionsListFilters(storage, store.add(new NullLogService()), configuration, identity));
		return { controller, workspace, configuration, filters, sentiment };
	}

	test('the window scope follows the bar pick and is released when the setting turns off or the controller is disposed', async () => {
		const { controller, workspace, configuration, filters } = createScope();
		const bar = filters();
		controller.setScopeBarFilters(bar);
		const scopes = [workspace.getWorkbenchScope()?.toString()];
		bar.setInboxWorkspace({ environment: 'local', resource: 'file:///other', label: 'other' });
		scopes.push(workspace.getWorkbenchScope()?.toString());
		const setEnabled = async (value: boolean) => {
			const key = SESSIONS_LIST_WORKSPACES_FILTER_SETTING;
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: section => section === key, affectedKeys: new Set([key]), change: { keys: [key], overrides: [] }, source: ConfigurationTarget.USER });
		};
		await setEnabled(false);
		scopes.push(workspace.getWorkbenchScope()?.toString());
		await setEnabled(true);
		scopes.push(workspace.getWorkbenchScope()?.toString());
		controller.dispose();
		scopes.push(workspace.getWorkbenchScope()?.toString());
		assert.deepStrictEqual(scopes, [undefined, 'file:///other', 'file:///work/repo', 'file:///other', 'file:///work/repo']);
	});

	test('only the Agents window and empty editor windows show the bar and let it scope the window', () => {
		const pick = { environment: 'local', resource: 'file:///other', label: 'other' };
		const result: Record<string, { isScopeBarWindow: boolean; barShown: boolean; scope: string | undefined }> = {};
		for (const kind of ['agents', 'empty', 'folder', 'multiRoot'] as const) {
			const { controller, workspace, filters } = createScope({ kind });
			const bar = filters();
			bar.setInboxWorkspace(pick);
			controller.setScopeBarFilters(bar);
			result[kind] = { isScopeBarWindow: controller.isScopeBarWindow.get(), barShown: controller.barShown.get(), scope: workspace.getWorkbenchScope()?.toString() };
		}
		assert.deepStrictEqual(result, {
			agents: { isScopeBarWindow: true, barShown: true, scope: 'file:///other' },
			empty: { isScopeBarWindow: true, barShown: true, scope: 'file:///other' },
			folder: { isScopeBarWindow: false, barShown: false, scope: 'file:///work/repo' },
			multiRoot: { isScopeBarWindow: false, barShown: false, scope: 'file:///work/repo' },
		});
	});

	test('the bar scopes the window only while AI features are neither disabled nor hidden', () => {
		const pick = { environment: 'local', resource: 'file:///other', label: 'other' };
		const disabled = createScope({ chatEnabled: false });
		const disabledFilters = disabled.filters();
		disabledFilters.setInboxWorkspace(pick);
		disabled.controller.setScopeBarFilters(disabledFilters);
		const hidden = createScope({ hidden: true });
		const hiddenFilters = hidden.filters();
		hiddenFilters.setInboxWorkspace(pick);
		hidden.controller.setScopeBarFilters(hiddenFilters);
		const whileHidden = hidden.workspace.getWorkbenchScope()?.toString();
		hidden.sentiment.set({ hidden: false }, undefined);
		assert.deepStrictEqual({
			disabled: disabled.workspace.getWorkbenchScope()?.toString(),
			whileHidden,
			shown: hidden.workspace.getWorkbenchScope()?.toString(),
		}, { disabled: 'file:///work/repo', whileHidden: 'file:///work/repo', shown: 'file:///other' });
	});

	test('disposing does not clear a window scope another component set later', () => {
		const { controller, workspace, filters } = createScope();
		controller.setScopeBarFilters(filters());
		workspace.setWorkbenchScope(URI.file('/another-owner'));
		controller.dispose();
		assert.strictEqual(workspace.getWorkbenchScope()?.toString(), 'file:///another-owner');
	});
});
