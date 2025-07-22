/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatWidgetViewOptions } from '../../chat/browser/chat.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/chatWidget.js';
import { INotebookEditor } from '../../notebook/browser/notebookBrowser.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';

export class InlineNotebookChatZoneWidget extends InlineChatZoneWidget {

	constructor(
		location: IChatWidgetLocationOptions,
		options: IChatWidgetViewOptions | undefined,
		editor: ICodeEditor,
		private readonly _notebookEditor: INotebookEditor,
		@IInstantiationService instaService: IInstantiationService,
		@ILogService logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(location, options, editor, instaService, logService, contextKeyService);
	}

	protected override getEditorHeight(): number {
		return this._notebookEditor.getLayoutInfo().height;
	}
}
