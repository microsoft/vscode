/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

export async function clearChatEditor(accessor: ServicesAccessor, chatEditorInput?: ChatEditorInput): Promise<void> {
	const editorService = accessor.get(IEditorService);

	if (!chatEditorInput) {
		const editorInput = editorService.activeEditor;
		chatEditorInput = editorInput instanceof ChatEditorInput ? editorInput : undefined;
	}

	if (chatEditorInput instanceof ChatEditorInput) {
		// A chat editor can only be open in one group
		const identifier = editorService.findEditors(chatEditorInput.resource)[0];
		await editorService.replaceEditors([{
			editor: chatEditorInput,
			replacement: { resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true } satisfies IChatEditorOptions }
		}], identifier.groupId);
	}
}
