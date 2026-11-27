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
import { IEditableWorkspaceContextService } from '../../../../../services/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../../common/chatConstants.js';
import { SessionsListFilters } from '../../../browser/views/sessionsListFilters.js';
import { SessionsWorkbenchScopeService, windowShowsSessionsScopeBar } from '../../../browser/views/sessionsWorkbenchScope.js';

suite('SessionsWorkbenchScope', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type WindowKind = 'agents' | 'empty' | 'folder' | 'multiRoot';

	function createScope({ chatEnabled = true, hidden = false, kind = 'agents' as WindowKind } = {}) {
		const folder = URI.file('/work/repo');
		let scope: URI | undefined = folder;
		const state = kind === 'folder' ? WorkbenchState.FOLDER : kind === 'multiRoot' ? WorkbenchState.WORKSPACE : WorkbenchState.EMPTY;
		const workspace = new class extends mock<IEditableWorkspaceContextService>() {
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
		const service = store.add(new SessionsWorkbenchScopeService(workspace, configuration, identity, contextKeyService, upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment })));
		const storage = store.add(new InMemoryStorageService());
		const filters = () => store.add(new SessionsListFilters(storage, store.add(new NullLogService()), configuration, identity));
		return { service, workspace, configuration, filters, sentiment };
	}

	test('one window scope follows all registered lists and releases its override on disable or last disposal', async () => {
		const { service, workspace, configuration, filters } = createScope();
		const first = filters();
		const second = filters();
		const firstRegistration = store.add(service.registerScopeBar(first));
		const secondRegistration = store.add(service.registerScopeBar(second));
		const scopes = [workspace.getWorkbenchScope()?.toString()];
		first.setInboxWorkspace({ environment: 'local', resource: 'file:///other', label: 'other' });
		scopes.push(workspace.getWorkbenchScope()?.toString());
		secondRegistration.dispose();
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
		firstRegistration.dispose();
		scopes.push(workspace.getWorkbenchScope()?.toString());
		assert.deepStrictEqual(scopes, [undefined, 'file:///other', 'file:///other', 'file:///work/repo', 'file:///other', 'file:///work/repo']);
	});

	test('the bar shows and scopes the window only in empty editor windows and the Agents window', () => {
		const pick = { environment: 'local', resource: 'file:///other', label: 'other' };
		const result: Record<string, { barShown: boolean; scope: string | undefined }> = {};
		for (const kind of ['agents', 'empty', 'folder', 'multiRoot'] as const) {
			const { service, workspace, filters } = createScope({ kind });
			const bar = filters();
			bar.setInboxWorkspace(pick);
			store.add(service.registerScopeBar(bar));
			result[kind] = { barShown: service.barShown.get(), scope: workspace.getWorkbenchScope()?.toString() };
		}
		assert.deepStrictEqual(result, {
			agents: { barShown: true, scope: 'file:///other' },
			empty: { barShown: true, scope: 'file:///other' },
			folder: { barShown: false, scope: 'file:///work/repo' },
			multiRoot: { barShown: false, scope: 'file:///work/repo' },
		});
	});

	test('only the Agents window and empty editor windows show a bar, whichever grouping asks', () => {
		const result: Record<string, { check: boolean; windowShowsBar: boolean }> = {};
		for (const kind of ['agents', 'empty', 'folder', 'multiRoot'] as const) {
			const { service, workspace } = createScope({ kind });
			result[kind] = { check: windowShowsSessionsScopeBar(workspace), windowShowsBar: service.windowShowsBar.get() };
		}
		assert.deepStrictEqual(result, {
			agents: { check: true, windowShowsBar: true },
			empty: { check: true, windowShowsBar: true },
			folder: { check: false, windowShowsBar: false },
			multiRoot: { check: false, windowShowsBar: false },
		});
	});

	test('a bar scopes the window only while AI features are neither disabled nor hidden', () => {
		const pick = { environment: 'local', resource: 'file:///other', label: 'other' };
		const disabled = createScope({ chatEnabled: false });
		const disabledFilters = disabled.filters();
		disabledFilters.setInboxWorkspace(pick);
		store.add(disabled.service.registerScopeBar(disabledFilters));
		const hidden = createScope({ hidden: true });
		const hiddenFilters = hidden.filters();
		hiddenFilters.setInboxWorkspace(pick);
		store.add(hidden.service.registerScopeBar(hiddenFilters));
		const whileHidden = hidden.workspace.getWorkbenchScope()?.toString();
		hidden.sentiment.set({ hidden: false }, undefined);
		assert.deepStrictEqual({
			disabled: disabled.workspace.getWorkbenchScope()?.toString(),
			whileHidden,
			shown: hidden.workspace.getWorkbenchScope()?.toString(),
		}, { disabled: 'file:///work/repo', whileHidden: 'file:///work/repo', shown: 'file:///other' });
	});

	test('disposing the bar does not clear another component later window scope', () => {
		const { service, workspace, filters } = createScope();
		const registration = store.add(service.registerScopeBar(filters()));
		workspace.setWorkbenchScope(URI.file('/another-owner'));
		registration.dispose();
		assert.strictEqual(workspace.getWorkbenchScope()?.toString(), 'file:///another-owner');
	});
});
