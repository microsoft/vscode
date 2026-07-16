/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { getDefaultNewChatSessionResource } from '../../common/constants.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';

export async function clearChatEditor(accessor: ServicesAccessor, chatEditorInput?: ChatEditorInput): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const configurationService = accessor.get(IConfigurationService);
	const chatSessionsService = accessor.get(IChatSessionsService);
	const storageService = accessor.get(IStorageService);
	const workspaceContextService = accessor.get(IWorkspaceContextService);

	if (!chatEditorInput) {
		const editorInput = editorService.activeEditor;
		chatEditorInput = editorInput instanceof ChatEditorInput ? editorInput : undefined;
	}

	if (chatEditorInput instanceof ChatEditorInput) {
		// If we have a contributed session, make sure we create an untitled session for it.
		// Otherwise create a generic new chat editor.
		const resource = chatEditorInput.sessionResource && chatEditorInput.sessionResource.scheme !== Schemas.vscodeLocalChatSession
			? chatEditorInput.sessionResource.with({ path: `/untitled-${generateUuid()}` })
			: getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, workspaceContextService.getWorkspace());

		// A chat editor can only be open in one group
		const identifier = editorService.findEditors(chatEditorInput.resource)[0];
		await editorService.replaceEditors([{
			editor: chatEditorInput,
			replacement: { resource, options: { pinned: true } satisfies IChatEditorOptions }
		}], identifier.groupId);
	}
}
