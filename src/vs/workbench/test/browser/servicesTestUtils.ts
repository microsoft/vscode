/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/editor/editor.contribution'; // make sure to load all contributed editor things into tests
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import EventEmitter = require('vs/base/common/eventEmitter');
import Paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import MainTelemetryService = require('vs/platform/telemetry/browser/mainTelemetryService');
import Storage = require('vs/workbench/common/storage');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import Event from 'vs/base/common/event';
import LifecycleService = require('vs/platform/lifecycle/common/baseLifecycleService');
import Types = require('vs/base/common/types');
import Severity from 'vs/base/common/severity';
import http = require('vs/base/common/http');
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import WorkbenchEditorService = require('vs/workbench/services/editor/common/editorService');
import QuickOpenService = require('vs/workbench/services/quickopen/common/quickOpenService');
import PartService = require('vs/workbench/services/part/common/partService');
import WorkspaceContextService = require('vs/workbench/services/workspace/common/contextService');
import {IEditorInput, IEditorModel, Position, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IMessageService, IConfirmation} from 'vs/platform/message/common/message';
import Lifecycle = require('vs/base/common/lifecycle');
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspace, IConfiguration} from 'vs/platform/workspace/common/workspace';

export const TestWorkspace: IWorkspace = {
	resource: URI.file('C:\\testWorkspace'),
	id: 'testWorkspace',
	name: 'Test Workspace',
	uid: new Date().getTime(),
	mtime: new Date().getTime()
};

export const TestConfiguration: IConfiguration = {
	env: Object.create(null)
};

export class TestContextService implements WorkspaceContextService.IWorkspaceContextService {
	public serviceId = WorkspaceContextService.IWorkspaceContextService;

	private workspace: any;
	private configuration: any;
	private options: any;

	constructor(workspace: any = TestWorkspace, configuration: any = TestConfiguration, options: any = null) {
		this.workspace = workspace;
		this.configuration = configuration;
		this.options = options || {
			globalSettings: {
				settings: {}
			}
		};
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getConfiguration(): IConfiguration {
		return this.configuration;
	}

	public getOptions() {
		return this.options;
	}

	public updateOptions() {

	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return Paths.isEqualOrParent(resource.fsPath, this.workspace.resource.fsPath);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI): string {
		return Paths.makeAbsolute(Paths.normalize(resource.fsPath.substr('c:'.length)));
	}

	public toResource(workspaceRelativePath: string): URI {
		return URI.file(Paths.join('C:\\', workspaceRelativePath));
	}
}

export class TestMessageService implements IMessageService {
	public serviceId = IMessageService;

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

	public setStatusMessage(message: string, autoDisposeAfter: number = -1): Lifecycle.IDisposable {
		return {
			dispose: () => { /* Nothing to do here */ }
		};
	}
}

export class TestTelemetryService implements ITelemetryService {
	public serviceId = ITelemetryService;

	getSessionId(): string {
		return null;
	}

	getMachineId(): string {
		return null;
	}

	getInstanceId(): string {
		return null;
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as(null);
	}

	log(eventName: string, data?: any): void { }
	publicLog(eventName: string, data?: any): void { }

	start(name: string, data?: any, isPublic?: boolean): any {
		return null;
	}

	getAppendersCount(): number {
		return -1;
	}

	getAppenders(): any[] {
		return [];
	}

	addTelemetryAppender(appender): void { }
	removeTelemetryAppender(appender): void { }
	dispose(): void { }
	setInstantiationService(instantiationService: IInstantiationService) { }
}

export class TestPartService implements PartService.IPartService {
	public serviceId = PartService.IPartService;

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

	public isSideBarHidden(): boolean {
		return false;
	}

	public setSideBarHidden(hidden: boolean): void { }

	public isPanelHidden(): boolean {
		return false;
	}

	public setPanelHidden(hidden: boolean): void { }

	public getSideBarPosition() {
		return 0;
	}

	public setSideBarPosition(position): void { }
	public addClass(clazz: string): void { }
	public removeClass(clazz: string): void { }
}

export class TestEventService extends EventEmitter.EventEmitter implements IEventService {
	public serviceId = IEventService;
}

export class TestLifecycleService extends LifecycleService.BaseLifecycleService { }

export class TestStorageService extends EventEmitter.EventEmitter implements IStorageService {
	public serviceId = IStorageService;

	private storage: Storage.Storage;

