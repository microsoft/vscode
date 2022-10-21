/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workbenchInstantiationService as browserWorkbenchInstantiationService, ITestInstantiationService, TestLifecycleService, TestFilesConfigurationService, TestFileService, TestFileDialogService, TestPathService, TestEncodingOracle } from 'vs/workbench/test/browser/workbenchTestServices';
import { Event } from 'vs/base/common/event';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { NativeTextFileService, } from 'vs/workbench/services/textfile/electron-sandbox/nativeTextFileService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { FileOperationError, IFileService } from 'vs/platform/files/common/files';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/model';
import { INativeWorkbenchEnvironmentService, NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IDialogService, IFileDialogService, INativeOpenDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { URI } from 'vs/base/common/uri';
import { IReadTextFileOptions, ITextFileStreamContent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IOpenEmptyWindowOptions, IWindowOpenable, IOpenWindowOptions, IOpenedWindow, IColorScheme, INativeWindowConfiguration } from 'vs/platform/window/common/window';
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
import { MouseInputEvent } from 'vs/base/parts/sandbox/common/electronTypes';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IOSProperties, IOSStatistics } from 'vs/platform/native/common/native';
import { homedir, release, tmpdir, hostname } from 'os';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { getUserDataPath } from 'vs/platform/environment/node/userDataPath';
import product from 'vs/platform/product/common/product';
import { IElevatedFileService } from 'vs/workbench/services/files/common/elevatedFileService';
import { IDecorationsService } from 'vs/workbench/services/decorations/common/decorations';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPartsSplash } from 'vs/platform/theme/common/themeService';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { FileService } from 'vs/platform/files/common/fileService';
import { joinPath } from 'vs/base/common/resources';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { VSBuffer } from 'vs/base/common/buffer';

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
	extensionsResource: undefined
};

export const TestNativeWindowConfiguration: INativeWindowConfiguration = {
	windowId: 0,
	machineId: 'testMachineId',
	logLevel: LogLevel.Error,
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
	profiles: { profile: NULL_PROFILE, all: [NULL_PROFILE] },
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

export class TestSharedProcessService implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	getChannel(channelName: string): any { return undefined; }

	registerChannel(channelName: string, channel: any): void { }

	notifyRestored(): void { }
}

export class TestNativeHostService implements INativeHostService {
	declare readonly _serviceBrand: undefined;

	readonly windowId = -1;

	onDidOpenWindow: Event<number> = Event.None;
	onDidMaximizeWindow: Event<number> = Event.None;
	onDidUnmaximizeWindow: Event<number> = Event.None;
	onDidFocusWindow: Event<number> = Event.None;
	onDidBlurWindow: Event<number> = Event.None;
	onDidResumeOS: Event<unknown> = Event.None;
	onDidChangeColorScheme = Event.None;
	onDidChangePassword = Event.None;
	onDidTriggerSystemContextMenu: Event<{ windowId: number; x: number; y: number }> = Event.None;
	onDidChangeDisplay = Event.None;

	windowCount = Promise.resolve(1);
	getWindowCount(): Promise<number> { return this.windowCount; }

