/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchMode, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditableWorkspaceContextService } from '../../../../../services/configuration/common/configuration.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../../common/sessionConfig.js';
import { SessionsListFilters } from '../../../browser/views/sessionsListFilters.js';
import { SessionsWorkbenchScopeService } from '../../../browser/views/sessionsWorkbenchScope.js';

suite('SessionsWorkbenchScope', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createScope() {
		const folder = URI.file('/work/repo');
		let scope: URI | undefined = folder;
		const workspace = new class extends mock<IEditableWorkspaceContextService>() {
			override onDidChangeWorkspaceFolders = Event.None;
			override onDidChangeWorkbenchState = Event.None;
			override onDidChangeWorkbenchMode = Event.None;
			override getWorkbenchMode() { return WorkbenchMode.Editor; }
			override getWorkbenchState() { return WorkbenchState.FOLDER; }
			override getWorkspace() { return { id: 'repo', uri: folder, folders: [] }; }
			override getWorkbenchScope() { return scope; }
			override setWorkbenchScope(value: URI | undefined) { scope = value; }
			override resetWorkbenchScope() { scope = folder; }
		}();
		const configuration = new TestConfigurationService({ [SESSIONS_LIST_WORKSPACES_FILTER_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const identity = upcastPartial<IUriIdentityService>({ extUri: extUriIgnorePathCase });
		const service = store.add(new SessionsWorkbenchScopeService(workspace, configuration, identity));
		const storage = store.add(new InMemoryStorageService());
		const filters = () => store.add(new SessionsListFilters(storage, store.add(new NullLogService()), configuration, identity));
		return { service, workspace, configuration, filters };
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
		assert.deepStrictEqual({ scopes, options: service.windowWorkspaces.get().map(option => option.resource) }, {
			scopes: [undefined, 'file:///other', 'file:///other', 'file:///work/repo', 'file:///other', 'file:///work/repo'],
			options: ['file:///work/repo'],
		});
	});

	test('disposing the bar does not clear another component later window scope', () => {
		const { service, workspace, filters } = createScope();
		const registration = store.add(service.registerScopeBar(filters()));
		workspace.setWorkbenchScope(URI.file('/another-owner'));
		registration.dispose();
		assert.strictEqual(workspace.getWorkbenchScope()?.toString(), 'file:///another-owner');
	});
});
