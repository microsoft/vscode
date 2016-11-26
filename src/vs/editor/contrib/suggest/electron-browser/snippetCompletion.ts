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
import { IQuickOpenService, IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { ISnippetsRegistry, Extensions, ISnippet } from 'vs/editor/common/modes/snippetsRegistry';

interface ISnippetPick extends IPickOpenEntry {
	snippet: ISnippet;
}

@editorAction
class ShowSnippetsActions extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showSnippets',
			label: nls.localize('snippet.suggestions.label', "Insert Snippet"),
			alias: 'Insert Snippet',
			precondition: EditorContextKeys.Writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);

		if (!editor.getModel()) {
			return;
		}

		const {lineNumber, column} = editor.getPosition();
		const modeId = editor.getModel().getModeIdAtPosition(lineNumber, column);

		const picks: ISnippetPick[] = [];
		Registry.as<ISnippetsRegistry>(Extensions.Snippets).visitSnippets(modeId, snippet => {
			picks.push({
				label: snippet.prefix,
				detail: snippet.description,
				snippet
			});
			return true;
		});

		return quickOpenService.pick(picks).then(pick => {
			if (pick) {
				SnippetController.get(editor).insertSnippet(pick.snippet.codeSnippet, 0, 0);
			}
		});
	}
}
