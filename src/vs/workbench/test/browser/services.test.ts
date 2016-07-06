/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import {IRequestService} from 'vs/platform/request/common/request';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ILifecycleService, NullLifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IFileService} from 'vs/platform/files/common/files';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import PartService = require('vs/workbench/services/part/common/partService');
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, TextEditorOptions} from 'vs/workbench/common/editor';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {StringEditorModel} from 'vs/workbench/common/editor/stringEditorModel';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {TestTextFileService, TestEventService, TestPartService, TestStorageService, TestConfigurationService, TestRequestService, TestContextService, TestWorkspace, TestEditorService, MockRequestService} from 'vs/workbench/test/common/servicesTestUtils';
import {Viewlet} from 'vs/workbench/browser/viewlet';
import {EventType} from 'vs/workbench/common/events';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IUntitledEditorService, UntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {WorkbenchProgressService, ScopedService} from 'vs/workbench/services/progress/browser/progressService';
import {DelegatingWorkbenchEditorService, WorkbenchEditorService, IEditorPart} from 'vs/workbench/services/editor/browser/editorService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {Position, Direction, IEditor} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {createMockModeService, createMockModelService} from 'vs/editor/test/common/servicesTestUtils';

let activeViewlet: Viewlet = <any>{};
let activeEditor: BaseEditor = <any>{
	getSelection: function () {
		return 'test.selection';
	}
};

let openedEditorInput;
let openedEditorOptions;
let openedEditorPosition;

function toResource(path) {
	return URI.file(paths.join('C:\\', path));
}

class TestEditorPart implements IEditorPart {
	private activeInput;

	public getId(): string {
		return null;
	}

	public openEditors(args: any[]): Promise {
		return TPromise.as([]);
	}

	public replaceEditors(editors: { toReplace: EditorInput, replaceWith: EditorInput, options?: any }[]): TPromise<IEditor[]> {
		return TPromise.as([]);
	}

	public closeEditors(position: Position, except?: EditorInput, direction?: Direction): TPromise<void> {
		return TPromise.as(null);
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		return TPromise.as(null);
	}

	public closeEditor(position: Position, input: EditorInput): TPromise<void> {
		return TPromise.as(null);
	}

	public openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, position?: Position): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, arg?: any): TPromise<BaseEditor> {
		openedEditorInput = input;
		openedEditorOptions = options;
		openedEditorPosition = arg;

		return TPromise.as(activeEditor);
	}

	public getActiveEditor(): BaseEditor {
		return activeEditor;
	}

	public setActiveEditorInput(input: EditorInput) {
		this.activeInput = input;
	}

	public getActiveEditorInput(): EditorInput {
		return this.activeInput;
	}

	public getVisibleEditors(): IEditor[] {
		return [activeEditor];
	}
}

class TestViewletService implements IViewletService {
	public serviceId = IViewletService;
	public openViewlet(id: string, focus?: boolean): Promise {
		return TPromise.as(null);
	}

	public getActiveViewlet(): IViewlet {
		return activeViewlet;
	}

	public dispose() {
	}
}

class TestScopedService extends ScopedService {
	public isActive: boolean;

	constructor(eventService: IEventService) {
		super(eventService, 'test.scopeId');
	}

	public onScopeActivated() {
		this.isActive = true;
	}

	public onScopeDeactivated() {
		this.isActive = false;
	}
}

class TestProgressBar {
	public fTotal: number;
	public fWorked: number;
	public fInfinite: boolean;
	public fDone: boolean;

	constructor() {
	}

	public infinite() {
		this.fDone = null;
		this.fInfinite = true;

		return this;
	}

	public total(total: number) {
		this.fDone = null;
		this.fTotal = total;

		return this;
	}

	public hasTotal() {
		return !!this.fTotal;
	}

	public worked(worked: number) {
		this.fDone = null;

		if (this.fWorked) {
			this.fWorked += worked;
		} else {
			this.fWorked = worked;
		}

		return this;
	}

	public done() {
		this.fDone = true;

		this.fInfinite = null;
		this.fWorked = null;
		this.fTotal = null;

		return this;
	}

	public stop() {
		return this.done();
	}

	public getContainer() {
		return {
			show: function () { },
			hide: function () { }
		};
	}
}

