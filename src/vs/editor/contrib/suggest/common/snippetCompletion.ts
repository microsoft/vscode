/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor, EditorContextKeys } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { ISnippetsRegistry, Extensions, ISnippet } from 'vs/editor/common/modes/snippetsRegistry';

interface ISnippetPick extends IPickOpenEntry {
	snippet: ISnippet;
}

class NameAndLangId {

	static fromArg(arg: any): NameAndLangId {
		if (typeof arg !== 'object') {
			return new NameAndLangId(undefined, undefined);
		}
		let {name, langId} = arg;
		if (typeof name !== 'string') {
			name = undefined;
		}
		if (typeof langId !== 'string') {
			langId = undefined;
		}
		return new NameAndLangId(name, langId);
	}

	private constructor(public readonly name: string, public readonly langId: string) {

	}

}

@editorAction
class InsertSnippetAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertSnippet',
			label: nls.localize('snippet.suggestions.label', "Insert Snippet"),
			alias: 'Insert Snippet',
			precondition: EditorContextKeys.Writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor, arg: any): TPromise<void> {

		if (!editor.getModel()) {
			return;
		}

		const quickOpenService = accessor.get(IQuickOpenService);
		const {lineNumber, column} = editor.getPosition();
		let {name, langId} = NameAndLangId.fromArg(arg);

		if (!langId) {
			langId = editor.getModel().getModeIdAtPosition(lineNumber, column);
		}

		return new TPromise<ISnippet>((resolve, reject) => {
			if (name) {
				// take selected snippet
				Registry.as<ISnippetsRegistry>(Extensions.Snippets).visitSnippets(langId, snippet => {
					if (snippet.name !== name) {
						return true;
					}
					resolve(snippet);
				});
			} else {
				// let user pick a snippet
				const picks: ISnippetPick[] = [];
				Registry.as<ISnippetsRegistry>(Extensions.Snippets).visitSnippets(langId, snippet => {
					picks.push({
						label: snippet.prefix,
						detail: snippet.description,
						snippet
					});
					return true;
				});
				return quickOpenService.pick(picks).then(pick => resolve(pick && pick.snippet), reject);
			}
		}).then(snippet => {
			if (snippet) {
				SnippetController.get(editor).insertSnippet(snippet.codeSnippet, 0, 0);
			}
		});
	}
}
