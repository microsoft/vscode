/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorPane } from '../../../common/editor.js';
import { IOutline, IOutlineCreator, IOutlineService, OutlineTarget } from '../../../services/outline/browser/outline.js';
import { ChatOutline, ChatOutlineEntry } from './chatOutline.js';
import { ChatEditor } from './widgetHosts/editor/chatEditor.js';

/**
 * Registers a {@link ChatOutline} for the chat editor pane so Go to Symbol, the
 * Outline pane, and Breadcrumbs work for chat sessions opened as an editor.
 */
export class ChatOutlineCreator implements IOutlineCreator<ChatEditor, ChatOutlineEntry> {

	static readonly ID = 'chat.chatOutlineCreator';

	readonly dispose: () => void;

	constructor(
		@IOutlineService outlineService: IOutlineService,
	) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is ChatEditor {
		return candidate instanceof ChatEditor;
	}

	async createOutline(editor: ChatEditor, target: OutlineTarget, _token: CancellationToken): Promise<IOutline<ChatOutlineEntry> | undefined> {
		const widget = editor.widget;
		if (!widget) {
			return undefined;
		}
		return new ChatOutline(widget, target);
	}
}