	constructor() {
		super();

		let context = new TestContextService();
		this.storage = new Storage.Storage(context, new Storage.InMemoryLocalStorage());
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

export class TestRequestService extends BaseRequestService {

	constructor(workspace = TestWorkspace) {
		super(new TestContextService(), new MainTelemetryService.MainTelemetryService());
	}
}

export interface ICustomResponse {
	responseText: string;
	getResponseHeader: (key: string) => string;
}

export interface IMockRequestHandler {
	(url: string): string | ICustomResponse;
}

export class MockRequestService extends BaseRequestService {

	constructor(workspace: any, private handler: IMockRequestHandler) {
		super(new TestContextService(), new MainTelemetryService.MainTelemetryService());
	}

	public makeRequest(options: http.IXHROptions): TPromise<http.IXHRResponse> {
		let data = this.handler(options.url);

		if (!data) {
			return super.makeRequest(options);
		}

		let isString = Types.isString(data);
		let responseText = isString ? <string>data : (<ICustomResponse>data).responseText;
		let getResponseHeader = isString ? () => '' : (<ICustomResponse>data).getResponseHeader;

		return TPromise.as<http.IXHRResponse>({
			responseText: responseText,
			status: 200,
			readyState: 4,
			getResponseHeader: getResponseHeader
		});
	}
}

export class TestUntitledEditorService implements IUntitledEditorService {
	public serviceId = IUntitledEditorService;

	public get(resource: URI) {
		return null;
	}

	public getAll() {
		return [];
	}

	public getDirty() {
		return [];
	}

	public isDirty() {
		return false;
	}

	public createOrGet(resource?: URI) {
		return null;
	}

	public hasAssociatedFilePath(resource: URI) {
		return false;
	}
}

export class TestEditorService implements WorkbenchEditorService.IWorkbenchEditorService {
	public serviceId = WorkbenchEditorService.IWorkbenchEditorService;

	public activeEditorInput;
	public activeEditorOptions;
	public activeEditorPosition;

	private callback: (method: string) => void;

	constructor(callback?: (method: string) => void) {
		this.callback = callback || ((s: string) => { });
	}

	public setEditors(inputs): Promise {
		return TPromise.as([]);
	}

	public closeEditors(othersOnly?: boolean): Promise {
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

		return null;
	}

	public getVisibleEditors(): IEditor[] {
		this.callback('getVisibleEditors');

		return [];
	}

	public activateEditor(position: Position): void;
	public activateEditor(editor: IEditor): void;
	public activateEditor(arg: any): void {
		this.callback('activateEditor');
	}

	public moveEditor(from: Position, to: Position): void {
		this.callback('moveEditor');
	}

	public arrangeEditors(arrangement: WorkbenchEditorService.EditorArrangement): void {
		this.callback('arrangeEditors');
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


	public closeEditor(editor?: IEditor): TPromise<IEditor>;
	public closeEditor(position?: Position): TPromise<IEditor>;
	public closeEditor(arg?: any): TPromise<IEditor> {
		this.callback('closeEditor');

		return TPromise.as(null);
	}

	public focusEditor(editor?: IEditor): TPromise<IEditor>;
	public focusEditor(position?: Position): TPromise<IEditor>;
	public focusEditor(arg?: any): TPromise<IEditor> {
		this.callback('focusEditor');

		return TPromise.as(null);
	}

	public inputToType(input: IResourceInput): TPromise<IEditorInput> {
		return TPromise.as(null);
	}
}

export class TestQuickOpenService implements QuickOpenService.IQuickOpenService {
	public serviceId = QuickOpenService.IQuickOpenService;

	private callback: (prefix: string) => void;

	constructor(callback?: (prefix: string) => void) {
		this.callback = callback;
	}

	pick(arg: any, placeHolder?: string, autoFocusFirst?: boolean): Promise {
		return TPromise.as(null);
	}

	input(options?: any): Promise {
		return TPromise.as(null);
	}

	refresh(): Promise {
		return TPromise.as(true);
	}

	show(prefix?: string, quickNavigateConfiguration?: any): Promise {
		if (this.callback) {
			this.callback(prefix);
		}

		return TPromise.as(true);
	}

	getEditorHistory(): WorkbenchEditorCommon.EditorInput[] {
		return [];
	}

	get onShow(): Event<void> {
		return null;
	}

	get onHide(): Event<void> {
		return null;
	}

	public removeEditorHistoryEntry(input: WorkbenchEditorCommon.EditorInput): void {}
	public dispose() {}
	public quickNavigate(): void {}
}

export const TestFileService = {
	resolveContent: function(resource) {
		return TPromise.as({
			resource: resource,
			value: 'Hello Html',
			etag: 'index.txt',
			mime: 'text/plain',
			encoding: 'utf8',
			mtime: new Date().getTime(),
			name: Paths.basename(resource.fsPath)
		});
	},

	updateContent: function(res) {
		return TPromise.timeout(1).then(() => {
			return {
				resource: res,
				etag: 'index.txt',
				mime: 'text/plain',
				encoding: 'utf8',
				mtime: new Date().getTime(),
				name: Paths.basename(res.fsPath)
			};
		});
	}
};

export class TestConfigurationService extends EventEmitter.EventEmitter implements IConfigurationService {
	public serviceId = IConfigurationService;

	public loadConfiguration(section?:string):TPromise<any> {
		return TPromise.as({});
	}

	public hasWorkspaceConfiguration():boolean {
		return false;
	}

	public onDidUpdateConfiguration() {
		return { dispose() { } };
	}
}