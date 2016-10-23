/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/parts/files/browser/files.contribution'; // load our contribution into the test
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import * as paths from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { ITelemetryService, NullTelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Storage, InMemoryLocalStorage } from 'vs/workbench/common/storage';
import { IEditorGroup, ConfirmResult } from 'vs/workbench/common/editor';
import Event, { Emitter } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IEditorInput, IEditorOptions, IEditorModel, Position, Direction, IEditor, IResourceInput, ITextEditorModel } from 'vs/platform/editor/common/editor';
import { IEventService } from 'vs/platform/event/common/event';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IMessageService, IConfirmation } from 'vs/platform/message/common/message';
import { IWorkspace, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { EditorStacksModel } from 'vs/workbench/common/editor/editorStacksModel';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEditorGroupService, GroupArrangement } from 'vs/workbench/services/group/common/groupService';
import { TextFileService } from 'vs/workbench/services/textfile/browser/textFileService';
import { IFileService, IResolveContentOptions, IFileOperationResult } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IRawTextContent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { RawText } from 'vs/editor/common/model/textModel';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

export const TestWorkspace: IWorkspace = {
	resource: URI.file('C:\\testWorkspace'),
	name: 'Test Workspace',
	uid: Date.now()
};

export function createFileInput(instantiationService: IInstantiationService, resource: URI): FileEditorInput {
	return instantiationService.createInstance(FileEditorInput, resource, void 0);
}

export const TestEnvironmentService = new EnvironmentService(parseArgs(process.argv), process.execPath);

export class TestContextService implements IWorkspaceContextService {
	public _serviceBrand: any;

	private workspace: any;
	private options: any;

	constructor(workspace: any = TestWorkspace, options: any = null) {
		this.workspace = workspace;
		this.options = options || Object.create(null);
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getOptions() {
		return this.options;
	}

	public updateOptions() {

	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return paths.isEqualOrParent(resource.fsPath, this.workspace.resource.fsPath);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI): string {
		return paths.makePosixAbsolute(paths.normalize(resource.fsPath.substr('c:'.length)));
	}

	public toResource(workspaceRelativePath: string): URI {
		return URI.file(paths.join('C:\\', workspaceRelativePath));
	}
}

export class TestTextFileService extends TextFileService {
	private promptPath: string;
	private confirmResult: ConfirmResult;
	private resolveTextContentError: IFileOperationResult;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(lifecycleService, contextService, configurationService, telemetryService, editorGroupService, editorService, fileService, untitledEditorService, instantiationService);
	}

	public setPromptPath(path: string): void {
		this.promptPath = path;
	}

	public setConfirmResult(result: ConfirmResult): void {
		this.confirmResult = result;
	}

	public setResolveTextContentErrorOnce(error: IFileOperationResult): void {
		this.resolveTextContentError = error;
	}

	public resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent> {
		if (this.resolveTextContentError) {
			const error = this.resolveTextContentError;
			this.resolveTextContentError = null;

			return TPromise.wrapError(error);
		}

		return this.fileService.resolveContent(resource, options).then((content) => {
			const raw = RawText.fromString(content.value, { defaultEOL: 1, detectIndentation: false, insertSpaces: false, tabSize: 4, trimAutoWhitespace: false });

			return <IRawTextContent>{
				resource: content.resource,
				name: content.name,
				mtime: content.mtime,
				etag: content.etag,
				encoding: content.encoding,
				value: raw,
				valueLogicalHash: null
			};
		});
	}

	public promptForPath(defaultPath?: string): string {
		return this.promptPath;
	}

	public confirmSave(resources?: URI[]): ConfirmResult {
		return this.confirmResult;
	}
}

export function workbenchInstantiationService(): IInstantiationService {
	let instantiationService = new TestInstantiationService(new ServiceCollection([ILifecycleService, new TestLifecycleService()]));
	instantiationService.stub(IEventService, new TestEventService());
	instantiationService.stub(IWorkspaceContextService, new TestContextService(TestWorkspace));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IWorkbenchEditorService, new TestEditorService(function () { }));
	instantiationService.stub(IPartService, new TestPartService());
	instantiationService.stub(IEditorGroupService, new TestEditorGroupService());
	instantiationService.stub(IModeService);
	instantiationService.stub(IHistoryService, 'getHistory', []);
	instantiationService.stub(IModelService, createMockModelService(instantiationService));
	instantiationService.stub(IFileService, TestFileService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IMessageService, new TestMessageService());
	instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
	instantiationService.stub(ITextFileService, <ITextFileService>instantiationService.createInstance(TestTextFileService));

	return instantiationService;
}

