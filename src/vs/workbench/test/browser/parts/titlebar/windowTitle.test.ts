/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFolderLocation, IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { WindowTitle } from '../../../../browser/parts/titlebar/windowTitle.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { TestViewsService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

suite('Folder Location in Window Title and Command Center', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/repo');
	const alternate = URI.file('/work/repo.worktrees/feature');

	function createLocation(description?: string): IResolvedFolderLocation {
		return { uri: alternate, label: 'feature', description, icon: Codicon.gitBranch, providerId: 'test', builtIn: true };
	}

	function createWindowTitle(windowTitleFormat: string, atAlternate = true) {
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: atAlternate ? alternate : primary, index: 0, name: 'repo' })], false, null, () => false, undefined, primary);
		const onDidChangeCurrentLocation = disposables.add(new Emitter<IFolderLocationChangeEvent>());
		const locationService = new class extends mock<IWorkspaceFolderLocationService>() {
			override currentLocation: IResolvedFolderLocation | undefined = undefined;
			override readonly onDidChangeCurrentLocation = onDidChangeCurrentLocation.event;
			override isAtAlternateLocation() { return atAlternate; }
			override getLocationText(location: IFolderLocation) { return location.label; }
		}();

		const configurationService = new TestConfigurationService({ window: { title: windowTitleFormat, titleSeparator: ' - ' } });
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
		instantiationService.stub(IWorkspaceFolderLocationService, locationService);
		instantiationService.stub(IViewsService, new TestViewsService());

		const title = disposables.add(instantiationService.createInstance(WindowTitle, mainWindow));
		return { title, locationService, onDidChangeCurrentLocation };
	}

	async function changes(title: WindowTitle, action: () => void): Promise<number> {
		let count = 0;
		const listener = title.onDidChange(() => count++);
		action();
		await new Promise(resolve => setTimeout(resolve, 10));
		listener.dispose();
		return count;
	}

	test('window title fires a change on a location change even if a custom title format leaves the title text unchanged', async () => {
		const { title, locationService, onDidChangeCurrentLocation } = createWindowTitle('${rootName}');

		locationService.currentLocation = createLocation('feature-branch');
		const count = await changes(title, () => onDidChangeCurrentLocation.fire({ reason: 'programmatic' }));

		assert.deepStrictEqual({ count, info: title.folderLocationInfo?.description }, { count: 1, info: 'feature-branch' });
	});

	test('window title does not fire again when the location is unchanged', async () => {
		const { title, locationService, onDidChangeCurrentLocation } = createWindowTitle('${rootName}');

		locationService.currentLocation = createLocation('feature-branch');
		await changes(title, () => onDidChangeCurrentLocation.fire({ reason: 'programmatic' }));
		const count = await changes(title, () => onDidChangeCurrentLocation.fire({ reason: 'programmatic' }));

		assert.strictEqual(count, 0);
	});

	test('command center label is the folder name at an alternate location regardless of title format and tabs', () => {
		const { title, locationService } = createWindowTitle('constant');
		locationService.currentLocation = createLocation('feature-branch');

		assert.deepStrictEqual(
			[title.getCommandCenterLabel({ showFileName: false }), title.getCommandCenterLabel({ showFileName: true })],
			[title.workspaceName, title.workspaceName]);
	});

	test('command center label follows the custom title format at the primary location', () => {
		const { title } = createWindowTitle('constant', false);

		assert.deepStrictEqual(
			{ label: title.getCommandCenterLabel({ showFileName: false }), custom: title.getWindowTitle() },
			{ label: 'constant', custom: 'constant' });
	});
});
