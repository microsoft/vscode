/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import * as nls from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SnippetEditorAction } from 'vs/workbench/contrib/snippets/browser/commands/abstractSnippetsActions';
import { pickSnippet } from 'vs/workbench/contrib/snippets/browser/snippetPicker';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets';
import { Snippet, SnippetSource } from 'vs/workbench/contrib/snippets/browser/snippetsFile';

class Args {

	static fromUser(arg: any): Args {
		if (!arg || typeof arg !== 'object') {
			return Args._empty;
		}
		let { snippet, name, langId } = arg;
		if (typeof snippet !== 'string') {
			snippet = undefined;
		}
		if (typeof name !== 'string') {
			name = undefined;
		}
		if (typeof langId !== 'string') {
			langId = undefined;
		}
		return new Args(snippet, name, langId);
	}

	private static readonly _empty = new Args(undefined, undefined, undefined);

	private constructor(
		public readonly snippet: string | undefined,
		public readonly name: string | undefined,
		public readonly langId: string | undefined
	) { }
}

export class InsertSnippetAction extends SnippetEditorAction {

	constructor() {
		super({
			id: 'editor.action.insertSnippet',
			title: nls.localize2('snippet.suggestions.label', "Insert Snippet"),
			f1: true,
			precondition: EditorContextKeys.writable,
			metadata: {
				description: `Insert Snippet`,
				args: [{
					name: 'args',
					schema: {
						'type': 'object',
						'properties': {
							'snippet': {
								'type': 'string'
							},
							'langId': {
								'type': 'string',

							},
							'name': {
								'type': 'string'
							}
						},
					}
				}]
			}
		});
	}

	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, arg: any) {

		const languageService = accessor.get(ILanguageService);
		const snippetService = accessor.get(ISnippetsService);

		if (!editor.hasModel()) {
			return;
		}

		const clipboardService = accessor.get(IClipboardService);
		const instaService = accessor.get(IInstantiationService);

		const snippet = await new Promise<Snippet | undefined>((resolve, reject) => {

			const { lineNumber, column } = editor.getPosition();
			const { snippet, name, langId } = Args.fromUser(arg);

			if (snippet) {
				return resolve(new Snippet(
					false,
					[],
					'',
					'',
					'',
					snippet,
					'',
					SnippetSource.User,
					`random/${Math.random()}`
				));
			}

			let languageId: string;
			if (langId) {
				if (!languageService.isRegisteredLanguageId(langId)) {
					return resolve(undefined);
				}
				languageId = langId;
			} else {
				editor.getModel().tokenization.tokenizeIfCheap(lineNumber);
				languageId = editor.getModel().getLanguageIdAtPosition(lineNumber, column);

				// validate the `languageId` to ensure this is a user
				// facing language with a name and the chance to have
				// snippets, else fall back to the outer language
				if (!languageService.getLanguageName(languageId)) {
					languageId = editor.getModel().getLanguageId();
				}
			}

			if (name) {
				// take selected snippet
				snippetService.getSnippets(languageId, { includeNoPrefixSnippets: true })
					.then(snippets => snippets.find(snippet => snippet.name === name))
					.then(resolve, reject);

			} else {
				// let user pick a snippet
				resolve(instaService.invokeFunction(pickSnippet, languageId));
			}
		});

		if (!snippet) {
			return;
		}
		let clipboardText: string | undefined;
		if (snippet.needsClipboard) {
			clipboardText = await clipboardService.readText();
		}
		editor.focus();
		SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
		snippetService.updateUsageTimestamp(snippet);
	}
}
