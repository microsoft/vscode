/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/parts/files/electron-browser/files.contribution'; // load our contribution into the test
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { TPromise } from 'vs/base/common/winjs.base';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { ConfirmResult, IEditorInputWithOptions, CloseDirection, IEditorIdentifier, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditorInput, IEditor, IEditorCloseEvent } from 'vs/workbench/common/editor';
import { IEditorOpeningEvent, EditorServiceImpl, IEditorGroupView, EditorGroupsServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { Event, Emitter } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IPartService, Parts, Position as PartPosition, IDimension } from 'vs/workbench/services/part/common/partService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IEditorOptions, IResourceInput } from 'vs/platform/editor/common/editor';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkspaceContextService, IWorkspace as IWorkbenchWorkspace, WorkbenchState, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, Workspace } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService, ShutdownEvent, ShutdownReason, StartupKind, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { FileOperationEvent, IFileService, IResolveContentOptions, FileOperationError, IFileStat, IResolveFileResult, FileChangesEvent, IResolveFileOptions, IContent, IUpdateContentOptions, IStreamContent, ICreateFileOptions, ITextSnapshot, IResourceEncodings } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IRawTextContent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IInstantiationService, ServicesAccessor, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IWindowsService, IWindowService, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, IWindowConfiguration, MenuBarVisibility } from 'vs/platform/windows/common/windows';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { generateUuid } from 'vs/base/common/uuid';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IPosition, Position as EditorPosition } from 'vs/editor/common/core/position';
import { IMenuService, MenuId, IMenu, ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService, MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ITextBufferFactory, DefaultEndOfLine, EndOfLinePreference, IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { IConfirmation, IConfirmationResult, IDialogService, IDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IExtensionService, ProfileSession, IExtensionsStatus, ExtensionPointContribution, IExtensionDescription } from '../services/extensions/common/extensions';
import { IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IDecorationsService, IResourceDecorationChangeEvent, IDecoration, IDecorationData, IDecorationsProvider } from 'vs/workbench/services/decorations/browser/decorations';
import { IDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, GroupsArrangement, GroupDirection, IAddGroupOptions, IMergeGroupOptions, IMoveEditorOptions, ICopyEditorOptions, IEditorReplacement, IGroupChangeEvent, EditorsOrder, IFindGroupScope, EditorGroupLayout } from 'vs/workbench/services/group/common/editorGroupsService';
import { IEditorService, IOpenEditorOverrideHandler } from 'vs/workbench/services/editor/common/editorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { EditorGroup } from 'vs/workbench/common/editor/editorGroup';
import { Dimension } from 'vs/base/browser/dom';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { ILabelService, LabelService } from 'vs/platform/label/common/label';
import { timeout } from 'vs/base/common/async';

export function createFileInput(instantiationService: IInstantiationService, resource: URI): FileEditorInput {
	return instantiationService.createInstance(FileEditorInput, resource, void 0);
}

export const TestEnvironmentService = new EnvironmentService(parseArgs(process.argv), process.execPath);

export class TestContextService implements IWorkspaceContextService {
	public _serviceBrand: any;

	private workspace: Workspace;
	private options: any;

	private readonly _onDidChangeWorkspaceName: Emitter<void>;
	private readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent>;
	private readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState>;

	constructor(workspace: any = TestWorkspace, options: any = null) {
		this.workspace = workspace;
		this.options = options || Object.create(null);
		this._onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
		this._onDidChangeWorkbenchState = new Emitter<WorkbenchState>();
	}

	public get onDidChangeWorkspaceName(): Event<void> {
		return this._onDidChangeWorkspaceName.event;
	}

	public get onDidChangeWorkspaceFolders(): Event<IWorkspaceFoldersChangeEvent> {
		return this._onDidChangeWorkspaceFolders.event;
	}

	public get onDidChangeWorkbenchState(): Event<WorkbenchState> {
		return this._onDidChangeWorkbenchState.event;
	}

	public getFolders(): IWorkspaceFolder[] {
		return this.workspace ? this.workspace.folders : [];
	}

	public getWorkbenchState(): WorkbenchState {
		if (this.workspace.configuration) {
			return WorkbenchState.WORKSPACE;
		}

		if (this.workspace.folders.length) {
			return WorkbenchState.FOLDER;
		}

		return WorkbenchState.EMPTY;
	}

	public getWorkspace(): IWorkbenchWorkspace {
		return this.workspace;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder {
		return this.workspace.getFolder(resource);
	}

	public setWorkspace(workspace: any): void {
		this.workspace = workspace;
	}

	public getOptions() {
		return this.options;
	}

	public updateOptions() {

	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return resources.isEqualOrParent(resource, this.workspace.folders[0].uri);
		}

		return false;
	}

	public toResource(workspaceRelativePath: string): URI {
		return URI.file(paths.join('C:\\', workspaceRelativePath));
	}

	public isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && resources.isEqual(this.workspace.folders[0].uri, workspaceIdentifier);
	}
}

