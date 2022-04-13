/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { registerEditorAction, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Snippet, SnippetSource } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { pickSnippet } from 'vs/workbench/contrib/snippets/browser/snippetPicker';


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

class InsertSnippetAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertSnippet',
			label: nls.localize('snippet.suggestions.label', "Insert Snippet"),
			alias: 'Insert Snippet',
			precondition: EditorContextKeys.writable,
			description: {
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

	async run(accessor: ServicesAccessor, editor: ICodeEditor, arg: any): Promise<void> {
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
					[],
					'',
					'',
					'',
					snippet,
					'',
					SnippetSource.User,
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
		SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
	}
}

registerEditorAction(InsertSnippetAction);

// compatibility command to make sure old keybinding are still working
CommandsRegistry.registerCommand('editor.action.showSnippets', accessor => {
	return accessor.get(ICommandService).executeCommand('editor.action.insertSnippet');
});
