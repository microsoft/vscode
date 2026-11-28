/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { SessionWorkspaceRenamePlacementContribution } from '../../../browser/workspaceEditor/sessionWorkspaceRenamePlacement.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../../../common/sessionConfig.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService } from '../../../common/sessionWorkspaces.js';

suite('SessionWorkspaceRenamePlacementContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('gives a renamed workspace\'s group placement to its new row, once workspaces are enabled, but not a former file that another workspace has now, also by a name that differs only in case', async () => {
		const workspace = (path: string, previous: string[] = []): IRecentSessionWorkspace => ({ uri: URI.file(path), name: path, folders: [], owned: true, previousUris: previous.map(p => URI.file(p)) });
		const workspaces = observableValue<readonly IRecentSessionWorkspace[]>('workspaces', [workspace('/user/A.code-workspace', ['/user/Old.code-workspace'])]);
		const renames: string[] = [];
		const configurationService = new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: false });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		disposables.add(new SessionWorkspaceRenamePlacementContribution(
			new class extends mock<ISessionWorkspacesService>() { override readonly workspaces = workspaces; },
			new class extends mock<ISessionGroupsService>() { override renameSection(sectionId: string, newSectionId: string) { renames.push(`${sectionId} -> ${newSectionId}`); } },
			new class extends mock<IUriIdentityService>() { override readonly extUri = extUriIgnorePathCase; },
			configurationService,
			new class extends mock<IProductService>() { override readonly quality = 'insider'; },
		));
		const disabled = [...renames];
		await configurationService.setUserConfiguration(SESSIONS_WORKSPACES_ENABLED_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set([SESSIONS_WORKSPACES_ENABLED_SETTING]), change: { keys: [], overrides: [] }, source: ConfigurationTarget.USER });
		const enabled = renames.splice(0);
		// Renamed again, and a new workspace has the first file now
		workspaces.set([workspace('/user/B.code-workspace', ['/user/Old.code-workspace', '/user/A.code-workspace']), workspace('/user/Old.code-workspace')], undefined);
		const renamedAgain = renames.splice(0);
		// The first file is another workspace's, by a name that differs only in case, which the file system ignores
		workspaces.set([workspace('/user/C.code-workspace', ['/user/B.code-workspace']), workspace('/user/b.CODE-workspace')], undefined);

		assert.deepStrictEqual({ disabled, enabled, renamedAgain, caseVariant: renames }, {
			disabled: [],
			enabled: ['workspace:file:///user/old.code-workspace -> workspace:file:///user/a.code-workspace'],
			renamedAgain: ['workspace:file:///user/a.code-workspace -> workspace:file:///user/b.code-workspace'],
			caseVariant: [],
		});
	});

	test('moves no placement in Stable, which does not offer workspaces, also when the setting is written by hand', () => {
		const renames: string[] = [];
		const configurationService = new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		disposables.add(new SessionWorkspaceRenamePlacementContribution(
			new class extends mock<ISessionWorkspacesService>() { override readonly workspaces = observableValue<readonly IRecentSessionWorkspace[]>('workspaces', [{ uri: URI.file('/user/A.code-workspace'), name: 'A', folders: [], owned: true, previousUris: [URI.file('/user/Old.code-workspace')] }]); },
			new class extends mock<ISessionGroupsService>() { override renameSection(sectionId: string, newSectionId: string) { renames.push(`${sectionId} -> ${newSectionId}`); } },
			new class extends mock<IUriIdentityService>() { override readonly extUri = extUriIgnorePathCase; },
			configurationService,
			new class extends mock<IProductService>() { override readonly quality = 'stable'; },
		));

		assert.deepStrictEqual(renames, []);
	});
});