export class TestTextFileService extends TextFileService {
	public cleanupBackupsBeforeShutdownCalled: boolean;

	private promptPath: string;
	private confirmResult: ConfirmResult;
	private resolveTextContentError: FileOperationError;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IBackupFileService backupFileService: IBackupFileService,
		@IWindowsService windowsService: IWindowsService,
		@IHistoryService historyService: IHistoryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModelService modelService: IModelService
	) {
		super(lifecycleService, contextService, configurationService, fileService, untitledEditorService, instantiationService, notificationService, TestEnvironmentService, backupFileService, windowsService, historyService, contextKeyService, modelService);
	}

	public setPromptPath(path: string): void {
		this.promptPath = path;
	}

	public setConfirmResult(result: ConfirmResult): void {
		this.confirmResult = result;
	}

	public setResolveTextContentErrorOnce(error: FileOperationError): void {
		this.resolveTextContentError = error;
	}

	public resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent> {
		if (this.resolveTextContentError) {
			const error = this.resolveTextContentError;
			this.resolveTextContentError = null;

			return TPromise.wrapError<IRawTextContent>(error);
		}

		return this.fileService.resolveContent(resource, options).then((content): IRawTextContent => {
			return {
				resource: content.resource,
				name: content.name,
				mtime: content.mtime,
				etag: content.etag,
				encoding: content.encoding,
				value: createTextBufferFactory(content.value)
			};
		});
	}

	public promptForPath(resource: URI, defaultPath: string): TPromise<string> {
		return TPromise.wrap(this.promptPath);
	}

	public confirmSave(resources?: URI[]): TPromise<ConfirmResult> {
		return TPromise.wrap(this.confirmResult);
	}

	public onFilesConfigurationChange(configuration: any): void {
		super.onFilesConfigurationChange(configuration);
	}

	protected cleanupBackupsBeforeShutdown(): TPromise<void> {
		this.cleanupBackupsBeforeShutdownCalled = true;
		return TPromise.as(void 0);
	}
}

export function workbenchInstantiationService(): IInstantiationService {
	let instantiationService = new TestInstantiationService(new ServiceCollection([ILifecycleService, new TestLifecycleService()]));
	instantiationService.stub(IContextKeyService, <IContextKeyService>instantiationService.createInstance(MockContextKeyService));
	const workspaceContextService = new TestContextService(TestWorkspace);
	instantiationService.stub(IWorkspaceContextService, workspaceContextService);
	const configService = new TestConfigurationService();
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(ITextResourceConfigurationService, new TestTextResourceConfigurationService(configService));
	instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IPartService, new TestPartService());
	instantiationService.stub(IModeService, ModeServiceImpl);
	instantiationService.stub(IHistoryService, new TestHistoryService());
	instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
	instantiationService.stub(IFileService, new TestFileService());
	instantiationService.stub(IBackupFileService, new TestBackupFileService());
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(INotificationService, new TestNotificationService());
	instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
	instantiationService.stub(IWindowService, new TestWindowService());
	instantiationService.stub(IMenuService, new TestMenuService());
	instantiationService.stub(IKeybindingService, new MockKeybindingService());
	instantiationService.stub(IDecorationsService, new TestDecorationsService());
	instantiationService.stub(IExtensionService, new TestExtensionService());
	instantiationService.stub(IWindowsService, new TestWindowsService());
	instantiationService.stub(ITextFileService, <ITextFileService>instantiationService.createInstance(TestTextFileService));
	instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
	instantiationService.stub(IEnvironmentService, TestEnvironmentService);
	instantiationService.stub(IThemeService, new TestThemeService());
	instantiationService.stub(IHashService, new TestHashService());
	instantiationService.stub(ILogService, new TestLogService());
	instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService([new TestEditorGroup(0)]));
	instantiationService.stub(ILabelService, new LabelService(TestEnvironmentService, workspaceContextService));
	const editorService = new TestEditorService();
	instantiationService.stub(IEditorService, editorService);
	instantiationService.stub(ICodeEditorService, new TestCodeEditorService());

	return instantiationService;
}

