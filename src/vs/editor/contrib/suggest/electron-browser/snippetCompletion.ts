/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {Registry} from 'vs/platform/platform';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {getSnippetController, CodeSnippet} from 'vs/editor/contrib/snippet/common/snippet';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {ISnippetsRegistry, Extensions, ISnippet} from 'vs/editor/common/modes/snippetsRegistry';

interface ISnippetPick extends IPickOpenEntry {
	snippet: ISnippet;
}

class ShowSnippetsActions extends EditorAction {

	static ID: string = 'editor.action.showSnippets';

	constructor(
		descriptor: IEditorActionDescriptorData,
		editor: ICommonCodeEditor,
		@IQuickOpenService private _quickOpenService: IQuickOpenService,
		@ICodeEditorService private _editorService: ICodeEditorService
	) {
		super(descriptor, editor, Behaviour.Writeable);
	}

	run(): TPromise<boolean> {
		const editor = this._editorService.getFocusedCodeEditor();
		if (!editor || !editor.getModel()) {
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

		return this._quickOpenService.pick(picks).then(pick => {
			if (pick) {
				getSnippetController(this.editor).run(new CodeSnippet(pick.snippet.codeSnippet), 0, 0);
				return true;
			}
		});
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(
	ShowSnippetsActions,
	ShowSnippetsActions.ID,
	nls.localize('snippet.suggestions.label', "Insert Snippet"),
	undefined,
	'Insert Snippet'
));
