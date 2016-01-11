/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/editor/editor.contribution'; // make sure to load all contributed editor things into tests
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import Objects = require('vs/base/common/objects');
import EventEmitter = require('vs/base/common/eventEmitter');
import Strings = require('vs/base/common/strings');
import Paths = require('vs/base/common/paths');
import Env = require('vs/base/common/flags');
import URI from 'vs/base/common/uri';
import MainTelemetryService = require('vs/platform/telemetry/browser/mainTelemetryService');
import Storage = require('vs/workbench/common/storage');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import Viewlet = require('vs/workbench/browser/viewlet');
import InstantiationService = require('vs/platform/instantiation/common/instantiationService');
import Event, {Emitter} from 'vs/base/common/event';
import LifecycleService = require('vs/platform/lifecycle/common/baseLifecycleService');
import Types = require('vs/base/common/types');
import Mime = require('vs/base/common/mime');
import Assert = require('vs/base/common/assert');
import Severity from 'vs/base/common/severity';
import Arrays = require('vs/base/common/arrays');
import Errors = require('vs/base/common/errors');
import http = require('vs/base/common/http');
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import UntitledEditorService = require('vs/workbench/services/untitled/common/untitledEditorService');
import WorkbenchEditorService = require('vs/workbench/services/editor/common/editorService');
import QuickOpenService = require('vs/workbench/services/quickopen/common/quickOpenService');
import ViewletService = require('vs/workbench/services/viewlet/common/viewletService');
import PartService = require('vs/workbench/services/part/common/partService');
import WorkspaceContextService = require('vs/workbench/services/workspace/common/contextService');
import ViewletCommon = require('vs/workbench/common/viewlet');
import Files = require('vs/platform/files/common/files');
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IEditorInput, IEditorModel, IEditorOptions, ITextInput, Position, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IMessageService, IConfirmation} from 'vs/platform/message/common/message';
import Lifecycle = require('vs/base/common/lifecycle');
import {IRequestService} from 'vs/platform/request/common/request';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService, IWorkspace, IConfiguration} from 'vs/platform/workspace/common/workspace';

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
		return Promise.as(null);
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
		return Promise.as([]);
	}

	public closeEditors(othersOnly?: boolean): Promise {
		return Promise.as(null);
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

		return Promise.as(null);
	}

	public resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;
	public resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;
	public resolveEditorModel(input: WorkbenchEditorService.IFileInput, refresh?: boolean): TPromise<ITextEditorModel>;
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

	public inputToType(input: ITextInput): TPromise<IEditorInput> {
		return Promise.as(null);
	}
}

export class TestQuickOpenService implements QuickOpenService.IQuickOpenService {
	public serviceId = QuickOpenService.IQuickOpenService;

	private callback: (prefix: string) => void;

	constructor(callback?: (prefix: string) => void) {
		this.callback = callback;
	}

	pick(arg: any, placeHolder?: string, autoFocusFirst?: boolean): Promise {
		return Promise.as(null);
	}

	input(options?: any): Promise {
		return Promise.as(null);
	}

	refresh(): Promise {
		return Promise.as(true);
	}

	show(prefix?: string, quickNavigateConfiguration?: any): Promise {
		this.callback && this.callback(prefix);

		return Promise.as(true);
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
		return Promise.as({
			resource: resource,
			value: 'Hello Html',
			etag: 'index.txt',
			mime: 'text/plain',
			charset: 'utf8',
			mtime: new Date().getTime(),
			name: Paths.basename(resource.fsPath)
		});
	},

	updateContent: function(res) {
		return Promise.timeout(1).then(() => {
			return {
				resource: res,
				etag: 'index.txt',
				mime: 'text/plain',
				charset: 'utf8',
				mtime: new Date().getTime(),
				name: Paths.basename(res.fsPath)
			};
		});
	}
}

export class TestConfigurationService extends EventEmitter.EventEmitter implements IConfigurationService {
	public serviceId = IConfigurationService;

	public loadConfiguration(section?:string):TPromise<any> {
		return TPromise.as({});
	}

	public hasWorkspaceConfiguration():boolean {
		return false;
	}
}