export class TestLogService implements ILogService {
	_serviceBrand: any; onDidChangeLogLevel: Event<LogLevel>;
	getLevel(): LogLevel { return LogLevel.Info; }
	setLevel(level: LogLevel): void { }
	trace(message: string, ...args: any[]): void { }
	debug(message: string, ...args: any[]): void { }
	info(message: string, ...args: any[]): void { }
	warn(message: string, ...args: any[]): void { }
	error(message: string | Error, ...args: any[]): void { }
	critical(message: string | Error, ...args: any[]): void { }
	dispose(): void { }
}

export class TestDecorationsService implements IDecorationsService {
	_serviceBrand: any;
	onDidChangeDecorations: Event<IResourceDecorationChangeEvent> = Event.None;
	registerDecorationsProvider(provider: IDecorationsProvider): IDisposable { return Disposable.None; }
	getDecoration(uri: URI, includeChildren: boolean, overwrite?: IDecorationData): IDecoration { return void 0; }
}

export class TestExtensionService implements IExtensionService {
	_serviceBrand: any;
	onDidRegisterExtensions: Event<void> = Event.None;
	onDidChangeExtensionsStatus: Event<string[]> = Event.None;
	activateByEvent(activationEvent: string): TPromise<void> { return TPromise.as(void 0); }
	whenInstalledExtensionsRegistered(): TPromise<boolean> { return TPromise.as(true); }
	getExtensions(): TPromise<IExtensionDescription[]> { return TPromise.as([]); }
	readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]> { return TPromise.as(Object.create(null)); }
	getExtensionsStatus(): { [id: string]: IExtensionsStatus; } { return Object.create(null); }
	canProfileExtensionHost(): boolean { return false; }
	getInspectPort(): number { return 0; }
	startExtensionHostProfile(): TPromise<ProfileSession> { return TPromise.as(Object.create(null)); }
	restartExtensionHost(): void { }
	startExtensionHost(): void { }
	stopExtensionHost(): void { }
}

export class TestMenuService implements IMenuService {

	public _serviceBrand: any;

	createMenu(id: MenuId, scopedKeybindingService: IContextKeyService): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => void 0,
			getActions: () => []
		};
	}
}

export class TestHistoryService implements IHistoryService {

	public _serviceBrand: any;

	constructor(private root?: URI) {
	}

	public reopenLastClosedEditor(): void {
	}

	public forward(acrossEditors?: boolean): void {
	}

	public back(acrossEditors?: boolean): void {
	}

	public last(): void {
	}

	public remove(input: IEditorInput | IResourceInput): void {
	}

	public clear(): void {
	}

	public clearRecentlyOpened(): void {
	}

	public getHistory(): (IEditorInput | IResourceInput)[] {
		return [];
	}

	public getLastActiveWorkspaceRoot(schemeFilter: string): URI {
		return this.root;
	}

	public getLastActiveFile(schemeFilter: string): URI {
		return void 0;
	}
}

export class TestDialogService implements IDialogService {

	public _serviceBrand: any;

	public confirm(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		return TPromise.as({ confirmed: false });
	}

	public show(severity: Severity, message: string, buttons: string[], options?: IDialogOptions): TPromise<number> {
		return TPromise.as(0);
	}
}

export class TestPartService implements IPartService {

	public _serviceBrand: any;

	private _onTitleBarVisibilityChange = new Emitter<void>();
	private _onMenubarVisibilityChange = new Emitter<Dimension>();
	private _onEditorLayout = new Emitter<IDimension>();

	public get onTitleBarVisibilityChange(): Event<void> {
		return this._onTitleBarVisibilityChange.event;
	}

	public get onMenubarVisibilityChange(): Event<Dimension> {
		return this._onMenubarVisibilityChange.event;
	}

	public get onEditorLayout(): Event<IDimension> {
		return this._onEditorLayout.event;
	}

	public isCreated(): boolean {
		return true;
	}

	public hasFocus(part: Parts): boolean {
		return false;
	}

	public isVisible(part: Parts): boolean {
		return true;
	}

	public getContainer(part: Parts): HTMLElement {
		return null;
	}

	public isTitleBarHidden(): boolean {
		return false;
	}

	public getTitleBarOffset(): number {
		return 0;
	}

	public isStatusBarHidden(): boolean {
		return false;
	}

	public isActivityBarHidden(): boolean {
		return false;
	}

