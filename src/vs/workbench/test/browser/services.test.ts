/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, TextEditorOptions} from 'vs/workbench/common/editor';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {StringEditorModel} from 'vs/workbench/common/editor/stringEditorModel';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {TextFileService} from 'vs/workbench/parts/files/browser/textFileServices';
import {TestEventService, TestLifecycleService, TestPartService, TestStorageService, TestConfigurationService, TestRequestService, TestContextService, TestWorkspace, TestEditorService, MockRequestService} from 'vs/workbench/test/browser/servicesTestUtils';
import {Viewlet} from 'vs/workbench/browser/viewlet';
import {EventType} from 'vs/workbench/common/events';
import {MainTelemetryService} from 'vs/platform/telemetry/browser/mainTelemetryService';
import Severity from 'vs/base/common/severity';
import {UntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {WorkbenchProgressService, ScopedService} from 'vs/workbench/services/progress/browser/progressService';
import {EditorArrangement} from 'vs/workbench/services/editor/common/editorService';
import {DelegatingWorkbenchEditorService, WorkbenchEditorService, IEditorPart} from 'vs/workbench/services/editor/browser/editorService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {Position, IEditor} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {createMockModeService, createMockModelService} from 'vs/editor/test/common/servicesTestUtils';

let activeViewlet: Viewlet = <any>{};
let activeEditor: BaseEditor = <any>{
	getSelection: function() {
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

	public setEditors(inputs: EditorInput[]): Promise {
		return TPromise.as([]);
	}

	public closeEditors(othersOnly?: boolean): Promise {
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

	public activateEditor(editor: IEditor): void {
		// Unsupported
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

	public moveEditor(from: Position, to: Position) {
		// Unsupported
	}

	public arrangeEditors(arrangement: EditorArrangement): void {
		// Unsuported
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
			show: function() { },
			hide: function() { }
		};
	}
}

suite('Workbench UI Services', () => {

	test('WorkbenchEditorService', function() {
		const TestFileService = {
			resolveContent: function(resource) {
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

			updateContent: function(res) {
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
		}

		let editorService = new TestEditorService(function() { });
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
		let telemetryService = new MainTelemetryService();

		let services = {
			eventService: eventService,
			contextService: contextService,
			requestService: requestService,
			telemetryService: telemetryService,
			configurationService: new TestConfigurationService(),
			untitledEditorService: new UntitledEditorService(),
			storageService: new TestStorageService(),
			editorService: editorService,
			partService: new TestPartService(),
			modeService: createMockModeService(),
			modelService: createMockModelService(),
			lifecycleService: new TestLifecycleService(),
			fileService: TestFileService
		};
		let inst = createInstantiationService(services);

		let textFileService = inst.createInstance(<any>TextFileService);
		inst.registerService('textFileService', textFileService);
		services['instantiationService'] = inst;

		let activeInput: EditorInput = inst.createInstance(FileEditorInput, toResource('/something.js'), 'text/javascript', void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);
		let service: WorkbenchEditorService = <any>inst.createInstance(<any>WorkbenchEditorService, testEditorPart);
		service.setInstantiationService(inst);

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

			let stringEditorModel = <StringEditorModel>model;
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

		// Focus editor
		service.focusEditor().then((editor) => {
			assert.strictEqual(editor, activeEditor);
		});

		// Close editor
		service.closeEditor().then((editor) => {
			assert.strictEqual(editor, activeEditor);
		});

		service.openEditor(null, null).then((editor) => {
			assert.strictEqual(editor, activeEditor);
		});
	});

	test('DelegatingWorkbenchEditorService', function() {
		let editorService = new TestEditorService(function() { });
		let contextService = new TestContextService(TestWorkspace);
		let eventService = new TestEventService();
		let requestService = new TestRequestService();
		let telemetryService = new MainTelemetryService();

		let services = {
			eventService: eventService,
			contextService: contextService,
			requestService: requestService,
			telemetryService: telemetryService,
			storageService: new TestStorageService(),
			untitledEditorService: new UntitledEditorService(),
			editorService: editorService,
			partService: new TestPartService(),
			lifecycleService: new TestLifecycleService(),
			modelService: createMockModelService(),
			configurationService: new TestConfigurationService()
		};

		let inst = createInstantiationService(services);
		let textFileService = inst.createInstance(<any>TextFileService);
		inst.registerService('textFileService', textFileService);
		services['instantiationService'] = inst;
		let activeInput: EditorInput = inst.createInstance(FileEditorInput, toResource('/something.js'), 'text/javascript', void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);

		let service = inst.createInstance(<any>WorkbenchEditorService, testEditorPart);
		class MyEditor extends BaseEditor {

			constructor(id: string) {
				super(id, null);
			}

			getId(): string {
				return "myEditor";
			}

			public layout(): void {

			}

			public createEditor(): any {

			}
		}
		let ed = inst.createInstance(MyEditor, 'my.editor');

		let inp = inst.createInstance(StringEditorInput, 'name', 'description', 'hello world', 'text/plain', false);
		let delegate: any = inst.createInstance(<any>DelegatingWorkbenchEditorService, ed, (editor: BaseEditor, input: EditorInput, options?: EditorOptions) => {
			assert.strictEqual(input, inp);
			assert.strictEqual(editor, ed);

			return TPromise.as(true);
		});

		delegate.openEditor(inp);
	});

	test('ScopedService', function() {
		let eventService = new TestEventService();
		let service = new TestScopedService(eventService);
		assert(!service.isActive);

		eventService.emit(EventType.EDITOR_OPENED, { editorId: 'other.test.scopeId' });
		assert(!service.isActive);

		eventService.emit(EventType.EDITOR_OPENED, { editorId: 'test.scopeId' });
		assert(service.isActive);

		eventService.emit(EventType.EDITOR_CLOSED, { editorId: 'test.scopeId' });
		assert(!service.isActive);

		eventService.emit(EventType.COMPOSITE_OPENED, { compositeId: 'test.scopeId' });
		assert(service.isActive);

		eventService.emit(EventType.COMPOSITE_CLOSED, { compositeId: 'test.scopeId' });
		assert(!service.isActive);
	});

	test('WorkbenchProgressService', function() {
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
		eventService.emit(EventType.EDITOR_CLOSED, { editorId: 'test.scopeId' });
		service.show(true);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		eventService.emit(EventType.EDITOR_OPENED, { editorId: 'test.scopeId' });
		assert.strictEqual(true, testProgressBar.fInfinite);

		// Inactive: Show (Total / Worked)
		eventService.emit(EventType.EDITOR_CLOSED, { editorId: 'test.scopeId' });
		fn = service.show(100);
		fn.total(80);
		fn.worked(20);
		assert.strictEqual(false, !!testProgressBar.fTotal);
		eventService.emit(EventType.EDITOR_OPENED, { editorId: 'test.scopeId' });
		assert.strictEqual(20, testProgressBar.fWorked);
		assert.strictEqual(80, testProgressBar.fTotal);

		// Acive: Show While
		let p = TPromise.as(null);
		service.showWhile(p).then(() => {
			assert.strictEqual(true, testProgressBar.fDone);

			eventService.emit(EventType.EDITOR_CLOSED, { editorId: 'test.scopeId' });
			p = TPromise.as(null);
			service.showWhile(p).then(() => {
				assert.strictEqual(true, testProgressBar.fDone);

				eventService.emit(EventType.EDITOR_OPENED, { editorId: 'test.scopeId' });
				assert.strictEqual(true, testProgressBar.fDone);
			});
		});
	});
});