suite('Workbench UI Services', () => {

	test('WorkbenchEditorService', function () {
		const TestFileService = {
			resolveContent: function (resource) {
				return TPromise.as({
					resource: resource,
					value: 'Hello Html',
					etag: 'index.txt',
					mime: 'text/plain',
					encoding: 'utf8',
					mtime: new Date().getTime(),
					name: paths.basename(resource.fsPath)
				});
			},

			resolveStreamContent: function (resource) {
				return TPromise.as({
					resource: resource,
					value: {
						on: (event:string, callback:Function): void => {
							if (event === 'data') {
								callback('Hello Html');
							}
							if (event === 'end') {
								callback();
							}
						}
					},
					etag: 'index.txt',
					mime: 'text/plain',
					encoding: 'utf8',
					mtime: new Date().getTime(),
					name: paths.basename(resource.fsPath)
				});
			},

			updateContent: function (res) {
				return TPromise.timeout(1).then(() => {
					return {
						resource: res,
						etag: 'index.txt',
						mime: 'text/plain',
						encoding: 'utf8',
						mtime: new Date().getTime(),
						name: paths.basename(res.fsPath)
					};
				});
			}
		};

		let editorService = new TestEditorService(function () { });
		let eventService = new TestEventService();
		let contextService = new TestContextService(TestWorkspace);
		let requestService = new MockRequestService(TestWorkspace, (url) => {
			if (/index\.html$/.test(url)) {
				return {
					responseText: 'Hello Html',
					getResponseHeader: key => ({
						'content-length': '1000',
						'last-modified': new Date().toUTCString(),
						'content-type': 'text/html'
					})[key.toLowerCase()]
				};
			}

			return null;
		});
		let telemetryService = NullTelemetryService;

		let services = new ServiceCollection();
		let inst = new InstantiationService(services);
		services.set(IEventService, eventService);
		services.set(IWorkspaceContextService, contextService);
		services.set(IRequestService, requestService);
		services.set(ITelemetryService, telemetryService);
		services.set(IConfigurationService, new TestConfigurationService());
		services.set(IUntitledEditorService, inst.createInstance(UntitledEditorService));
		services.set(IStorageService, new TestStorageService());
		services.set(IWorkbenchEditorService, editorService);
		services.set(PartService.IPartService, new TestPartService());
		services.set(IModeService, createMockModeService());
		services.set(IModelService, createMockModelService());
		services.set(ILifecycleService, NullLifecycleService);
		services.set(IFileService, <any> TestFileService);

		services.set(ITextFileService, <ITextFileService>inst.createInstance(<any>TestTextFileService));
		services['instantiationService'] = inst;

		let activeInput: EditorInput = inst.createInstance(FileEditorInput, toResource('/something.js'), 'text/javascript', void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);
		let service: WorkbenchEditorService = <any>inst.createInstance(<any>WorkbenchEditorService, testEditorPart);

		assert.strictEqual(service.getActiveEditor(), activeEditor);
		assert.strictEqual(service.getActiveEditorInput(), activeInput);

		// Open EditorInput
		service.openEditor(activeInput, null).then((editor) => {
			assert.strictEqual(openedEditorInput, activeInput);
			assert.strictEqual(openedEditorOptions, null);
			assert.strictEqual(editor, activeEditor);
			assert.strictEqual(service.getVisibleEditors().length, 1);
			assert(service.getVisibleEditors()[0] === editor);
		});

		service.openEditor(activeInput, null, Position.LEFT).then((editor) => {
			assert.strictEqual(openedEditorInput, activeInput);
			assert.strictEqual(openedEditorOptions, null);
			assert.strictEqual(editor, activeEditor);
			assert.strictEqual(service.getVisibleEditors().length, 1);
			assert(service.getVisibleEditors()[0] === editor);
		});

		// Open Untyped Input
		service.openEditor({ resource: toResource('/index.html'), mime: 'text/html', options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof FileEditorInput);
			let contentInput = <FileEditorInput>openedEditorInput;
			assert.strictEqual(contentInput.getResource().fsPath, toResource('/index.html').fsPath);
			assert.strictEqual(contentInput.getMime(), 'text/html');

			assert(openedEditorOptions instanceof TextEditorOptions);
			let textEditorOptions = <TextEditorOptions>openedEditorOptions;
			assert(textEditorOptions.hasOptionsDefined());
		});

		// Resolve Editor Model (Typed EditorInput)
		let input = inst.createInstance(StringEditorInput, 'name', 'description', 'hello world', 'text/plain', false);
		service.resolveEditorModel(input, true).then((model: StringEditorModel) => {
			assert(model instanceof StringEditorModel);

			assert(model.isResolved());

			service.resolveEditorModel(input, false).then((otherModel) => {
				assert(model === otherModel);

				input.dispose();
			});
		});

		// Resolve Editor Model (Untyped Input)
		service.resolveEditorModel({ resource: toResource('/index.html'), mime: 'text/html' }, true).then((model) => {
			assert(model instanceof TextFileEditorModel);
		});
	});

	test('DelegatingWorkbenchEditorService', function () {
		let editorService = new TestEditorService(function () { });
		let contextService = new TestContextService(TestWorkspace);
		let eventService = new TestEventService();
		let requestService = new TestRequestService();
		let telemetryService = NullTelemetryService;

		let services = new ServiceCollection();
		let inst = new InstantiationService(services);
		services.set(IEventService, eventService);
		services.set(IWorkspaceContextService, contextService);
		services.set(IRequestService, requestService);
		services.set(ITelemetryService, telemetryService);
		services.set(IStorageService, new TestStorageService());
		services.set(IUntitledEditorService, inst.createInstance(UntitledEditorService));
		services.set(IWorkbenchEditorService, editorService);
		services.set(PartService.IPartService, new TestPartService());
		services.set(ILifecycleService, NullLifecycleService);
		services.set(IConfigurationService, new TestConfigurationService());
		services.set(ITextFileService, <ITextFileService> inst.createInstance(<any>TestTextFileService));
		let activeInput: EditorInput = inst.createInstance(FileEditorInput, toResource('/something.js'), 'text/javascript', void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);

		inst.createInstance(<any>WorkbenchEditorService, testEditorPart);
		class MyEditor extends BaseEditor {

			constructor(id: string) {
				super(id, null);
			}

			getId(): string {
				return 'myEditor';
			}

			public layout(): void {

			}

			public createEditor(): any {

			}
		}
		let ed = inst.createInstance(MyEditor, 'my.editor');

		let inp = inst.createInstance(StringEditorInput, 'name', 'description', 'hello world', 'text/plain', false);
		let delegate: any = inst.createInstance(<any>DelegatingWorkbenchEditorService, (input: EditorInput, options?: EditorOptions, arg3?: any) => {
			assert.strictEqual(input, inp);

			return TPromise.as(ed);
		});

		delegate.openEditor(inp);
	});

	test('ScopedService', function () {
		let eventService = new TestEventService();
		let service = new TestScopedService(eventService);
		assert(!service.isActive);

		eventService.emit(EventType.COMPOSITE_OPENED, { compositeId: 'test.scopeId' });
		assert(service.isActive);

		eventService.emit(EventType.COMPOSITE_CLOSED, { compositeId: 'test.scopeId' });
		assert(!service.isActive);
	});

	test('WorkbenchProgressService', function () {
		let testProgressBar = new TestProgressBar();
		let eventService = new TestEventService();
		let service = new WorkbenchProgressService(eventService, (<any>testProgressBar), 'test.scopeId', true);

		// Active: Show (Infinite)
		let fn = service.show(true);
		assert.strictEqual(true, testProgressBar.fInfinite);
		fn.done();
		assert.strictEqual(true, testProgressBar.fDone);

		// Active: Show (Total / Worked)
		fn = service.show(100);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		assert.strictEqual(100, testProgressBar.fTotal);
		fn.worked(20);
		assert.strictEqual(20, testProgressBar.fWorked);
		fn.total(80);
		assert.strictEqual(80, testProgressBar.fTotal);
		fn.done();
		assert.strictEqual(true, testProgressBar.fDone);

		// Inactive: Show (Infinite)
		eventService.emit(EventType.COMPOSITE_CLOSED, { compositeId: 'test.scopeId' });
		service.show(true);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		eventService.emit(EventType.COMPOSITE_OPENED, { compositeId: 'test.scopeId' });
		assert.strictEqual(true, testProgressBar.fInfinite);

		// Inactive: Show (Total / Worked)
		eventService.emit(EventType.COMPOSITE_CLOSED, { compositeId: 'test.scopeId' });
		fn = service.show(100);
		fn.total(80);
		fn.worked(20);
		assert.strictEqual(false, !!testProgressBar.fTotal);
		eventService.emit(EventType.COMPOSITE_OPENED, { compositeId: 'test.scopeId' });
		assert.strictEqual(20, testProgressBar.fWorked);
		assert.strictEqual(80, testProgressBar.fTotal);

		// Acive: Show While
		let p = TPromise.as(null);
		service.showWhile(p).then(() => {
			assert.strictEqual(true, testProgressBar.fDone);

			eventService.emit(EventType.COMPOSITE_CLOSED, { compositeId: 'test.scopeId' });
			p = TPromise.as(null);
			service.showWhile(p).then(() => {
				assert.strictEqual(true, testProgressBar.fDone);

				eventService.emit(EventType.COMPOSITE_OPENED, { compositeId: 'test.scopeId' });
				assert.strictEqual(true, testProgressBar.fDone);
			});
		});
	});
});