	public setActivityBarHidden(hidden: boolean): void { }

	public isSideBarHidden(): boolean {
		return false;
	}

	public setSideBarHidden(hidden: boolean): TPromise<void> { return TPromise.as(null); }

	public isPanelHidden(): boolean {
		return false;
	}

	public setPanelHidden(hidden: boolean): TPromise<void> { return TPromise.as(null); }

	public toggleMaximizedPanel(): void { }

	public isPanelMaximized(): boolean {
		return false;
	}

	public getMenubarVisibility(): MenuBarVisibility {
		return null;
	}

	public getSideBarPosition() {
		return 0;
	}

	public getPanelPosition() {
		return 0;
	}

	public setPanelPosition(position: PartPosition): TPromise<void> {
		return TPromise.as(null);
	}

	public addClass(clazz: string): void { }
	public removeClass(clazz: string): void { }
	public getWorkbenchElement(): HTMLElement { return void 0; }

	public toggleZenMode(): void { }

	public isEditorLayoutCentered(): boolean { return false; }
	public centerEditorLayout(active: boolean): void { }


	public resizePart(part: Parts, sizeChange: number): void { }
}

export class TestStorageService implements IStorageService {
	public _serviceBrand: any;

	private storage: StorageService;

	constructor() {
		let context = new TestContextService();
		this.storage = new StorageService(new InMemoryLocalStorage(), null, context.getWorkspace().id);
	}

	store(key: string, value: any, scope: StorageScope = StorageScope.GLOBAL): void {
		this.storage.store(key, value, scope);
	}

	remove(key: string, scope: StorageScope = StorageScope.GLOBAL): void {
		this.storage.remove(key, scope);
	}

	get(key: string, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: string): string {
		return this.storage.get(key, scope, defaultValue);
	}

	getInteger(key: string, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: number): number {
		return this.storage.getInteger(key, scope, defaultValue);
	}

	getBoolean(key: string, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: boolean): boolean {
		return this.storage.getBoolean(key, scope, defaultValue);
	}
}

export class TestEditorGroupsService implements EditorGroupsServiceImpl {
	_serviceBrand: ServiceIdentifier<any>;

	constructor(public groups: TestEditorGroup[] = []) { }

	onDidActiveGroupChange: Event<IEditorGroup> = Event.None;
	onDidAddGroup: Event<IEditorGroup> = Event.None;
	onDidRemoveGroup: Event<IEditorGroup> = Event.None;
	onDidMoveGroup: Event<IEditorGroup> = Event.None;

	orientation: any;
	whenRestored: TPromise<void> = TPromise.as(void 0);

	get activeGroup(): IEditorGroup {
		return this.groups[0];
	}

	get count(): number {
		return this.groups.length;
	}

	getGroups(order?: GroupsOrder): ReadonlyArray<IEditorGroup> {
		return this.groups;
	}

	getGroup(identifier: number): IEditorGroup {
		for (let i = 0; i < this.groups.length; i++) {
			if (this.groups[i].id === identifier) {
				return this.groups[i];
			}
		}

		return void 0;
	}

	getLabel(identifier: number): string {
		return 'Group 1';
	}

	findGroup(scope: IFindGroupScope, source?: number | IEditorGroup, wrap?: boolean): IEditorGroup {
		return null;
	}

	activateGroup(group: number | IEditorGroup): IEditorGroup {
		return null;
	}

	getSize(group: number | IEditorGroup): number {
		return 100;
	}

	setSize(group: number | IEditorGroup, size: number): void { }

	arrangeGroups(arrangement: GroupsArrangement): void { }

	applyLayout(layout: EditorGroupLayout): void { }

	setGroupOrientation(orientation: any): void { }

	addGroup(location: number | IEditorGroup, direction: GroupDirection, options?: IAddGroupOptions): IEditorGroup {
		return null;
	}

	removeGroup(group: number | IEditorGroup): void { }

	moveGroup(group: number | IEditorGroup, location: number | IEditorGroup, direction: GroupDirection): IEditorGroup {
		return null;
	}

	mergeGroup(group: number | IEditorGroup, target: number | IEditorGroup, options?: IMergeGroupOptions): IEditorGroup {
		return null;
	}

	copyGroup(group: number | IEditorGroup, location: number | IEditorGroup, direction: GroupDirection): IEditorGroup {
		return null;
	}
}

export class TestEditorGroup implements IEditorGroupView {

	constructor(public id: number) { }

