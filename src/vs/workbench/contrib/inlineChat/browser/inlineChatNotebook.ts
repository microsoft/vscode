/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalState } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class InlineChatNotebookContribution {

	private readonly _store = new DisposableStore();

	constructor(
		@IInlineChatSessionService sessionService: IInlineChatSessionService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
	) {

		this._store.add(sessionService.registerSessionKeyComputer(Schemas.vscodeNotebookCell, {
			getComparisonKey: (_editor, uri) => {
				const data = CellUri.parse(uri);
				if (!data) {
					throw illegalState('Expected notebook');
				}
				for (const editor of notebookEditorService.listNotebookEditors()) {
					if (isEqual(editor.textModel?.uri, data.notebook)) {
						return `<notebook>${editor.getId()}#${uri}`;
					}
				}
				throw illegalState('Expected notebook');
			}
		}));

		this._store.add(sessionService.onWillStartSession(newSessionEditor => {
			const candidate = CellUri.parse(newSessionEditor.getModel().uri);
			if (!candidate) {
				return;
			}
			for (const notebookEditor of notebookEditorService.listNotebookEditors()) {
				if (isEqual(notebookEditor.textModel?.uri, candidate.notebook)) {
					let found = false;
					const editors: ICodeEditor[] = [];
					for (const [, codeEditor] of notebookEditor.codeEditors) {
						editors.push(codeEditor);
						found = codeEditor === newSessionEditor || found;
					}
					if (found) {
						// found the this editor in the outer notebook editor -> make sure to
						// cancel all sibling sessions
						for (const editor of editors) {
							if (editor !== newSessionEditor) {
								InlineChatController.get(editor)?.finishExistingSession();
							}
						}
						break;
					}
				}
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}