	async getWindows(): Promise<IOpenedWindow[]> { return []; }
	async getActiveWindowId(): Promise<number | undefined> { return undefined; }

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;
	openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async toggleFullScreen(): Promise<void> { }
	async handleTitleDoubleClick(): Promise<void> { }
	async isMaximized(): Promise<boolean> { return true; }
	async maximizeWindow(): Promise<void> { }
	async unmaximizeWindow(): Promise<void> { }
	async minimizeWindow(): Promise<void> { }
	async updateWindowControls(options: { height?: number; backgroundColor?: string; foregroundColor?: string }): Promise<void> { }
	async setMinimumSize(width: number | undefined, height: number | undefined): Promise<void> { }
	async saveWindowSplash(value: IPartsSplash): Promise<void> { }
	async focusWindow(options?: { windowId?: number | undefined } | undefined): Promise<void> { }
	async showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> { throw new Error('Method not implemented.'); }
	async showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> { throw new Error('Method not implemented.'); }
	async showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> { throw new Error('Method not implemented.'); }
	async pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async showItemInFolder(path: string): Promise<void> { }
	async setRepresentedFilename(path: string): Promise<void> { }
	async isAdmin(): Promise<boolean> { return false; }
	async writeElevated(source: URI, target: URI): Promise<void> { }
	async getOSProperties(): Promise<IOSProperties> { return Object.create(null); }
	async getOSStatistics(): Promise<IOSStatistics> { return Object.create(null); }
	async getOSVirtualMachineHint(): Promise<number> { return 0; }
	async getOSColorScheme(): Promise<IColorScheme> { return { dark: true, highContrast: false }; }
	async hasWSLFeatureInstalled(): Promise<boolean> { return false; }
	async killProcess(): Promise<void> { }
	async setDocumentEdited(edited: boolean): Promise<void> { }
	async openExternal(url: string): Promise<boolean> { return false; }
	async updateTouchBar(): Promise<void> { }
	async moveItemToTrash(): Promise<void> { }
	async newWindowTab(): Promise<void> { }
	async showPreviousWindowTab(): Promise<void> { }
	async showNextWindowTab(): Promise<void> { }
	async moveWindowTabToNewWindow(): Promise<void> { }
	async mergeAllWindowTabs(): Promise<void> { }
	async toggleWindowTabsBar(): Promise<void> { }
	async installShellCommand(): Promise<void> { }
	async uninstallShellCommand(): Promise<void> { }
	async notifyReady(): Promise<void> { }
	async relaunch(options?: { addArgs?: string[] | undefined; removeArgs?: string[] | undefined } | undefined): Promise<void> { }
	async reload(): Promise<void> { }
	async closeWindow(): Promise<void> { }
	async closeWindowById(): Promise<void> { }
	async quit(): Promise<void> { }
	async exit(code: number): Promise<void> { }
	async openDevTools(options?: Electron.OpenDevToolsOptions | undefined): Promise<void> { }
	async toggleDevTools(): Promise<void> { }
	async toggleSharedProcessWindow(): Promise<void> { }
	async resolveProxy(url: string): Promise<string | undefined> { return undefined; }
	async findFreePort(startPort: number, giveUpAfter: number, timeout: number, stride?: number): Promise<number> { return -1; }
	async readClipboardText(type?: 'selection' | 'clipboard' | undefined): Promise<string> { return ''; }
	async writeClipboardText(text: string, type?: 'selection' | 'clipboard' | undefined): Promise<void> { }
	async readClipboardFindText(): Promise<string> { return ''; }
	async writeClipboardFindText(text: string): Promise<void> { }
	async writeClipboardBuffer(format: string, buffer: VSBuffer, type?: 'selection' | 'clipboard' | undefined): Promise<void> { }
	async readClipboardBuffer(format: string): Promise<VSBuffer> { return VSBuffer.wrap(Uint8Array.from([])); }
	async hasClipboard(format: string, type?: 'selection' | 'clipboard' | undefined): Promise<boolean> { return false; }
	async sendInputEvent(event: MouseInputEvent): Promise<void> { }
	async windowsGetStringRegKey(hive: 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE' | 'HKEY_CLASSES_ROOT' | 'HKEY_USERS' | 'HKEY_CURRENT_CONFIG', path: string, name: string): Promise<string | undefined> { return undefined; }
	async profileRenderer(): Promise<boolean> { return false; }
}

export function workbenchInstantiationService(disposables = new DisposableStore()): ITestInstantiationService {
	const instantiationService = browserWorkbenchInstantiationService({
		textFileService: insta => <ITextFileService>insta.createInstance(TestTextFileService),
		pathService: insta => <IPathService>insta.createInstance(TestNativePathService)
	}, disposables);

	instantiationService.stub(INativeHostService, new TestNativeHostService());
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
