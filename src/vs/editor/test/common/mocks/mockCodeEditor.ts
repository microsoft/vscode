/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EventEmitter, IEventEmitter } from 'vs/base/common/eventEmitter';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { CommonCodeEditor } from 'vs/editor/common/commonCodeEditor';
import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { Cursor } from 'vs/editor/common/controller/cursor';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import { Range } from 'vs/editor/common/core/range';

export class MockCodeEditor extends CommonCodeEditor {
	protected _createConfiguration(options: editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration {
		return new TestConfiguration(options);
	}
	public getCenteredRangeInViewport(): Range { return null; }
	protected _getCompletelyVisibleViewRange(): Range { return null; }

	public getScrollWidth(): number { return 0; }
	public getScrollLeft(): number { return 0; }

	public getScrollHeight(): number { return 0; }
	public getScrollTop(): number { return 0; }

	public setScrollLeft(newScrollLeft: number): void { }
	public setScrollTop(newScrollTop: number): void { }
	public setScrollPosition(position: editorCommon.INewScrollPosition): void { }

	public saveViewState(): editorCommon.ICodeEditorViewState { return null; }
	public restoreViewState(state: editorCommon.IEditorViewState): void { }

	public layout(dimension?: editorCommon.IDimension): void { }

	public focus(): void { }
	public isFocused(): boolean { return true; }
	public hasWidgetFocus(): boolean { return true; };

	protected _enableEmptySelectionClipboard(): boolean { return false; }
	protected _createView(): void { }
	protected _getViewInternalEventBus(): IEventEmitter { return new EventEmitter(); }

	protected _registerDecorationType(key: string, options: editorCommon.IDecorationRenderOptions, parentTypeKey?: string): void { throw new Error('NotImplemented'); }
	protected _removeDecorationType(key: string): void { throw new Error('NotImplemented'); }
	protected _resolveDecorationOptions(typeKey: string, writable: boolean): editorCommon.IModelDecorationOptions { throw new Error('NotImplemented'); }

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
}

export class MockScopeLocation implements IContextKeyServiceTarget {
	parentElement: IContextKeyServiceTarget = null;
	setAttribute(attr: string, value: string): void { }
	removeAttribute(attr: string): void { }
	hasAttribute(attr: string): boolean { return false; }
	getAttribute(attr: string): string { return undefined; }
}

export function withMockCodeEditor(text: string[], options: editorCommon.ICodeEditorWidgetCreationOptions, callback: (editor: MockCodeEditor, cursor: Cursor) => void): void {
	let editor = <MockCodeEditor>mockCodeEditor(text, options);
	callback(editor, editor.getCursor());
	editor.dispose();
}

export function mockCodeEditor(text: string[], options: editorCommon.ICodeEditorWidgetCreationOptions): CommonCodeEditor {

	let contextKeyService = new MockContextKeyService();

	let services = new ServiceCollection();
	services.set(IContextKeyService, contextKeyService);
	let instantiationService = new InstantiationService(services);

	let editor = new MockCodeEditor(new MockScopeLocation(), options, instantiationService, contextKeyService);
	let model = options.model || Model.createFromString(text.join('\n'));
	if (model) {
		editor.setModel(model);
	}

	return editor;
}