export class TestMessageService implements IMessageService {
	public _serviceBrand: any;

	private counter: number;

	constructor() {
		this.counter = 0;
	}

	public show(sev: Severity, message: any): () => void {
		this.counter++;

		return null;
	}

	public getCounter() {
		return this.counter;
	}

	public hideAll(): void {
		// No-op
	}

	public confirm(confirmation: IConfirmation): boolean {
		return false;
	}
}

export class TestPartService implements IPartService {
	public _serviceBrand: any;

	public layout(): void { }

	public isCreated(): boolean {
		return true;
	}

	public joinCreation(): Promise {
		return TPromise.as(null);
	}

	public hasFocus(part): boolean {
		return false;
	}

	public isVisible(part): boolean {
		return true;
	}

	public getContainer(part): HTMLElement {
		return null;
	}

	public isStatusBarHidden(): boolean {
		return false;
	}

	public isSideBarHidden(): boolean {
		return false;
	}

	public setSideBarHidden(hidden: boolean): void { }

	public isPanelHidden(): boolean {
		return false;
	}

	public setPanelHidden(hidden: boolean): void { }

	public toggleMaximizedPanel(): void { }

	public getSideBarPosition() {
		return 0;
	}

	public addClass(clazz: string): void { }
	public removeClass(clazz: string): void { }
	public getWorkbenchElementId(): string { return ''; }

	public setRestoreSidebar(): void {

	}
}

export class TestEventService extends EventEmitter implements IEventService {
	public _serviceBrand: any;
}

export class TestStorageService extends EventEmitter implements IStorageService {
	public _serviceBrand: any;

	private storage: Storage;

	constructor() {
		super();

		let context = new TestContextService();
		this.storage = new Storage(new InMemoryLocalStorage(), null, context, TestEnvironmentService);
	}

	store(key: string, value: any, scope: StorageScope = StorageScope.GLOBAL): void {
		this.storage.store(key, value, scope);
	}

