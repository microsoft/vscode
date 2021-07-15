/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Event } from 'vs/base/common/event';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { TypeHierarchyProviderRegistry } from 'vs/workbench/contrib/typeHierarchy/common/typeHierarchy';


const _ctxHasTypeHierarchyProvider = new RawContextKey<boolean>('editorHasTypeHierarchyProvider', false, localize('editorHasTypeHierarchyProvider', 'Whether a type hierarchy provider is available'));

class TypeHierarchyController implements IEditorContribution {
	static readonly Id = 'typeHierarchy';

	static get(editor: ICodeEditor): TypeHierarchyController {
		return editor.getContribution<TypeHierarchyController>(TypeHierarchyController.Id);
	}

	private readonly _ctxHasProvider: IContextKey<boolean>;
	private readonly _dispoables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();

	constructor(
		readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		this._ctxHasProvider = _ctxHasTypeHierarchyProvider.bindTo(this._contextKeyService);
		this._dispoables.add(Event.any<any>(_editor.onDidChangeModel, _editor.onDidChangeModelLanguage, TypeHierarchyProviderRegistry.onDidChange)(() => {
			this._ctxHasProvider.set(_editor.hasModel() && TypeHierarchyProviderRegistry.has(_editor.getModel()));
		}));
		this._dispoables.add(this._sessionDisposables);
	}

	dispose(): void {
		this._dispoables.dispose();
	}
}

registerEditorContribution(TypeHierarchyController.Id, TypeHierarchyController);

// Testing
