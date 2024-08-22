/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalState } from '../../../../base/common/errors';
import { DisposableStore } from '../../../../base/common/lifecycle';
import { Schemas } from '../../../../base/common/network';
import { isEqual } from '../../../../base/common/resources';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser';
import { InlineChatController } from './inlineChatController';
import { IInlineChatSessionService } from './inlineChatSessionService';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService';
import { CellUri } from '../../notebook/common/notebookCommon';
import { IEditorService } from '../../../services/editor/common/editorService';
import { NotebookTextDiffEditor } from '../../notebook/browser/diff/notebookDiffEditor';
import { NotebookMultiTextDiffEditor } from '../../notebook/browser/diff/notebookMultiDiffEditor';

export class InlineChatNotebookContribution {

	private readonly _store = new DisposableStore();

	constructor(
		@IInlineChatSessionService sessionService: IInlineChatSessionService,
		@IEditorService editorService: IEditorService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
	) {

		this._store.add(sessionService.registerSessionKeyComputer(Schemas.vscodeNotebookCell, {
			getComparisonKey: (editor, uri) => {
				const data = CellUri.parse(uri);
				if (!data) {
					throw illegalState('Expected notebook cell uri');
				}
				let fallback: string | undefined;
				for (const notebookEditor of notebookEditorService.listNotebookEditors()) {
					if (notebookEditor.hasModel() && isEqual(notebookEditor.textModel.uri, data.notebook)) {

						const candidate = `<notebook>${notebookEditor.getId()}#${uri}`;

						if (!fallback) {
							fallback = candidate;
						}

						// find the code editor in the list of cell-code editors
						if (notebookEditor.codeEditors.find((tuple) => tuple[1] === editor)) {
							return candidate;
						}

						// 	// reveal cell and try to find code editor again
						// 	const cell = notebookEditor.getCellByHandle(data.handle);
						// 	if (cell) {
						// 		notebookEditor.revealInViewAtTop(cell);
						// 		if (notebookEditor.codeEditors.find((tuple) => tuple[1] === editor)) {
						// 			return candidate;
						// 		}
						// 	}
					}
				}

				if (fallback) {
					return fallback;
				}

				const activeEditor = editorService.activeEditorPane;
				if (activeEditor && (activeEditor.getId() === NotebookTextDiffEditor.ID || activeEditor.getId() === NotebookMultiTextDiffEditor.ID)) {
					return `<notebook>${editor.getId()}#${uri}`;
				}

				throw illegalState('Expected notebook editor');
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
