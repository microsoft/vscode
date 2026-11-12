/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { WindowTitle } from '../../../../browser/parts/titlebar/windowTitle.js';
import { getCommandCenterLabelText, renderCommandCenterLabel } from '../../../../browser/parts/titlebar/commandCenterControl.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { TestViewsService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

suite('Folder Location in Window Title and Command Center', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/repo');
	const alternate = URI.file('/work/repo.worktrees/feature');

	const noHover = () => Disposable.None;

	function createLocation(description?: string): IResolvedFolderLocation {
		return { uri: alternate, label: 'feature', description, icon: Codicon.gitBranch, providerId: 'test', builtIn: true };
	}

	function createWindowTitle(windowTitleFormat: string) {
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, index: 0, name: 'repo', primaryUri: primary })], false, null, () => false);
		const onDidChangeCurrentLocation = disposables.add(new Emitter<IFolderLocationChangeEvent>());
		const locationService = new class extends mock<IWorkspaceFolderLocationService>() {
			override currentLocation: IResolvedFolderLocation | undefined = undefined;
			override readonly onDidChangeCurrentLocation = onDidChangeCurrentLocation.event;
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

	test('command center label renders the location icon, name and branch group', () => {
		const element = document.createElement('div');

		const hovers: string[] = [];
		const disposable = renderCommandCenterLabel(element, 'repo', createLocation('feature-branch'), (_element, content) => { hovers.push(content); return toDisposable(() => hovers.push('disposed')); });
		disposable.dispose();

		assert.deepStrictEqual({
			hasLocation: element.classList.contains('has-folder-location'),
			aria: element.getAttribute('aria-label'),
			name: element.querySelector('.folder-location-name')?.textContent,
			hasIcon: !!element.querySelector('.folder-location-icon'),
			branch: element.querySelector('.folder-location-branch')?.textContent,
			hovers,
			hasBranchIcon: !!element.querySelector('.folder-location-branch-icon'),
		}, {
			hasLocation: true,
			aria: 'repo, branch feature-branch',
			name: 'repo',
			hasIcon: true,
			branch: 'feature-branch',
			hovers: ['feature-branch', 'disposed'],
			hasBranchIcon: true,
		});
	});

	test('command center label renders the compact worktree icon for the full worktree icon and for no icon', () => {
		const iconClasses = (icon: typeof Codicon.worktree | undefined) => {
			const element = document.createElement('div');
			renderCommandCenterLabel(element, 'repo', { ...createLocation(), icon }, noHover).dispose();
			return element.querySelector('.folder-location-icon')?.className;
		};
		assert.deepStrictEqual([iconClasses(Codicon.worktree), iconClasses(undefined), iconClasses(Codicon.gitBranch)].map(c => /codicon-(worktree-compact|worktree|git-branch)\b/.exec(c ?? '')?.[1]), ['worktree-compact', 'worktree-compact', 'git-branch']);
	});

	test('command center label without a description has no branch group', () => {
		const element = document.createElement('div');

		renderCommandCenterLabel(element, 'repo', createLocation(), noHover).dispose();

		assert.deepStrictEqual({
			aria: element.getAttribute('aria-label'),
			hasBranchGroup: !!element.querySelector('.folder-location-branch-group'),
			name: element.querySelector('.folder-location-name')?.textContent,
		}, { aria: 'repo', hasBranchGroup: false, name: 'repo' });
	});

	test('command center label resets to plain text at the primary location', () => {
		const element = document.createElement('div');
		renderCommandCenterLabel(element, 'repo', createLocation('feature-branch'), noHover).dispose();

		renderCommandCenterLabel(element, 'repo', undefined, noHover).dispose();

		assert.deepStrictEqual({
			hasLocation: element.classList.contains('has-folder-location'),
			aria: element.getAttribute('aria-label'),
			html: element.innerHTML,
		}, { hasLocation: false, aria: null, html: 'repo' });
	});

	test('command center label text is the folder name at an alternate location regardless of title format and tabs', () => {
		const base = { workspaceName: 'repo', customTitle: 'Custom Title', fileName: 'file.ts' };
		assert.deepStrictEqual({
			atLocation: getCommandCenterLabelText({ ...base, atFolderLocation: true }),
			atPrimaryCustom: getCommandCenterLabelText({ ...base, atFolderLocation: false }),
			atPrimaryFile: getCommandCenterLabelText({ workspaceName: 'repo', fileName: 'file.ts', atFolderLocation: false }),
			constantTitle: getCommandCenterLabelText({ workspaceName: 'repo', customTitle: 'constant', atFolderLocation: true }),
			activeEditorTitle: getCommandCenterLabelText({ workspaceName: 'repo', customTitle: 'a.ts', atFolderLocation: true }),
			noTabsEditorChanged: getCommandCenterLabelText({ workspaceName: 'repo', fileName: 'b.ts', atFolderLocation: true }),
			decorated: getCommandCenterLabelText({ ...base, atFolderLocation: true, prefix: '[x]', suffix: '(y)' }),
		}, { atLocation: 'repo', constantTitle: 'repo', activeEditorTitle: 'repo', noTabsEditorChanged: 'repo', atPrimaryCustom: 'Custom Title', atPrimaryFile: 'file.ts', decorated: '[x] repo (y)' });
	});
});
