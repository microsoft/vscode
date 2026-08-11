/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { resolveDefaultNewChatSessionType } from '../../common/constants.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';

function getNewChatSessionResource(sessionType: string): URI {
	return sessionType === localChatSessionType
		? LocalChatSessionUri.getNewSessionUri()
		: URI.from({ scheme: sessionType, path: `/untitled-${generateUuid()}` });
}

export async function clearChatEditor(accessor: ServicesAccessor, chatEditorInput?: ChatEditorInput, targetSessionType?: string): Promise<void> {
	const editorService = accessor.get(IEditorService);

	if (!chatEditorInput) {
		const editorInput = editorService.activeEditor;
		chatEditorInput = editorInput instanceof ChatEditorInput ? editorInput : undefined;
	}

	if (chatEditorInput instanceof ChatEditorInput) {
		const currentResource = chatEditorInput.sessionResource;
		const currentSessionType = currentResource ? getChatSessionType(currentResource) : undefined;
		const resolved = resolveDefaultNewChatSessionType(accessor, {
			explicitOverride: targetSessionType,
			currentSessionType,
		});
		const resource = getNewChatSessionResource(resolved.sessionType);

		// A chat editor can only be open in one group
		const identifier = editorService.findEditors(chatEditorInput.resource)[0];
		await editorService.replaceEditors([{
			editor: chatEditorInput,
			replacement: { resource, options: { pinned: true } satisfies IChatEditorOptions }
		}], identifier.groupId);
	}
}
