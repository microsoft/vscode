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
import { Model } from 'vs/editor/common/model/model';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { IDisposable } from 'vs/base/common/lifecycle';

export class MockCodeEditor extends CommonCodeEditor {
	protected _createConfiguration(options: editorOptions.IEditorOptions): CommonEditorConfiguration {
		return new TestConfiguration(options);
	}

	public layout(dimension?: editorCommon.IDimension): void { }

	public focus(): void { }
	public isFocused(): boolean { return true; }
	public hasWidgetFocus(): boolean { return true; };

	protected _enableEmptySelectionClipboard(): boolean { return false; }
	protected _scheduleAtNextAnimationFrame(callback: () => void): IDisposable { throw new Error('Notimplemented'); }
	protected _createView(): void { }

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

export interface MockCodeEditorCreationOptions extends editorOptions.IEditorOptions {
	/**
	 * The initial model associated with this code editor.
	 */
	model?: editorCommon.IModel;
	serviceCollection?: ServiceCollection;
}

export function withMockCodeEditor(text: string[], options: MockCodeEditorCreationOptions, callback: (editor: MockCodeEditor, cursor: Cursor) => void): void {
	// create a model if necessary and remember it in order to dispose it.
	let modelToDispose: Model = null;
	if (!options.model) {
		modelToDispose = Model.createFromString(text.join('\n'));
		options.model = modelToDispose;
	}

	let editor = <MockCodeEditor>_mockCodeEditor(options);
	callback(editor, editor.getCursor());

	if (modelToDispose) {
		modelToDispose.dispose();
	}
	editor.dispose();
}

export function mockCodeEditor(text: string[], options: MockCodeEditorCreationOptions): CommonCodeEditor {
	// TODO: who owns this model now?
	if (!options.model) {
		options.model = Model.createFromString(text.join('\n'));
	}
	return _mockCodeEditor(options);
}

function _mockCodeEditor(options: MockCodeEditorCreationOptions): CommonCodeEditor {

	let contextKeyService = new MockContextKeyService();

	let services = options.serviceCollection || new ServiceCollection();
	services.set(IContextKeyService, contextKeyService);
	let instantiationService = new InstantiationService(services);

	let editor = new MockCodeEditor(new MockScopeLocation(), options, instantiationService, contextKeyService);
	editor.setModel(options.model);
	return editor;
}