	group: EditorGroup = void 0;
	activeControl: IEditor;
	activeEditor: IEditorInput;
	previewEditor: IEditorInput;
	count: number;
	disposed: boolean;
	editors: ReadonlyArray<IEditorInput> = [];
	label: string;
	whenRestored: TPromise<void> = TPromise.as(void 0);
	element: HTMLElement;
	minimumWidth: number;
	maximumWidth: number;
	minimumHeight: number;
	maximumHeight: number;

	onWillDispose: Event<void> = Event.None;
	onDidGroupChange: Event<IGroupChangeEvent> = Event.None;
	onWillCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onWillOpenEditor: Event<IEditorOpeningEvent> = Event.None;
	onDidOpenEditorFail: Event<IEditorInput> = Event.None;
	onDidFocus: Event<void> = Event.None;
	onDidChange: Event<{ width: number; height: number; }> = Event.None;

	getEditors(order?: EditorsOrder): ReadonlyArray<IEditorInput> {
		return [];
	}

	getEditor(index: number): IEditorInput {
		return null;
	}

	getIndexOfEditor(editor: IEditorInput): number {
		return -1;
	}

	openEditor(editor: IEditorInput, options?: IEditorOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	openEditors(editors: IEditorInputWithOptions[]): TPromise<void> {
		return TPromise.as(void 0);
	}

	isOpened(editor: IEditorInput): boolean {
		return false;
	}

	isPinned(editor: IEditorInput): boolean {
		return false;
	}

	isActive(editor: IEditorInput): boolean {
		return false;
	}

	moveEditor(editor: IEditorInput, target: IEditorGroup, options?: IMoveEditorOptions): void { }

	copyEditor(editor: IEditorInput, target: IEditorGroup, options?: ICopyEditorOptions): void { }

	closeEditor(editor?: IEditorInput): TPromise<void> {
		return TPromise.as(void 0);
	}

	closeEditors(editors: IEditorInput[] | { except?: IEditorInput; direction?: CloseDirection; savedOnly?: boolean; }): TPromise<void> {
		return TPromise.as(void 0);
	}

	closeAllEditors(): TPromise<void> {
		return TPromise.as(void 0);
	}

	replaceEditors(editors: IEditorReplacement[]): TPromise<void> {
		return TPromise.as(void 0);
	}

	pinEditor(editor?: IEditorInput): void { }

	focus(): void { }

	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		return fn(null);
	}

	isEmpty(): boolean { return true; }
	setActive(isActive: boolean): void { }
	setLabel(label: string): void { }
	shutdown(): void { }
	dispose(): void { }
	toJSON(): object { return Object.create(null); }
	layout(width: number, height: number): void { }
	relayout() { }
}

export class TestEditorService implements EditorServiceImpl {

	_serviceBrand: ServiceIdentifier<any>;

	onDidActiveEditorChange: Event<void> = Event.None;
	onDidVisibleEditorsChange: Event<void> = Event.None;
	onDidCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidOpenEditorFail: Event<IEditorIdentifier> = Event.None;

	activeControl: IEditor;
	activeTextEditorWidget: any;
	activeEditor: IEditorInput;
	editors: ReadonlyArray<IEditorInput> = [];
	visibleControls: ReadonlyArray<IEditor> = [];
	visibleTextEditorWidgets = [];
	visibleEditors: ReadonlyArray<IEditorInput> = [];

	overrideOpenEditor(handler: IOpenEditorOverrideHandler): IDisposable {
		return toDisposable(() => void 0);
	}

	openEditor(editor: any, options?: any, group?: any) {
		return TPromise.as(null);
	}

	openEditors(editors: any, group?: any) {
		return TPromise.as(null);
	}

	isOpen(editor: IEditorInput | IResourceInput | IUntitledResourceInput): boolean {
		return false;
	}

	replaceEditors(editors: any, group: any) {
		return TPromise.as(void 0);
	}

	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		return fn(null);
	}

	createInput(input: IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput): IEditorInput {
		return null;
	}
}

export class TestFileService implements IFileService {

	public _serviceBrand: any;

	public encoding: IResourceEncodings;

	private readonly _onFileChanges: Emitter<FileChangesEvent>;
	private readonly _onAfterOperation: Emitter<FileOperationEvent>;

	private content = 'Hello Html';

	constructor() {
		this._onFileChanges = new Emitter<FileChangesEvent>();
		this._onAfterOperation = new Emitter<FileOperationEvent>();
	}

	public setContent(content: string): void {
		this.content = content;
	}

	public getContent(): string {
		return this.content;
	}

