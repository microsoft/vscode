/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { getDefaultNewChatSessionResource, resolveDefaultNewChatSessionType } from '../../common/constants.js';
import { markPreferredCopilotHarness } from '../../common/chatSessionTypePreference.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';

export async function clearChatEditor(accessor: ServicesAccessor, chatEditorInput?: ChatEditorInput): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const configurationService = accessor.get(IConfigurationService);
	const chatSessionsService = accessor.get(IChatSessionsService);
	const storageService = accessor.get(IStorageService);
	const workspaceContextService = accessor.get(IWorkspaceContextService);
	const agentHostEnablementService = accessor.get(IAgentHostEnablementService);

	if (!chatEditorInput) {
		const editorInput = editorService.activeEditor;
		chatEditorInput = editorInput instanceof ChatEditorInput ? editorInput : undefined;
	}

	if (chatEditorInput instanceof ChatEditorInput) {
		const currentResource = chatEditorInput.sessionResource;
		let resource: URI;
		if (currentResource && currentResource.scheme !== Schemas.vscodeLocalChatSession) {
			// Contributed/non-local session: keep the same type for the new session.
			resource = currentResource.with({ path: `/untitled-${generateUuid()}` });
		} else {
			// Local (or brand-new) session. Honor the one-time preferCopilotHarness
			// swap, consuming the migration marker only here where it is applied.
			// Otherwise fall back to the computed default.
			const currentSessionType = currentResource ? getChatSessionType(currentResource) : undefined;
			const resolved = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspaceContextService.getWorkspace(), agentHostEnablementService.enabled, { currentSessionType });
			if (resolved.isPreferCopilotHarnessSwap) {
				markPreferredCopilotHarness(storageService);
				resource = URI.from({ scheme: resolved.sessionType, path: `/untitled-${generateUuid()}` });
			} else {
				resource = getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, workspaceContextService.getWorkspace());
			}
		}

		// A chat editor can only be open in one group
		const identifier = editorService.findEditors(chatEditorInput.resource)[0];
		await editorService.replaceEditors([{
			editor: chatEditorInput,
			replacement: { resource, options: { pinned: true } satisfies IChatEditorOptions }
		}], identifier.groupId);
	}
}