	swap(key: string, valueA: any, valueB: any, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: any): void {
		this.storage.swap(key, valueA, valueB, scope, defaultValue);
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

export class TestEditorGroupService implements IEditorGroupService {
	public _serviceBrand: any;

	private stacksModel: EditorStacksModel;

	private _onEditorsChanged: Emitter<void>;
	private _onEditorOpenFail: Emitter<IEditorInput>;
	private _onEditorsMoved: Emitter<void>;

	constructor(callback?: (method: string) => void) {
		this._onEditorsMoved = new Emitter<void>();
		this._onEditorsChanged = new Emitter<void>();
		this._onEditorOpenFail = new Emitter<IEditorInput>();

		let services = new ServiceCollection();

		services.set(IStorageService, new TestStorageService());
		services.set(IConfigurationService, new TestConfigurationService());
		services.set(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		services.set(ILifecycleService, lifecycle);

		let inst = new InstantiationService(services);

		this.stacksModel = inst.createInstance(EditorStacksModel, true);
	}

	public fireChange(): void {
		this._onEditorsChanged.fire();
	}

	public get onEditorsChanged(): Event<void> {
		return this._onEditorsChanged.event;
	}

	public get onEditorOpenFail(): Event<IEditorInput> {
		return this._onEditorOpenFail.event;
	}

	public get onEditorsMoved(): Event<void> {
		return this._onEditorsMoved.event;
	}

	public focusGroup(group: IEditorGroup): void;
	public focusGroup(position: Position): void;
	public focusGroup(arg1: any): void {

	}

	public activateGroup(group: IEditorGroup): void;
	public activateGroup(position: Position): void;
	public activateGroup(arg1: any): void {

	}

	public moveGroup(from: IEditorGroup, to: IEditorGroup): void;
	public moveGroup(from: Position, to: Position): void;
	public moveGroup(arg1: any, arg2: any): void {

	}

	public arrangeGroups(arrangement: GroupArrangement): void {

	}

	public pinEditor(group: IEditorGroup, input: IEditorInput): void;
	public pinEditor(position: Position, input: IEditorInput): void;
	public pinEditor(arg1: any, input: IEditorInput): void {
	}

	public unpinEditor(group: IEditorGroup, input: IEditorInput): void;
	public unpinEditor(position: Position, input: IEditorInput): void;
	public unpinEditor(arg1: any, input: IEditorInput): void {
	}

	public moveEditor(input: IEditorInput, from: IEditorGroup, to: IEditorGroup, index?: number): void;
	public moveEditor(input: IEditorInput, from: Position, to: Position, index?: number): void;
	public moveEditor(input: IEditorInput, from: any, to: any, index?: number): void {
	}

	public getStacksModel(): EditorStacksModel {
		return this.stacksModel;
	}
}

export class TestEditorService implements IWorkbenchEditorService {
	public _serviceBrand: any;

	public activeEditorInput: IEditorInput;
	public activeEditorOptions: IEditorOptions;
	public activeEditorPosition: Position;

	private callback: (method: string) => void;

	constructor(callback?: (method: string) => void) {
		this.callback = callback || ((s: string) => { });
	}

	public openEditors(inputs): Promise {
		return TPromise.as([]);
	}

	public replaceEditors(editors): TPromise<IEditor[]> {
		return TPromise.as([]);
	}

	public closeEditors(position: Position, except?: IEditorInput, direction?: Direction): TPromise<void> {
		return TPromise.as(null);
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		return TPromise.as(null);
	}

	public isVisible(input: IEditorInput, includeDiff: boolean): boolean {
		return false;
	}

	public getActiveEditor(): IEditor {
		this.callback('getActiveEditor');

		return null;
	}

	public getActiveEditorInput(): IEditorInput {
		this.callback('getActiveEditorInput');

		return this.activeEditorInput;
	}

	public getVisibleEditors(): IEditor[] {
		this.callback('getVisibleEditors');

		return [];
	}

	public openEditor(input: any, options?: any, position?: any): Promise {
		this.callback('openEditor');

		this.activeEditorInput = input;
		this.activeEditorOptions = options;
		this.activeEditorPosition = position;

		return TPromise.as(null);
	}

	public resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;
	public resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;
	public resolveEditorModel(input: any, refresh?: boolean): Promise {
		this.callback('resolveEditorModel');

		return input.resolve(refresh);
	}

	public closeEditor(position: Position, input: IEditorInput): TPromise<void> {
		this.callback('closeEditor');

		return TPromise.as(null);
	}

	public createInput(input: IResourceInput): TPromise<IEditorInput> {
		return TPromise.as(null);
	}
}

export class TestQuickOpenService implements IQuickOpenService {
	public _serviceBrand: any;

	private callback: (prefix: string) => void;

	constructor(callback?: (prefix: string) => void) {
		this.callback = callback;
	}

	pick(arg: any, options?: any, token?: any): Promise {
		return TPromise.as(null);
	}

	input(options?: any, token?: any): Promise {
		return TPromise.as(null);
	}

	accept(): void {
	}

	focus(): void {
	}

	close(): void {
	}

	show(prefix?: string, options?: any): Promise {
		if (this.callback) {
			this.callback(prefix);
		}

		return TPromise.as(true);
	}

	get onShow(): Event<void> {
		return null;
	}

	get onHide(): Event<void> {
		return null;
	}

	public dispose() { }
	public quickNavigate(): void { }
}

export const TestFileService = {
	resolveContent: function (resource) {
		return TPromise.as({
			resource: resource,
			value: 'Hello Html',
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			name: paths.basename(resource.fsPath)
		});
	},

	resolveFile: function (resource) {
		return TPromise.as({
			resource: resource,
			etag: Date.now(),
			encoding: 'utf8',
			mtime: Date.now(),
			name: paths.basename(resource.fsPath)
		});
	},

	resolveStreamContent: function (resource) {
		return TPromise.as({
			resource: resource,
			value: {
				on: (event: string, callback: Function): void => {
					if (event === 'data') {
						callback('Hello Html');
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
	},

	updateContent: function (res) {
		return TPromise.timeout(1).then(() => {
			return {
				resource: res,
				etag: 'index.txt',
				encoding: 'utf8',
				mtime: Date.now(),
				name: paths.basename(res.fsPath)
			};
		});
	}
};

export class TestLifecycleService implements ILifecycleService {

	public _serviceBrand: any;

	public willShutdown: boolean;

	private _onWillShutdown = new Emitter<ShutdownEvent>();
	private _onShutdown = new Emitter<void>();

	constructor() {
	}

	public fireShutdown(): void {
		this._onShutdown.fire();
	}

	public fireWillShutdown(event: ShutdownEvent): void {
		this._onWillShutdown.fire(event);
	}

	public get onWillShutdown(): Event<ShutdownEvent> {
		return this._onWillShutdown.event;
	}

	public get onShutdown(): Event<void> {
		return this._onShutdown.event;
	}
}

export function createMockModelService(instantiationService: TestInstantiationService): IModelService {
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	return instantiationService.createInstance(ModelServiceImpl);
}