	public get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	public fireFileChanges(event: FileChangesEvent): void {
		this._onFileChanges.fire(event);
	}

	public get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
	}

	public fireAfterOperation(event: FileOperationEvent): void {
		this._onAfterOperation.fire(event);
	}

	resolveFile(resource: URI, options?: IResolveFileOptions): TPromise<IFileStat> {
		return TPromise.as({
			resource,
			etag: Date.now().toString(),
			encoding: 'utf8',
			mtime: Date.now(),
			isDirectory: false,
			name: paths.basename(resource.fsPath)
		});
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): TPromise<IResolveFileResult[]> {
		return TPromise.join(toResolve.map(resourceAndOption => this.resolveFile(resourceAndOption.resource, resourceAndOption.options))).then(stats => stats.map(stat => ({ stat, success: true })));
	}

	existsFile(resource: URI): TPromise<boolean> {
		return TPromise.as(null);
	}

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		return TPromise.as({
			resource: resource,
			value: this.content,
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			name: paths.basename(resource.fsPath)
		});
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		return TPromise.as({
			resource: resource,
			value: {
				on: (event: string, callback: Function): void => {
					if (event === 'data') {
						callback(this.content);
					}
					if (event === 'end') {
						callback();
					}
				}
			},
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			name: paths.basename(resource.fsPath)
		});
	}

	updateContent(resource: URI, value: string | ITextSnapshot, options?: IUpdateContentOptions): TPromise<IFileStat> {
		return TPromise.wrap(timeout(0).then(() => ({
			resource,
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			isDirectory: false,
			name: paths.basename(resource.fsPath)
		})));
	}

	moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		return TPromise.as(null);
	}

	copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		return TPromise.as(null);
	}

	createFile(resource: URI, content?: string, options?: ICreateFileOptions): TPromise<IFileStat> {
		return TPromise.as(null);
	}

	createFolder(resource: URI): TPromise<IFileStat> {
		return TPromise.as(null);
	}

	onDidChangeFileSystemProviderRegistrations = Event.None;

	registerProvider(scheme: string, provider) {
		return { dispose() { } };
	}

	canHandleResource(resource: URI): boolean {
		return resource.scheme === 'file';
	}

	del(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): TPromise<void> {
		return TPromise.as(null);
	}

	watchFileChanges(resource: URI): void {
	}

	unwatchFileChanges(resource: URI): void {
	}

	getWriteEncoding(resource: URI): string {
		return 'utf8';
	}

	dispose(): void {
	}
}

export class TestBackupFileService implements IBackupFileService {
	public _serviceBrand: any;

	public hasBackups(): TPromise<boolean> {
		return TPromise.as(false);
	}

	public hasBackup(resource: URI): TPromise<boolean> {
		return TPromise.as(false);
	}

	public loadBackupResource(resource: URI): TPromise<URI> {
		return this.hasBackup(resource).then(hasBackup => {
			if (hasBackup) {
				return this.toBackupResource(resource);
			}

			return void 0;
		});
	}

	public registerResourceForBackup(resource: URI): TPromise<void> {
		return TPromise.as(void 0);
	}

	public deregisterResourceForBackup(resource: URI): TPromise<void> {
		return TPromise.as(void 0);
	}

	public toBackupResource(resource: URI): URI {
		return null;
	}

	public backupResource(resource: URI, content: ITextSnapshot): TPromise<void> {
		return TPromise.as(void 0);
	}

	public getWorkspaceFileBackups(): TPromise<URI[]> {
		return TPromise.as([]);
	}

	public parseBackupContent(textBufferFactory: ITextBufferFactory): string {
		const textBuffer = textBufferFactory.create(DefaultEndOfLine.LF);
		const lineCount = textBuffer.getLineCount();
		const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
		return textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
	}

	public resolveBackupContent(backup: URI): TPromise<ITextBufferFactory> {
		return TPromise.as(null);
	}

	public discardResourceBackup(resource: URI): TPromise<void> {
		return TPromise.as(void 0);
	}

	public discardAllWorkspaceBackups(): TPromise<void> {
		return TPromise.as(void 0);
	}
}

export class TestCodeEditorService implements ICodeEditorService {
	_serviceBrand: any;

	onCodeEditorAdd: Event<ICodeEditor> = Event.None;
	onCodeEditorRemove: Event<ICodeEditor> = Event.None;
	onDiffEditorAdd: Event<IDiffEditor> = Event.None;
	onDiffEditorRemove: Event<IDiffEditor> = Event.None;
	onDidChangeTransientModelProperty: Event<ITextModel> = Event.None;

