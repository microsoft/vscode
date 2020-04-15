/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workbenchInstantiationService as browserWorkbenchInstantiationService, ITestInstantiationService, TestLifecycleService, TestFilesConfigurationService, TestFileService, TestFileDialogService, TestPathService } from 'vs/workbench/test/browser/workbenchTestServices';
import { Event } from 'vs/base/common/event';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { NativeWorkbenchEnvironmentService, INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-browser/environmentService';
import { NativeTextFileService, EncodingOracle, IEncodingOverride } from 'vs/workbench/services/textfile/electron-browser/nativeTextFileService';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { INativeOpenDialogOptions } from 'vs/platform/dialogs/node/dialogs';
import { FileOperationError, IFileService } from 'vs/platform/files/common/files';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { URI } from 'vs/base/common/uri';
import { IReadTextFileOptions, ITextFileStreamContent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IOpenEmptyWindowOptions, IWindowOpenable, IOpenWindowOptions } from 'vs/platform/windows/common/windows';
import { parseArgs, OPTIONS } from 'vs/platform/environment/node/argv';
import { LogLevel, ILogService } from 'vs/platform/log/common/log';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { UTF16le, UTF16be, UTF8_with_bom } from 'vs/base/node/encoding';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { NodeTestBackupFileService } from 'vs/workbench/services/backup/test/electron-browser/backupFileService.test';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INativeWindowConfiguration, IOpenedWindow } from 'vs/platform/windows/node/window';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';

export const TestWindowConfiguration: INativeWindowConfiguration = {
	windowId: 0,
	machineId: 'testMachineId',
	sessionId: 'testSessionId',
	logLevel: LogLevel.Error,
	mainPid: 0,
	partsSplashPath: '',
	appRoot: '',
	userEnv: {},
	execPath: process.execPath,
	perfEntries: [],
	...parseArgs(process.argv, OPTIONS)
};

export const TestEnvironmentService = new NativeWorkbenchEnvironmentService(TestWindowConfiguration, process.execPath);

export class TestTextFileService extends NativeTextFileService {
	private resolveTextContentError!: FileOperationError | null;

	constructor(
		@IFileService protected fileService: IFileService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IDialogService dialogService: IDialogService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IProductService productService: IProductService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextModelService textModelService: ITextModelService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IPathService athService: IPathService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@ILogService logService: ILogService
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
			productService,
			filesConfigurationService,
			textModelService,
			codeEditorService,
			athService,
			workingCopyFileService,
			logService
		);
	}

	setResolveTextContentErrorOnce(error: FileOperationError): void {
		this.resolveTextContentError = error;
	}

	async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
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
			size: 10
		};
	}
}

export class TestNativeTextFileServiceWithEncodingOverrides extends NativeTextFileService {

	private _testEncoding: TestEncodingOracle | undefined;
	get encoding(): TestEncodingOracle {
		if (!this._testEncoding) {
			this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
		}

		return this._testEncoding;
	}
}

class TestEncodingOracle extends EncodingOracle {

	protected get encodingOverrides(): IEncodingOverride[] {
		return [
			{ extension: 'utf16le', encoding: UTF16le },
			{ extension: 'utf16be', encoding: UTF16be },
			{ extension: 'utf8bom', encoding: UTF8_with_bom }
		];
	}

	protected set encodingOverrides(overrides: IEncodingOverride[]) { }
}

export class TestSharedProcessService implements ISharedProcessService {

	_serviceBrand: undefined;

	getChannel(channelName: string): any { return undefined; }

	registerChannel(channelName: string, channel: any): void { }

	async toggleSharedProcessWindow(): Promise<void> { }
	async whenSharedProcessReady(): Promise<void> { }
}

export class TestElectronService implements IElectronService {
	_serviceBrand: undefined;

	onWindowOpen: Event<number> = Event.None;
	onWindowMaximize: Event<number> = Event.None;
	onWindowUnmaximize: Event<number> = Event.None;
	onWindowFocus: Event<number> = Event.None;
	onWindowBlur: Event<number> = Event.None;

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
	async focusWindow(options?: { windowId?: number | undefined; } | undefined): Promise<void> { }
	async showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> { throw new Error('Method not implemented.'); }
	async showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> { throw new Error('Method not implemented.'); }
	async showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> { throw new Error('Method not implemented.'); }
	async pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async showItemInFolder(path: string): Promise<void> { }
	async setRepresentedFilename(path: string): Promise<void> { }
	async setDocumentEdited(edited: boolean): Promise<void> { }
	async openExternal(url: string): Promise<boolean> { return false; }
	async updateTouchBar(): Promise<void> { }
	async newWindowTab(): Promise<void> { }
	async showPreviousWindowTab(): Promise<void> { }
	async showNextWindowTab(): Promise<void> { }
	async moveWindowTabToNewWindow(): Promise<void> { }
	async mergeAllWindowTabs(): Promise<void> { }
	async toggleWindowTabsBar(): Promise<void> { }
	async relaunch(options?: { addArgs?: string[] | undefined; removeArgs?: string[] | undefined; } | undefined): Promise<void> { }
	async reload(): Promise<void> { }
	async closeWindow(): Promise<void> { }
	async closeWindowById(): Promise<void> { }
	async quit(): Promise<void> { }
	async openDevTools(options?: Electron.OpenDevToolsOptions | undefined): Promise<void> { }
	async toggleDevTools(): Promise<void> { }
	async startCrashReporter(options: Electron.CrashReporterStartOptions): Promise<void> { }
	async resolveProxy(url: string): Promise<string | undefined> { return undefined; }
}

export function workbenchInstantiationService(): ITestInstantiationService {
	const instantiationService = browserWorkbenchInstantiationService({
		textFileService: insta => <ITextFileService>insta.createInstance(TestTextFileService),
		pathService: insta => <IPathService>insta.createInstance(TestNativePathService)
	});

	instantiationService.stub(IElectronService, new TestElectronService());

	return instantiationService;
}

export class TestServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService,
		@IElectronService public electronService: TestElectronService,
		@IFileDialogService public fileDialogService: TestFileDialogService,
		@IBackupFileService public backupFileService: NodeTestBackupFileService,
		@IWorkingCopyService public workingCopyService: IWorkingCopyService,
		@IEditorService public editorService: IEditorService
	) {
	}
}

export class TestNativePathService extends TestPathService {

	_serviceBrand: undefined;

	constructor(@IWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService) {
		super(environmentService.userHome);
	}
}
