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
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { pickSnippet } from 'vs/workbench/contrib/snippets/browser/snippetPicker';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets.contribution';


registerAction2(class SurroundWithAction extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.action.surroundWithSnippet',
			title: { value: localize('label', 'Surround With Snippet...'), original: 'Surround With Snippet...' },
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasNonEmptySelection),
			f1: true
		});
	}

	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {

		const snippetService = accessor.get(ISnippetsService);
		const clipboardService = accessor.get(IClipboardService);
		const instaService = accessor.get(IInstantiationService);

		if (!editor.hasModel()) {
			return;
		}

		const { lineNumber, column } = editor.getPosition();
		editor.getModel().tokenization.tokenizeIfCheap(lineNumber);
		const languageId = editor.getModel().getLanguageIdAtPosition(lineNumber, column);

		const allSnippets = await snippetService.getSnippets(languageId, { includeNoPrefixSnippets: true, includeDisabledSnippets: true });
		const surroundSnippets = allSnippets.filter(snippet => snippet.usesSelection);
		const snippet = await instaService.invokeFunction(pickSnippet, surroundSnippets);

		if (!snippet) {
			return;
		}


		let clipboardText: string | undefined;
		if (snippet.needsClipboard) {
			clipboardText = await clipboardService.readText();
		}

		SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
	}
});
