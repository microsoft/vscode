/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { CommonCodeEditor } from 'vs/editor/common/commonCodeEditor';
import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { Cursor } from 'vs/editor/common/controller/cursor';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { TextModel } from 'vs/editor/common/model/textModel';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IPosition } from 'vs/editor/common/core/position';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';

export class TestCodeEditor extends CommonCodeEditor implements editorBrowser.ICodeEditor {

	private readonly _onMouseUp: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseUp: Event<editorBrowser.IEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDown: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDown.event;

	private readonly _onMouseDrag: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDrag: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrag.event;

	private readonly _onMouseDrop: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDrop: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrop.event;

	private readonly _onContextMenu: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onContextMenu: Event<editorBrowser.IEditorMouseEvent> = this._onContextMenu.event;

	private readonly _onMouseMove: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseMove: Event<editorBrowser.IEditorMouseEvent> = this._onMouseMove.event;

	private readonly _onMouseLeave: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseLeave: Event<editorBrowser.IEditorMouseEvent> = this._onMouseLeave.event;

	private readonly _onKeyUp: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private readonly _onKeyDown: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onDidScrollChange: Emitter<editorCommon.IScrollEvent> = this._register(new Emitter<editorCommon.IScrollEvent>());
	public readonly onDidScrollChange: Event<editorCommon.IScrollEvent> = this._onDidScrollChange.event;

	private readonly _onDidChangeViewZones: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeViewZones: Event<void> = this._onDidChangeViewZones.event;

	public _isFocused = true;

	protected _createConfiguration(options: editorOptions.IEditorOptions): CommonEditorConfiguration {
		return new TestConfiguration(options);
	}

	public layout(dimension?: editorCommon.IDimension): void { }

	public focus(): void { }
	public isFocused(): boolean { return this._isFocused; }
	public hasWidgetFocus(): boolean { return true; }

	protected _enableEmptySelectionClipboard(): boolean { return false; }
	protected _scheduleAtNextAnimationFrame(callback: () => void): IDisposable { throw new Error('Notimplemented'); }
	protected _createView(): void { }

	protected _registerDecorationType(key: string, options: editorCommon.IDecorationRenderOptions, parentTypeKey?: string): void { throw new Error('NotImplemented'); }
	protected _removeDecorationType(key: string): void { throw new Error('NotImplemented'); }
	protected _resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions { throw new Error('NotImplemented'); }

	// --- test utils
	getCursor(): Cursor {
		return this.cursor;
	}

	public registerAndInstantiateContribution<T extends editorCommon.IEditorContribution>(ctor: any): T {
		let r = <T>this._instantiationService.createInstance(ctor, this);
		this._contributions[r.getId()] = r;
		return r;
	}

	public dispose() {
		super.dispose();
		if (this.model) {
			this.model.dispose();
		}
		this._contextKeyService.dispose();
	}

	protected _triggerEditorCommand(source: string, handlerId: string, payload: any): boolean {
		const command = EditorExtensionsRegistry.getEditorCommand(handlerId);
		if (command) {
			payload = payload || {};
			payload.source = source;
			TPromise.as(command.runEditorCommand(null, this, payload)).done(null, onUnexpectedError);
			return true;
		}

		return false;
	}

	//#region ICodeEditor
	getDomNode(): HTMLElement { throw new Error('Not implemented'); }
	addContentWidget(widget: editorBrowser.IContentWidget): void { throw new Error('Not implemented'); }
	layoutContentWidget(widget: editorBrowser.IContentWidget): void { throw new Error('Not implemented'); }
	removeContentWidget(widget: editorBrowser.IContentWidget): void { throw new Error('Not implemented'); }
	addOverlayWidget(widget: editorBrowser.IOverlayWidget): void { throw new Error('Not implemented'); }
	layoutOverlayWidget(widget: editorBrowser.IOverlayWidget): void { throw new Error('Not implemented'); }
	removeOverlayWidget(widget: editorBrowser.IOverlayWidget): void { throw new Error('Not implemented'); }
	changeViewZones(callback: (accessor: editorBrowser.IViewZoneChangeAccessor) => void): void { throw new Error('Not implemented'); }
	getOffsetForColumn(lineNumber: number, column: number): number { throw new Error('Not implemented'); }
	render(): void { throw new Error('Not implemented'); }
	getTargetAtClientPoint(clientX: number, clientY: number): editorBrowser.IMouseTarget { throw new Error('Not implemented'); }
	getScrolledVisiblePosition(position: IPosition): { top: number; left: number; height: number; } { throw new Error('Not implemented'); }
	applyFontInfo(target: HTMLElement): void { throw new Error('Not implemented'); }
	//#endregion ICodeEditor
}

export class MockScopeLocation implements IContextKeyServiceTarget {
	parentElement: IContextKeyServiceTarget = null;
	setAttribute(attr: string, value: string): void { }
	removeAttribute(attr: string): void { }
	hasAttribute(attr: string): boolean { return false; }
	getAttribute(attr: string): string { return undefined; }
}

export interface TestCodeEditorCreationOptions extends editorOptions.IEditorOptions {
	/**
	 * The initial model associated with this code editor.
	 */
	model?: ITextModel;
	serviceCollection?: ServiceCollection;
}

export function withTestCodeEditor(text: string[], options: TestCodeEditorCreationOptions, callback: (editor: TestCodeEditor, cursor: Cursor) => void): void {
	// create a model if necessary and remember it in order to dispose it.
	let modelToDispose: TextModel = null;
	if (!options.model) {
		modelToDispose = TextModel.createFromString(text.join('\n'));
		options.model = modelToDispose;
	}

	let editor = <TestCodeEditor>_createTestCodeEditor(options);
	callback(editor, editor.getCursor());

	if (modelToDispose) {
		modelToDispose.dispose();
	}
	editor.dispose();
}

export function createTestCodeEditor(model: ITextModel): TestCodeEditor {
	return _createTestCodeEditor({ model: model });
}

function _createTestCodeEditor(options: TestCodeEditorCreationOptions): TestCodeEditor {

	let contextKeyService = new MockContextKeyService();

	let services = options.serviceCollection || new ServiceCollection();
	services.set(IContextKeyService, contextKeyService);
	let instantiationService = new InstantiationService(services);

	let editor = new TestCodeEditor(new MockScopeLocation(), options, instantiationService, contextKeyService);
	editor.setModel(options.model);
	return editor;
}
