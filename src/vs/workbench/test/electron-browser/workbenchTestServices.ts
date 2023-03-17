/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITestInstantiationService, TestLifecycleService, TestFilesConfigurationService, TestFileService, TestFileDialogService, TestPathService, TestEncodingOracle } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestNativeHostService, workbenchInstantiationService as electronSandboxWorkbenchInstantiationService } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';
import { NativeTextFileService, } from 'vs/workbench/services/textfile/electron-sandbox/nativeTextFileService';
import { FileOperationError, IFileService } from 'vs/platform/files/common/files';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/model';
import { INativeWorkbenchEnvironmentService, NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { URI } from 'vs/base/common/uri';
import { IReadTextFileOptions, ITextFileStreamContent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { INativeWindowConfiguration } from 'vs/platform/window/common/window';
import { parseArgs, OPTIONS } from 'vs/platform/environment/node/argv';
import { LogLevel, ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { NodeTestWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/test/electron-browser/workingCopyBackupService.test';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TestContextService, TestProductService } from 'vs/workbench/test/common/workbenchTestServices';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { INativeHostService } from 'vs/platform/native/common/native';
import { homedir, release, tmpdir, hostname } from 'os';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { getUserDataPath } from 'vs/platform/environment/node/userDataPath';
import product from 'vs/platform/product/common/product';
import { IElevatedFileService } from 'vs/workbench/services/files/common/elevatedFileService';
import { IDecorationsService } from 'vs/workbench/services/decorations/common/decorations';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { FileService } from 'vs/platform/files/common/fileService';
import { joinPath } from 'vs/base/common/resources';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

const args = parseArgs(process.argv, OPTIONS);

const homeDir = homedir();
const NULL_PROFILE = {
	name: '',
	id: '',
	shortName: '',
	isDefault: false,
	location: URI.file(homeDir),
	settingsResource: joinPath(URI.file(homeDir), 'settings.json'),
	globalStorageHome: joinPath(URI.file(homeDir), 'globalStorage'),
	keybindingsResource: joinPath(URI.file(homeDir), 'keybindings.json'),
	tasksResource: joinPath(URI.file(homeDir), 'tasks.json'),
	snippetsHome: joinPath(URI.file(homeDir), 'snippets'),
	extensionsResource: joinPath(URI.file(homeDir), 'extensions.json'),
	cacheHome: joinPath(URI.file(homeDir), 'cache')
};

export const TestNativeWindowConfiguration: INativeWindowConfiguration = {
	windowId: 0,
	machineId: 'testMachineId',
	logLevel: LogLevel.Error,
	loggers: { global: [], window: [] },
	mainPid: 0,
	appRoot: '',
	userEnv: {},
	execPath: process.execPath,
	perfMarks: [],
	colorScheme: { dark: true, highContrast: false },
	os: { release: release(), hostname: hostname() },
	product,
	homeDir: homeDir,
	tmpDir: tmpdir(),
	userDataDir: getUserDataPath(args, product.nameShort),
	profiles: { profile: NULL_PROFILE, all: [NULL_PROFILE], home: URI.file(homeDir) },
	preferUtilityProcess: false,
	...args
};

export const TestEnvironmentService = new NativeWorkbenchEnvironmentService(TestNativeWindowConfiguration, TestProductService);

export class TestTextFileService extends NativeTextFileService {
	private resolveTextContentError!: FileOperationError | null;

	constructor(
		@IFileService fileService: IFileService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IDialogService dialogService: IDialogService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IPathService pathService: IPathService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@ILogService logService: ILogService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILanguageService languageService: ILanguageService,
		@IElevatedFileService elevatedFileService: IElevatedFileService,
		@IDecorationsService decorationsService: IDecorationsService
	) {
		super(
			fileService,
			untitledTextEditorService,
			lifecycleService,
			instantiationService,
			modelService,
			environmentService,
			dialogService,
			fileDialogService,
			textResourceConfigurationService,
			filesConfigurationService,
			codeEditorService,
			pathService,
			workingCopyFileService,
			uriIdentityService,
			languageService,
			elevatedFileService,
			logService,
			decorationsService
		);
	}

	setResolveTextContentErrorOnce(error: FileOperationError): void {
		this.resolveTextContentError = error;
	}

	override async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
		if (this.resolveTextContentError) {
			const error = this.resolveTextContentError;
			this.resolveTextContentError = null;

			throw error;
		}

		const content = await this.fileService.readFileStream(resource, options);
		return {
			resource: content.resource,
			name: content.name,
			mtime: content.mtime,
			ctime: content.ctime,
			etag: content.etag,
			encoding: 'utf8',
			value: await createTextBufferFactoryFromStream(content.value),
			size: 10,
			readonly: false
		};
	}
}

export class TestNativeTextFileServiceWithEncodingOverrides extends NativeTextFileService {

	private _testEncoding: TestEncodingOracle | undefined;
	override get encoding(): TestEncodingOracle {
		if (!this._testEncoding) {
			this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
		}

		return this._testEncoding;
	}
}

export function workbenchInstantiationService(disposables = new DisposableStore()): ITestInstantiationService {
	const instantiationService = electronSandboxWorkbenchInstantiationService({
		textFileService: insta => <ITextFileService>insta.createInstance(TestTextFileService),
		pathService: insta => <IPathService>insta.createInstance(TestNativePathService)
	}, disposables);

	instantiationService.stub(IEnvironmentService, TestEnvironmentService);
	instantiationService.stub(INativeEnvironmentService, TestEnvironmentService);
	instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);
	instantiationService.stub(INativeWorkbenchEnvironmentService, TestEnvironmentService);
	const fileService = new FileService(new NullLogService());
	const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, new UserDataProfilesService(TestEnvironmentService, fileService, new UriIdentityService(fileService), new NullLogService()));
	instantiationService.stub(IUserDataProfileService, new UserDataProfileService(userDataProfilesService.defaultProfile, userDataProfilesService));

	return instantiationService;
}

export class TestServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelService,
		@IFileService public fileService: TestFileService,
		@INativeHostService public nativeHostService: TestNativeHostService,
		@IFileDialogService public fileDialogService: TestFileDialogService,
		@IWorkingCopyBackupService public workingCopyBackupService: NodeTestWorkingCopyBackupService,
		@IWorkingCopyService public workingCopyService: IWorkingCopyService,
		@IEditorService public editorService: IEditorService
	) {
	}
}

export class TestNativePathService extends TestPathService {

	constructor() {
		super(URI.file(homedir()));
	}
}
