/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { pickSnippet } from 'vs/workbench/contrib/snippets/browser/snippetPicker';
import { ISnippetsService } from './snippets.contribution';

const options = {
	id: 'editor.action.surroundWithSnippet',
	title: {
		value: localize('label', 'Surround With Snippet...'),
		original: 'Surround With Snippet...'
	},
	precondition: ContextKeyExpr.and(
		EditorContextKeys.writable,
		EditorContextKeys.hasNonEmptySelection
	),
	f1: true,
};

class SurroundWithSnippet {
	constructor(
		private readonly _editor: ICodeEditor,
		@ISnippetsService private readonly _snippetService: ISnippetsService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }

	async getSurroundableSnippets(): Promise<Snippet[]> {
		if (!this._editor.hasModel()) {
			return [];
		}

		const model = this._editor.getModel();
		const { lineNumber, column } = this._editor.getPosition();
		model.tokenization.tokenizeIfCheap(lineNumber);
		const languageId = model.getLanguageIdAtPosition(lineNumber, column);

		const allSnippets = await this._snippetService.getSnippets(languageId, { includeNoPrefixSnippets: true, includeDisabledSnippets: true });
		return allSnippets.filter(snippet => snippet.usesSelection);
	}

	canExecute(): boolean {
		return this._contextKeyService.contextMatchesRules(options.precondition);
	}

	async run() {
		if (!this.canExecute()) {
			return;
		}

		const snippets = await this.getSurroundableSnippets();
		if (!snippets.length) {
			return;
		}

		const snippet = await this._instaService.invokeFunction(pickSnippet, snippets);
		if (!snippet) {
			return;
		}

		let clipboardText: string | undefined;
		if (snippet.needsClipboard) {
			clipboardText = await this._clipboardService.readText();
		}

		SnippetController2.get(this._editor)?.insert(snippet.codeSnippet, { clipboardText });
	}
}

class SurroundWithSnippetEditorAction extends EditorAction2 {
	constructor() {
		super(options);
	}
	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		const instaService = accessor.get(IInstantiationService);
		const core = instaService.createInstance(SurroundWithSnippet, editor);
		await core.run();
	}
}

registerAction2(SurroundWithSnippetEditorAction);