	addCodeEditor(editor: ICodeEditor): void { }
	removeCodeEditor(editor: ICodeEditor): void { }
	listCodeEditors(): ICodeEditor[] { return []; }
	addDiffEditor(editor: IDiffEditor): void { }
	removeDiffEditor(editor: IDiffEditor): void { }
	listDiffEditors(): IDiffEditor[] { return []; }
	getFocusedCodeEditor(): ICodeEditor { return null; }
	registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void { }
	removeDecorationType(key: string): void { }
	resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions { return Object.create(null); }
	setTransientModelProperty(model: ITextModel, key: string, value: any): void { }
	getTransientModelProperty(model: ITextModel, key: string) { }
	getActiveCodeEditor(): ICodeEditor { return null; }
	openCodeEditor(input: IResourceInput, source: ICodeEditor, sideBySide?: boolean): TPromise<ICodeEditor> { return TPromise.as(null); }
}

export class TestWindowService implements IWindowService {

	public _serviceBrand: any;

	onDidChangeFocus: Event<boolean> = new Emitter<boolean>().event;
	onDidChangeMaximize: Event<boolean>;

	isFocused(): TPromise<boolean> {
		return TPromise.as(false);
	}

	isMaximized(): TPromise<boolean> {
		return TPromise.as(false);
	}

	getConfiguration(): IWindowConfiguration {
		return Object.create(null);
	}

	getCurrentWindowId(): number {
		return 0;
	}

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	reloadWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	openDevTools(): TPromise<void> {
		return TPromise.as(void 0);
	}

	toggleDevTools(): TPromise<void> {
		return TPromise.as(void 0);
	}

	closeWorkspace(): TPromise<void> {
		return TPromise.as(void 0);
	}

	enterWorkspace(path: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.as(void 0);
	}

	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.as(void 0);
	}

	saveAndEnterWorkspace(path: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.as(void 0);
	}

	toggleFullScreen(): TPromise<void> {
		return TPromise.as(void 0);
	}

	setRepresentedFilename(fileName: string): TPromise<void> {
		return TPromise.as(void 0);
	}

	getRecentlyOpened(): TPromise<IRecentlyOpened> {
		return TPromise.as(void 0);
	}

	focusWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	maximizeWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	unmaximizeWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	minimizeWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	openWindow(paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): TPromise<void> {
		return TPromise.as(void 0);
	}

	closeWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	setDocumentEdited(flag: boolean): TPromise<void> {
		return TPromise.as(void 0);
	}

	onWindowTitleDoubleClick(): TPromise<void> {
		return TPromise.as(void 0);
	}

	show(): TPromise<void> {
		return TPromise.as(void 0);
	}

	showMessageBox(options: Electron.MessageBoxOptions): TPromise<IMessageBoxResult> {
		return TPromise.wrap({ button: 0 });
	}

	showSaveDialog(options: Electron.SaveDialogOptions): TPromise<string> {
		return TPromise.wrap(void 0);
	}

	showOpenDialog(options: Electron.OpenDialogOptions): TPromise<string[]> {
		return TPromise.wrap(void 0);
	}

	updateTouchBar(items: ISerializableCommandAction[][]): TPromise<void> {
		return TPromise.as(void 0);
	}
}

export class TestLifecycleService implements ILifecycleService {

	public _serviceBrand: any;

	public phase: LifecyclePhase;
	public startupKind: StartupKind;

	private _onWillShutdown = new Emitter<ShutdownEvent>();
	private _onShutdown = new Emitter<ShutdownReason>();

	when(): TPromise<void> {
		return TPromise.as(void 0);
	}

	public fireShutdown(reason = ShutdownReason.QUIT): void {
		this._onShutdown.fire(reason);
	}

	public fireWillShutdown(event: ShutdownEvent): void {
		this._onWillShutdown.fire(event);
	}

	public get onWillShutdown(): Event<ShutdownEvent> {
		return this._onWillShutdown.event;
	}

	public get onShutdown(): Event<ShutdownReason> {
		return this._onShutdown.event;
	}
}

export class TestWindowsService implements IWindowsService {

	_serviceBrand: any;

	public windowCount = 1;

	onWindowOpen: Event<number>;
	onWindowFocus: Event<number>;
	onWindowBlur: Event<number>;
	onWindowMaximize: Event<number>;
	onWindowUnmaximize: Event<number>;
	onRecentlyOpenedChange: Event<void>;

