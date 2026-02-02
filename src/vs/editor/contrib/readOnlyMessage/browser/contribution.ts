/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import * as nls from 'vs/nls';

export class ReadOnlyMessageController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.readOnlyMessageController';

	constructor(
		private readonly editor: ICodeEditor
	) {
		super();
		this._register(this.editor.onDidAttemptReadOnlyEdit(() => this._onDidAttemptReadOnlyEdit()));
	}

	private _onDidAttemptReadOnlyEdit(): void {
		const messageController = MessageController.get(this.editor);
		if (messageController && this.editor.hasModel()) {
			let message = this.editor.getOptions().get(EditorOption.readOnlyMessage);
			if (!message) {
				if (this.editor.isSimpleWidget) {
					message = new MarkdownString(nls.localize('editor.simple.readonly', "Cannot edit in read-only input"));
				} else {
					message = new MarkdownString(nls.localize('editor.readonly', "Cannot edit in read-only editor"));
				}
			}

			messageController.showMessage(message, this.editor.getPosition());
		}
	}
}

registerEditorContribution(ReadOnlyMessageController.ID, ReadOnlyMessageController, EditorContributionInstantiation.BeforeFirstInteraction);
