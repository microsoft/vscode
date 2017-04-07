/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import { IEditorControl, Position, Direction, IEditor } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, TextEditorOptions } from 'vs/workbench/common/editor';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { StringEditorModel } from 'vs/workbench/common/editor/stringEditorModel';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { workbenchInstantiationService, TestThemeService } from 'vs/workbench/test/workbenchTestServices';
import { Viewlet, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { WorkbenchProgressService, ScopedService } from 'vs/workbench/services/progress/browser/progressService';
import { DelegatingWorkbenchEditorService, WorkbenchEditorService, IEditorPart } from 'vs/workbench/services/editor/browser/editorService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Emitter } from 'vs/base/common/event';

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
	return URI.file(paths.join('C:\\', new Buffer(this.test.fullTitle()).toString('base64'), path));
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
	public _serviceBrand: any;

	onDidViewletOpenEmitter = new Emitter<IViewlet>();
	onDidViewletCloseEmitter = new Emitter<IViewlet>();

	onDidViewletOpen = this.onDidViewletOpenEmitter.event;
	onDidViewletClose = this.onDidViewletCloseEmitter.event;

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {
		return TPromise.as(null);
	}

	public getViewlets(): ViewletDescriptor[] {
		return [];
	}

	public getActiveViewlet(): IViewlet {
		return activeViewlet;
	}

	public dispose() {
	}

	public getDefaultViewletId(): string {
		return 'workbench.view.explorer';
	}

	public getViewlet(id: string): ViewletDescriptor {
		return null;
	}

	public getProgressIndicator(id: string) {
		return null;
	}
}

class TestPanelService implements IPanelService {
	public _serviceBrand: any;

	onDidPanelOpen = new Emitter<IPanel>().event;
	onDidPanelClose = new Emitter<IPanel>().event;

	public openPanel(id: string, focus?: boolean): Promise {
		return TPromise.as(null);
	}

	public getPanels(): any[] {
		return [];
	}

	public getActivePanel(): IViewlet {
		return activeViewlet;
	}

	public dispose() {
	}
}

class TestViewlet implements IViewlet {

	constructor(private id: string) { }

	getId(): string {
		return this.id;
	}

	/**
	 * Returns the name of this composite to show in the title area.
	 */
	getTitle(): string {
		return this.id;
	}

	/**
	 * Returns the primary actions of the composite.
	 */
	getActions(): IAction[] {
		return [];
	}

	/**
	 * Returns the secondary actions of the composite.
	 */
	getSecondaryActions(): IAction[] {
		return [];
	}

	/**
	 * Returns the action item for a specific action.
	 */
	getActionItem(action: IAction): IActionItem {
		return null;
	}

	/**
	 * Returns the underlying control of this composite.
	 */
	getControl(): IEditorControl {
		return null;
	}

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void {
	}

	getOptimalWidth(): number {
		return 10;
	}
}

class TestScopedService extends ScopedService {
	public isActive: boolean;

	constructor(viewletService: IViewletService, panelService: IPanelService, scopeId: string) {
		super(viewletService, panelService, scopeId);
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
		let instantiationService = workbenchInstantiationService();

		let activeInput: EditorInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/something.js'), void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);
		let service: WorkbenchEditorService = <any>instantiationService.createInstance(<any>WorkbenchEditorService, testEditorPart);

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

		service.openEditor(activeInput, null, Position.ONE).then((editor) => {
			assert.strictEqual(openedEditorInput, activeInput);
			assert.strictEqual(openedEditorOptions, null);
			assert.strictEqual(editor, activeEditor);
			assert.strictEqual(service.getVisibleEditors().length, 1);
			assert(service.getVisibleEditors()[0] === editor);
		});

		// Open Untyped Input
		service.openEditor({ resource: toResource.call(this, '/index.html'), options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof FileEditorInput);
			let contentInput = <FileEditorInput>openedEditorInput;
			assert.strictEqual(contentInput.getResource().fsPath, toResource.call(this, '/index.html').fsPath);

			assert(openedEditorOptions instanceof TextEditorOptions);
			let textEditorOptions = <TextEditorOptions>openedEditorOptions;
			assert(textEditorOptions.hasOptionsDefined());
		});

		// Resolve Editor Model (Typed EditorInput)
		let input = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'hello world', 'text/plain', false);
		input.resolve(true).then((model: StringEditorModel) => {
			assert(model instanceof StringEditorModel);

			assert(model.isResolved());

			input.resolve().then((otherModel) => {
				assert(model === otherModel);

				input.dispose();
			});
		});
	});

	test('DelegatingWorkbenchEditorService', function (done) {
		let instantiationService = workbenchInstantiationService();
		let activeInput: EditorInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/something.js'), void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);

		instantiationService.createInstance(<any>WorkbenchEditorService, testEditorPart);
		class MyEditor extends BaseEditor {

			constructor(id: string) {
				super(id, null, new TestThemeService());
			}

			getId(): string {
				return 'myEditor';
			}

			public layout(): void {

			}

			public createEditor(): any {

			}
		}
		let ed = instantiationService.createInstance(MyEditor, 'my.editor');

		let inp = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'hello world', 'text/plain', false);
		let delegate = instantiationService.createInstance(DelegatingWorkbenchEditorService);
		delegate.setEditorOpenHandler((input, options?) => {
			assert.strictEqual(input, inp);

			return TPromise.as(ed);
		});

		delegate.setEditorCloseHandler((position, input) => {
			assert.strictEqual(input, inp);

			done();

			return TPromise.as(void 0);
		});

		delegate.openEditor(inp);
		delegate.closeEditor(0, inp);
	});

	test('ScopedService', () => {
		let viewletService = new TestViewletService();
		let panelService = new TestPanelService();
		let service = new TestScopedService(viewletService, panelService, 'test.scopeId');
		const testViewlet = new TestViewlet('test.scopeId');

		assert(!service.isActive);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert(service.isActive);

		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		assert(!service.isActive);

	});

	test('WorkbenchProgressService', function () {
		let testProgressBar = new TestProgressBar();
		let viewletService = new TestViewletService();
		let panelService = new TestPanelService();
		let service = new WorkbenchProgressService((<any>testProgressBar), 'test.scopeId', true, viewletService, panelService);

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
		const testViewlet = new TestViewlet('test.scopeId');
		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		service.show(true);
		assert.strictEqual(false, !!testProgressBar.fInfinite);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(true, testProgressBar.fInfinite);

		// Inactive: Show (Total / Worked)
		viewletService.onDidViewletCloseEmitter.fire(testViewlet);
		fn = service.show(100);
		fn.total(80);
		fn.worked(20);
		assert.strictEqual(false, !!testProgressBar.fTotal);
		viewletService.onDidViewletOpenEmitter.fire(testViewlet);
		assert.strictEqual(20, testProgressBar.fWorked);
		assert.strictEqual(80, testProgressBar.fTotal);

		// Acive: Show While
		let p = TPromise.as(null);
		service.showWhile(p).then(() => {
			assert.strictEqual(true, testProgressBar.fDone);

			viewletService.onDidViewletCloseEmitter.fire(testViewlet);
			p = TPromise.as(null);
			service.showWhile(p).then(() => {
				assert.strictEqual(true, testProgressBar.fDone);

				viewletService.onDidViewletOpenEmitter.fire(testViewlet);
				assert.strictEqual(true, testProgressBar.fDone);
			});
		});
	});
});
