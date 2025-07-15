/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { SnippetEditorAction } from './abstractSnippetsActions.js';
import { pickSnippet } from '../snippetPicker.js';
import { Snippet } from '../snippetsFile.js';
import { ISnippetsService } from '../snippets.js';
import { localize2 } from '../../../../../nls.js';

export async function getSurroundableSnippets(snippetsService: ISnippetsService, model: ITextModel, position: Position, includeDisabledSnippets: boolean): Promise<Snippet[]> {

	const { lineNumber, column } = position;
	model.tokenization.tokenizeIfCheap(lineNumber);
	const languageId = model.getLanguageIdAtPosition(lineNumber, column);

	const allSnippets = await snippetsService.getSnippets(languageId, { includeNoPrefixSnippets: true, includeDisabledSnippets });
	return allSnippets.filter(snippet => snippet.usesSelection);
}

export class SurroundWithSnippetEditorAction extends SnippetEditorAction {

	static readonly options = {
		id: 'editor.action.surroundWithSnippet',
		title: localize2('label', "Surround with Snippet...")
	};

	constructor() {
		super({
			...SurroundWithSnippetEditorAction.options,
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				EditorContextKeys.hasNonEmptySelection
			),
			f1: true,
		});
	}

	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		if (!editor.hasModel()) {
			return;
		}

		const instaService = accessor.get(IInstantiationService);
		const snippetsService = accessor.get(ISnippetsService);
		const clipboardService = accessor.get(IClipboardService);

		const snippets = await getSurroundableSnippets(snippetsService, editor.getModel(), editor.getPosition(), true);
		if (!snippets.length) {
			return;
		}

		const snippet = await instaService.invokeFunction(pickSnippet, snippets);
		if (!snippet) {
			return;
		}

		let clipboardText: string | undefined;
		if (snippet.needsClipboard) {
			clipboardText = await clipboardService.readText();
		}

		editor.focus();
		SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
		snippetsService.updateUsageTimestamp(snippet);
	}
}
