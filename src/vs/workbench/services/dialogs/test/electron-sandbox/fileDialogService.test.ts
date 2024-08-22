/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Schemas } from '../../../../../base/common/network';
import { URI } from '../../../../../base/common/uri';
import { mock } from '../../../../../base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService';
import { ILanguageService } from '../../../../../editor/common/languages/language';
import { ICommandService } from '../../../../../platform/commands/common/commands';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService';
import { IDialogService, IFileDialogService, IOpenDialogOptions, ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs';
import { IFileService } from '../../../../../platform/files/common/files';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { ILabelService } from '../../../../../platform/label/common/label';
import { ILogService } from '../../../../../platform/log/common/log';
import { INativeHostService } from '../../../../../platform/native/common/native';
import { IOpenerService } from '../../../../../platform/opener/common/opener';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces';
import { ISimpleFileDialog } from '../../browser/simpleFileDialog';
import { FileDialogService } from '../../electron-sandbox/fileDialogService';
import { IEditorService } from '../../../editor/common/editorService';
import { BrowserWorkbenchEnvironmentService } from '../../../environment/browser/environmentService';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService';
import { IHistoryService } from '../../../history/common/history';
import { IHostService } from '../../../host/browser/host';
import { IPathService } from '../../../path/common/pathService';
import { BrowserWorkspaceEditingService } from '../../../workspaces/browser/workspaceEditingService';
import { IWorkspaceEditingService } from '../../../workspaces/common/workspaceEditing';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices';

class TestFileDialogService extends FileDialogService {
	constructor(
		private simple: ISimpleFileDialog,
		@IHostService hostService: IHostService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IHistoryService historyService: IHistoryService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IOpenerService openerService: IOpenerService,
		@INativeHostService nativeHostService: INativeHostService,
		@IDialogService dialogService: IDialogService,
		@ILanguageService languageService: ILanguageService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@ILabelService labelService: ILabelService,
		@IPathService pathService: IPathService,
		@ICommandService commandService: ICommandService,
		@IEditorService editorService: IEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ILogService logService: ILogService
	) {
		super(hostService, contextService, historyService, environmentService, instantiationService, configurationService, fileService,
			openerService, nativeHostService, dialogService, languageService, workspacesService, labelService, pathService, commandService, editorService, codeEditorService, logService);
	}

	protected override getSimpleFileDialog() {
		if (this.simple) {
			return this.simple;
		} else {
			return super.getSimpleFileDialog();
		}
	}
}

suite('FileDialogService', function () {

	let instantiationService: TestInstantiationService;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const testFile: URI = URI.file('/test/file');

	setup(async function () {
		disposables.add(instantiationService = workbenchInstantiationService(undefined, disposables));
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration('files', { simpleDialog: { enable: true } });
		instantiationService.stub(IConfigurationService, configurationService);

	});

	test('Local - open/save workspaces availableFilesystems', async function () {
		class TestSimpleFileDialog implements ISimpleFileDialog {
			async showOpenDialog(options: IOpenDialogOptions): Promise<URI | undefined> {
				assert.strictEqual(options.availableFileSystems?.length, 1);
				assert.strictEqual(options.availableFileSystems[0], Schemas.file);
				return testFile;
			}
			async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
				assert.strictEqual(options.availableFileSystems?.length, 1);
				assert.strictEqual(options.availableFileSystems[0], Schemas.file);
				return testFile;
			}
		}

		const dialogService = instantiationService.createInstance(TestFileDialogService, new TestSimpleFileDialog());
		instantiationService.set(IFileDialogService, dialogService);
		const workspaceService: IWorkspaceEditingService = disposables.add(instantiationService.createInstance(BrowserWorkspaceEditingService));
		assert.strictEqual((await workspaceService.pickNewWorkspacePath())?.path.startsWith(testFile.path), true);
		assert.strictEqual(await dialogService.pickWorkspaceAndOpen({}), undefined);
	});

	test('Virtual - open/save workspaces availableFilesystems', async function () {
		class TestSimpleFileDialog {
			async showOpenDialog(options: IOpenDialogOptions): Promise<URI | undefined> {
				assert.strictEqual(options.availableFileSystems?.length, 1);
				assert.strictEqual(options.availableFileSystems[0], Schemas.file);
				return testFile;
			}
			async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
				assert.strictEqual(options.availableFileSystems?.length, 1);
				assert.strictEqual(options.availableFileSystems[0], Schemas.file);
				return testFile;
			}
		}

		instantiationService.stub(IPathService, new class {
			defaultUriScheme: string = 'vscode-virtual-test';
			userHome = async () => URI.file('/user/home');
		} as IPathService);
		const dialogService = instantiationService.createInstance(TestFileDialogService, new TestSimpleFileDialog());
		instantiationService.set(IFileDialogService, dialogService);
		const workspaceService: IWorkspaceEditingService = disposables.add(instantiationService.createInstance(BrowserWorkspaceEditingService));
		assert.strictEqual((await workspaceService.pickNewWorkspacePath())?.path.startsWith(testFile.path), true);
		assert.strictEqual(await dialogService.pickWorkspaceAndOpen({}), undefined);
	});

	test('Remote - open/save workspaces availableFilesystems', async function () {
		class TestSimpleFileDialog implements ISimpleFileDialog {
			async showOpenDialog(options: IOpenDialogOptions): Promise<URI | undefined> {
				assert.strictEqual(options.availableFileSystems?.length, 2);
				assert.strictEqual(options.availableFileSystems[0], Schemas.vscodeRemote);
				assert.strictEqual(options.availableFileSystems[1], Schemas.file);
				return testFile;
			}
			async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
				assert.strictEqual(options.availableFileSystems?.length, 2);
				assert.strictEqual(options.availableFileSystems[0], Schemas.vscodeRemote);
				assert.strictEqual(options.availableFileSystems[1], Schemas.file);
				return testFile;
			}
		}

		instantiationService.set(IWorkbenchEnvironmentService, new class extends mock<BrowserWorkbenchEnvironmentService>() {
			override get remoteAuthority() {
				return 'testRemote';
			}
		});
		instantiationService.stub(IPathService, new class {
			defaultUriScheme: string = Schemas.vscodeRemote;
			userHome = async () => URI.file('/user/home');
		} as IPathService);
		const dialogService = instantiationService.createInstance(TestFileDialogService, new TestSimpleFileDialog());
		instantiationService.set(IFileDialogService, dialogService);
		const workspaceService: IWorkspaceEditingService = disposables.add(instantiationService.createInstance(BrowserWorkspaceEditingService));
		assert.strictEqual((await workspaceService.pickNewWorkspacePath())?.path.startsWith(testFile.path), true);
		assert.strictEqual(await dialogService.pickWorkspaceAndOpen({}), undefined);
	});

	test('Remote - filters default files/folders to RA (#195938)', async function () {
		class TestSimpleFileDialog implements ISimpleFileDialog {
			async showOpenDialog(): Promise<URI | undefined> {
				return testFile;
			}
			async showSaveDialog(): Promise<URI | undefined> {
				return testFile;
			}
		}
		instantiationService.set(IWorkbenchEnvironmentService, new class extends mock<BrowserWorkbenchEnvironmentService>() {
			override get remoteAuthority() {
				return 'testRemote';
			}
		});
		instantiationService.stub(IPathService, new class {
			defaultUriScheme: string = Schemas.vscodeRemote;
			userHome = async () => URI.file('/user/home');
		} as IPathService);


		const dialogService = instantiationService.createInstance(TestFileDialogService, new TestSimpleFileDialog());
		const historyService = instantiationService.get(IHistoryService);
		const getLastActiveWorkspaceRoot = sinon.spy(historyService, 'getLastActiveWorkspaceRoot');
		const getLastActiveFile = sinon.spy(historyService, 'getLastActiveFile');

		await dialogService.defaultFilePath();
		assert.deepStrictEqual(getLastActiveFile.args, [[Schemas.vscodeRemote, 'testRemote']]);
		assert.deepStrictEqual(getLastActiveWorkspaceRoot.args, [[Schemas.vscodeRemote, 'testRemote']]);

		await dialogService.defaultFolderPath();
		assert.deepStrictEqual(getLastActiveWorkspaceRoot.args[1], [Schemas.vscodeRemote, 'testRemote']);
	});
});
