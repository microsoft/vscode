/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IContextKey, IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import * as modes from 'vs/editor/common/modes';
import {ICommonCodeEditor, ModeContextKeys, EditorContextKeys} from 'vs/editor/common/editorCommon';

export class EditorModeContext {

	private _disposables: IDisposable[] = [];
	private _editor: ICommonCodeEditor;

	private _langId: IContextKey<string>;
	private _hasCompletionItemProvider: IContextKey<boolean>;
	private _hasCodeActionsProvider: IContextKey<boolean>;
	private _hasCodeLensProvider: IContextKey<boolean>;
	private _hasDefinitionProvider: IContextKey<boolean>;
	private _hasHoverProvider: IContextKey<boolean>;
	private _hasDocumentHighlightProvider: IContextKey<boolean>;
	private _hasDocumentSymbolProvider: IContextKey<boolean>;
	private _hasReferenceProvider: IContextKey<boolean>;
	private _hasRenameProvider: IContextKey<boolean>;
	private _hasFormattingProvider: IContextKey<boolean>;
	private _hasSignatureHelpProvider: IContextKey<boolean>;

	constructor(
		editor: ICommonCodeEditor,
		contextKeyService: IContextKeyService
	) {
		this._editor = editor;

		this._langId = EditorContextKeys.LanguageId.bindTo(contextKeyService);
		this._hasCompletionItemProvider = ModeContextKeys.hasCompletionItemProvider.bindTo(contextKeyService);
		this._hasCodeActionsProvider = ModeContextKeys.hasCodeActionsProvider.bindTo(contextKeyService);
		this._hasCodeLensProvider = ModeContextKeys.hasCodeLensProvider.bindTo(contextKeyService);
		this._hasDefinitionProvider = ModeContextKeys.hasDefinitionProvider.bindTo(contextKeyService);
		this._hasHoverProvider = ModeContextKeys.hasHoverProvider.bindTo(contextKeyService);
		this._hasDocumentHighlightProvider = ModeContextKeys.hasDocumentHighlightProvider.bindTo(contextKeyService);
		this._hasDocumentSymbolProvider = ModeContextKeys.hasDocumentSymbolProvider.bindTo(contextKeyService);
		this._hasReferenceProvider = ModeContextKeys.hasReferenceProvider.bindTo(contextKeyService);
		this._hasRenameProvider = ModeContextKeys.hasRenameProvider.bindTo(contextKeyService);
		this._hasFormattingProvider = ModeContextKeys.hasFormattingProvider.bindTo(contextKeyService);
		this._hasSignatureHelpProvider = ModeContextKeys.hasSignatureHelpProvider.bindTo(contextKeyService);

		// update when model/mode changes
		this._disposables.push(editor.onDidChangeModel(() => this._update()));
		this._disposables.push(editor.onDidChangeModelMode(() => this._update()));

		// update when registries change
		modes.SuggestRegistry.onDidChange(this._update, this, this._disposables);
		modes.CodeActionProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.CodeLensProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DefinitionProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.HoverProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentHighlightProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentSymbolProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.ReferenceProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.RenameProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentFormattingEditProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentRangeFormattingEditProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.SignatureHelpProviderRegistry.onDidChange(this._update, this, this._disposables);

		this._update();
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}

	reset() {
		this._langId.reset();
		this._hasCompletionItemProvider.reset();
		this._hasCodeActionsProvider.reset();
		this._hasCodeLensProvider.reset();
		this._hasDefinitionProvider.reset();
		this._hasHoverProvider.reset();
		this._hasDocumentHighlightProvider.reset();
		this._hasDocumentSymbolProvider.reset();
		this._hasReferenceProvider.reset();
		this._hasRenameProvider.reset();
		this._hasFormattingProvider.reset();
		this._hasSignatureHelpProvider.reset();
	}

	private _update() {
		const model = this._editor.getModel();
		if (!model) {
			this.reset();
			return;
		}
		this._langId.set(model.getModeId());
		this._hasCompletionItemProvider.set(modes.SuggestRegistry.has(model));
		this._hasCodeActionsProvider.set(modes.CodeActionProviderRegistry.has(model));
		this._hasCodeLensProvider.set(modes.CodeLensProviderRegistry.has(model));
		this._hasDefinitionProvider.set(modes.DefinitionProviderRegistry.has(model));
		this._hasHoverProvider.set(modes.HoverProviderRegistry.has(model));
		this._hasDocumentHighlightProvider.set(modes.DocumentHighlightProviderRegistry.has(model));
		this._hasDocumentSymbolProvider.set(modes.DocumentSymbolProviderRegistry.has(model));
		this._hasReferenceProvider.set(modes.ReferenceProviderRegistry.has(model));
		this._hasRenameProvider.set(modes.RenameProviderRegistry.has(model));
		this._hasSignatureHelpProvider.set(modes.SignatureHelpProviderRegistry.has(model));
		this._hasFormattingProvider.set(modes.DocumentFormattingEditProviderRegistry.has(model) || modes.DocumentRangeFormattingEditProviderRegistry.has(model));
	}
}
