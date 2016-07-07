/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import * as modes from 'vs/editor/common/modes';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';

export namespace ModeContextKeys {
	export const hasDefinitionProvider = 'editorHasDefinitionProvider';
	export const hasReferenceProvider = 'editorHasReferenceProvider';
	export const hasRenameProvider = 'editorHasRenameProvider';
}

export class EditorModeContext {

	private _disposables: IDisposable[] = [];
	private _editor: ICommonCodeEditor;

	private _hasDefinitionProvider: IKeybindingContextKey<boolean>;
	private _hasReferenceProvider: IKeybindingContextKey<boolean>;
	private _hasRenameProvider: IKeybindingContextKey<boolean>;

	constructor(
		editor: ICommonCodeEditor,
		keybindingService: IKeybindingService
	) {
		this._editor = editor;

		this._hasDefinitionProvider = keybindingService.createKey(ModeContextKeys.hasDefinitionProvider, undefined);
		this._hasReferenceProvider = keybindingService.createKey(ModeContextKeys.hasReferenceProvider, undefined);
		this._hasRenameProvider = keybindingService.createKey(ModeContextKeys.hasRenameProvider, undefined);

		// update when model/mode changes
		this._disposables.push(editor.onDidChangeModel(() => this._update()));
		this._disposables.push(editor.onDidChangeModelMode(() => this._update()));

		// update when registry changes
		modes.DefinitionProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.ReferenceProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.RenameProviderRegistry.onDidChange(this._update, this, this._disposables);

		this._update();
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}

	reset() {
		this._hasDefinitionProvider.reset();
		this._hasReferenceProvider.reset();
	}

	private _update() {
		const model = this._editor.getModel();
		if (!model) {
			this.reset();
			return;
		}

		this._hasDefinitionProvider.set(modes.DefinitionProviderRegistry.has(model));
		this._hasReferenceProvider.set(modes.ReferenceProviderRegistry.has(model));
		this._hasRenameProvider.set(modes.ReferenceProviderRegistry.has(model));
	}
}
