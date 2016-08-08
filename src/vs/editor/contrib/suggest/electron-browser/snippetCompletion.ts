/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {Registry} from 'vs/platform/platform';
import {TPromise} from 'vs/base/common/winjs.base';
import {ICommonCodeEditor, EditorContextKeys} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {getSnippetController, CodeSnippet} from 'vs/editor/contrib/snippet/common/snippet';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {ISnippetsRegistry, Extensions, ISnippet} from 'vs/editor/common/modes/snippetsRegistry';

interface ISnippetPick extends IPickOpenEntry {
	snippet: ISnippet;
}

class ShowSnippetsActions extends EditorAction {

	constructor() {
		super(
			'editor.action.showSnippets',
			nls.localize('snippet.suggestions.label', "Insert Snippet"),
			'Insert Snippet',
			true
		);

		this._precondition = EditorContextKeys.Writable;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): TPromise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);

		if (!editor.getModel()) {
			return;
		}

		const picks: ISnippetPick[] = [];
		Registry.as<ISnippetsRegistry>(Extensions.Snippets).visitSnippets(editor.getModel().getModeId(), snippet => {
			picks.push({
				label: snippet.prefix,
				detail: snippet.description,
				snippet
			});
			return true;
		});

		return quickOpenService.pick(picks).then(pick => {
			if (pick) {
				getSnippetController(editor).run(new CodeSnippet(pick.snippet.codeSnippet), 0, 0);
			}
		});
	}
}

CommonEditorRegistry.registerEditorAction(new ShowSnippetsActions());
