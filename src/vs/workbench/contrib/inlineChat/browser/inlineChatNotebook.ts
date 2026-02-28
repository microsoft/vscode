/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { InlineChatController } from './inlineChatController.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class InlineChatNotebookContribution {

	private readonly _store = new DisposableStore();

	constructor(
		@IInlineChatSessionService sessionService: IInlineChatSessionService,
		@IEditorService editorService: IEditorService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
	) {

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
								InlineChatController.get(editor)?.acceptSession();
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
