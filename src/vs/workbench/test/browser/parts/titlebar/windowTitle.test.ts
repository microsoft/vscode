/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace as DerivedIdentityWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { defaultWindowTitle, WindowTitle } from '../../../../browser/parts/titlebar/windowTitle.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { TestViewsService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

suite('Folder Location in Window Title and Command Center', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/repo');
	const alternate = URI.file('/work/repo.worktrees/feature');

	function createLocation(description?: string): IResolvedFolderLocation {
		return { uri: alternate, label: 'feature', description, icon: Codicon.gitBranch, providerId: 'test', builtIn: true };
	}

	function createWindowTitle(windowTitleFormat: string, atAlternate = true) {
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: atAlternate ? alternate : primary, index: 0, name: 'repo' })], false, null, () => false, undefined, primary);
		const onDidChangeLocation = disposables.add(new Emitter<IFolderLocationChangeEvent>());
		const locationService = new class extends mock<IWorkspaceFolderLocationService>() {
			current: IResolvedFolderLocation | undefined = undefined;
			override readonly onDidChangeLocation = onDidChangeLocation.event;
			override getLocation() { return atAlternate ? this.current : undefined; }
		}();

		const configurationService = new TestConfigurationService({ window: { title: windowTitleFormat, titleSeparator: ' - ' } });
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
		instantiationService.stub(IWorkspaceFolderLocationService, locationService);
		instantiationService.stub(IViewsService, new TestViewsService());

		const title = disposables.add(instantiationService.createInstance(WindowTitle, mainWindow));
		return { title, locationService, onDidChangeLocation, workspace };
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
		const { title, locationService, onDidChangeLocation, workspace } = createWindowTitle('${rootName}');

		locationService.current = createLocation('feature-branch');
		const count = await changes(title, () => onDidChangeLocation.fire({ folder: workspace.folders[0], reason: 'programmatic' }));

		assert.deepStrictEqual({ count, info: title.folderLocationInfo?.description }, { count: 1, info: 'feature-branch' });
	});

	test('window title does not fire again when the location is unchanged', async () => {
		const { title, locationService, onDidChangeLocation, workspace } = createWindowTitle('${rootName}');

		locationService.current = createLocation('feature-branch');
		await changes(title, () => onDidChangeLocation.fire({ folder: workspace.folders[0], reason: 'programmatic' }));
		const count = await changes(title, () => onDidChangeLocation.fire({ folder: workspace.folders[0], reason: 'programmatic' }));

		assert.strictEqual(count, 0);
	});

	test('command center label is the folder name at an alternate location regardless of title format and tabs', () => {
		const { title, locationService } = createWindowTitle('constant');
		locationService.current = createLocation('feature-branch');

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

	suite('without a location, titles are identical to a default title without ${folderLocation}', () => {

		const mainDefaultWindowTitle = defaultWindowTitle.replace('${separator}${folderLocation}', '');

		function render(format: string, workspace: Workspace, options?: { dirtyEditor?: boolean; profileName?: string }): { title: string; commandCenter: string[] } {
			const locationService = new class extends mock<IWorkspaceFolderLocationService>() {
				override readonly onDidChangeLocation = Event.None;
				override getLocation() { return undefined; }
			}();
			const editor = options?.dirtyEditor ? new class extends mock<EditorInput>() {
				override get typeId() { return 'test'; }
				override get resource() { return undefined; }
				override readonly onDidChangeDirty = Event.None;
				override readonly onDidChangeLabel = Event.None;
				override getTitle() { return 'file.ts'; }
				override isDirty() { return true; }
				override isSaving() { return false; }
			}() : undefined;
			const profileName = options?.profileName;
			const instantiationService = workbenchInstantiationService({}, disposables);
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ window: { title: format, titleSeparator: ' - ' } }));
			instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
			instantiationService.stub(IWorkspaceFolderLocationService, locationService);
			instantiationService.stub(IViewsService, new TestViewsService());
			if (editor) {
				instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
					override readonly onDidActiveEditorChange = Event.None;
					override get activeEditor() { return editor; }
					override get activeTextEditorLanguageId() { return undefined; }
				}());
			}
			if (profileName) {
				instantiationService.stub(IUserDataProfileService, new class extends mock<IUserDataProfileService>() {
					override readonly onDidChangeCurrentProfile = Event.None;
					override get currentProfile() { return { isDefault: false, name: profileName } as IUserDataProfile; }
				}());
			}
			const title = disposables.add(instantiationService.createInstance(WindowTitle, mainWindow));
			return {
				title: title.getWindowTitle(),
				commandCenter: [title.getCommandCenterLabel({ showFileName: false }), title.getCommandCenterLabel({ showFileName: true }), title.workspaceName]
			};
		}

		const folder = (uri: URI, index: number) => new WorkspaceFolder({ uri, index, name: 'repo' });
		const workspaces: Record<string, () => Workspace> = {
			'single folder': () => new DerivedIdentityWorkspace('id', [folder(primary, 0)]),
			'multi-root': () => new DerivedIdentityWorkspace('id', [folder(primary, 0), folder(alternate, 1)], URI.file('/work/my.code-workspace')),
			'empty': () => new DerivedIdentityWorkspace('id', []),
		};

		for (const [name, createWorkspace] of Object.entries(workspaces)) {
			test(`default window title and command center label are unchanged for ${name} workspace`, () => {
				const options = [{}, { dirtyEditor: true }, { profileName: 'Work' }, { dirtyEditor: true, profileName: 'Work' }];

				assert.deepStrictEqual(
					options.map(option => render(defaultWindowTitle, createWorkspace(), option)),
					options.map(option => render(mainDefaultWindowTitle, createWorkspace(), option)));
			});
		}
	});
});