	isFocused(windowId: number): TPromise<boolean> {
		return TPromise.as(false);
	}

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	reloadWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	openDevTools(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	toggleDevTools(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	closeWorkspace(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	enterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.as(void 0);
	}

	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.as(void 0);
	}

	saveAndEnterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.as(void 0);
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		return TPromise.as(void 0);
	}

	addRecentlyOpened(files: URI[]): TPromise<void> {
		return TPromise.as(void 0);
	}

	removeFromRecentlyOpened(paths: URI[]): TPromise<void> {
		return TPromise.as(void 0);
	}

	clearRecentlyOpened(): TPromise<void> {
		return TPromise.as(void 0);
	}

	getRecentlyOpened(windowId: number): TPromise<IRecentlyOpened> {
		return TPromise.as(void 0);
	}

	focusWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	closeWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	isMaximized(windowId: number): TPromise<boolean> {
		return TPromise.as(void 0);
	}

	maximizeWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	minimizeWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	unmaximizeWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	onWindowTitleDoubleClick(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	setDocumentEdited(windowId: number, flag: boolean): TPromise<void> {
		return TPromise.as(void 0);
	}

	quit(): TPromise<void> {
		return TPromise.as(void 0);
	}

	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void> {
		return TPromise.as(void 0);
	}

	whenSharedProcessReady(): TPromise<void> {
		return TPromise.as(void 0);
	}

	toggleSharedProcess(): TPromise<void> {
		return TPromise.as(void 0);
	}

	// Global methods
	openWindow(windowId: number, paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): TPromise<void> {
		return TPromise.as(void 0);
	}

	openNewWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	showWindow(windowId: number): TPromise<void> {
		return TPromise.as(void 0);
	}

	getWindows(): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		return TPromise.as(void 0);
	}

	getWindowCount(): TPromise<number> {
		return TPromise.as(this.windowCount);
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		return TPromise.as(void 0);
	}

	showItemInFolder(path: string): TPromise<void> {
		return TPromise.as(void 0);
	}

	newWindowTab(): TPromise<void> {
		return TPromise.as(void 0);
	}

	showPreviousWindowTab(): TPromise<void> {
		return TPromise.as(void 0);
	}

	showNextWindowTab(): TPromise<void> {
		return TPromise.as(void 0);
	}

	moveWindowTabToNewWindow(): TPromise<void> {
		return TPromise.as(void 0);
	}

	mergeAllWindowTabs(): TPromise<void> {
		return TPromise.as(void 0);
	}

	toggleWindowTabsBar(): TPromise<void> {
		return TPromise.as(void 0);
	}

	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): TPromise<void> {
		return TPromise.as(void 0);
	}

	getActiveWindowId(): TPromise<number | undefined> {
		return TPromise.as(undefined);
	}

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(url: string): TPromise<boolean> {
		return TPromise.as(true);
	}

	// TODO: this is a bit backwards
	startCrashReporter(config: Electron.CrashReporterStartOptions): TPromise<void> {
		return TPromise.as(void 0);
	}

	showMessageBox(windowId: number, options: Electron.MessageBoxOptions): TPromise<IMessageBoxResult> {
		return TPromise.as(void 0);
	}

	showSaveDialog(windowId: number, options: Electron.SaveDialogOptions): TPromise<string> {
		return TPromise.as(void 0);
	}

	showOpenDialog(windowId: number, options: Electron.OpenDialogOptions): TPromise<string[]> {
		return TPromise.as(void 0);
	}

	openAboutDialog(): TPromise<void> {
		return TPromise.as(void 0);
	}
}

export class TestTextResourceConfigurationService implements ITextResourceConfigurationService {

	_serviceBrand: any;

	constructor(private configurationService = new TestConfigurationService()) {
	}

	public onDidChangeConfiguration() {
		return { dispose() { } };
	}

	getValue<T>(resource: URI, arg2?: any, arg3?: any): T {
		const position: IPosition = EditorPosition.isIPosition(arg2) ? arg2 : null;
		const section: string = position ? (typeof arg3 === 'string' ? arg3 : void 0) : (typeof arg2 === 'string' ? arg2 : void 0);
		return this.configurationService.getValue(section, { resource });
	}
}

export class TestHashService implements IHashService {
	_serviceBrand: any;

	createSHA1(content: string): string {
		return content;
	}
}

export function getRandomTestPath(tmpdir: string, ...segments: string[]): string {
	return paths.join(tmpdir, ...segments, generateUuid());
}
