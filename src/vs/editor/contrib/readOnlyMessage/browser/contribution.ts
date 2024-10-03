/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { MessageController } from '../../message/browser/messageController.js';
import * as nls from '../../../../nls.js';

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
