/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatArtifactsService } from '../../common/tools/chatArtifactsService.js';
import { IChatTodoListService } from '../../common/tools/chatTodoListService.js';
import { IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';

/**
 * Replaces an untitled chat session with the session its provider committed it to: carries todos,
 * artifacts and the draft's editing and input state over, swaps whatever shows the draft (a chat
 * editor or the chat view) to the committed session, re-sends queued requests there and notifies
 * {@link IChatSessionsService.onDidCommitSession}.
 */
export async function commitChatSession(accessor: ServicesAccessor, chatSessionType: string, originalResource: URI, modifiedResource: URI): Promise<void> {
	const chatSessionsService = accessor.get(IChatSessionsService);
	const chatService = accessor.get(IChatService);
	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatTodoListService = accessor.get(IChatTodoListService);
	const chatArtifactsService = accessor.get(IChatArtifactsService);
	const chatDebugService = accessor.get(IChatDebugService);
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);
	const logService = accessor.get(ILogService);

	logService.trace(`commitChatSession: type(${chatSessionType}), original(${originalResource}), modified(${modifiedResource})`);

	const originalEditor = editorService.editors.find(editor => editor.resource?.toString() === originalResource.toString());
	const originalModel = chatService.acquireExistingSession(originalResource);
	const contribution = chatSessionsService.getAllChatSessionContributions().find(c => c.type === chatSessionType);

	try {

		// Migrate todos from old session to new session
		chatTodoListService.migrateTodos(originalResource, modifiedResource);

		// Migrate artifacts from old session to new session
		chatArtifactsService.getArtifacts(originalResource).migrate(chatArtifactsService.getArtifacts(modifiedResource));

		// Eagerly invoke debug providers for Copilot CLI sessions so the real
		// session appears in the debug panel immediately after the untitled →
		// real swap. Without this, the untitled session is filtered out (it
		// only has a "Load Hooks" event) and the real session has no events
		// until someone navigates to it — which can't happen because it's
		// not listed.
		if (chatSessionType === 'copilotcli') {
			// Fire-and-forget: don't block the editor swap. Errors are
			// handled internally by invokeProviders via onUnexpectedError.
			chatDebugService.invokeProviders(modifiedResource).catch(() => { /* handled internally */ });
		}

		// Find the group containing the original editor
		const originalGroup =
			editorGroupService.groups.find(group => group.editors.some(editor => isEqual(editor.resource, originalResource)))
			?? editorGroupService.activeGroup;

		const options: IChatEditorOptions = {
			title: {
				preferred: originalEditor?.getName() || undefined,
				fallback: localize('chatEditorContributionName', "{0}", contribution?.displayName),
			}
		};

		// Prefetch the chat session content to make the subsequent editor swap quick
		const newSession = await chatSessionsService.getOrCreateChatSession(modifiedResource, CancellationToken.None);

		if (originalEditor) {
			newSession.transferredState = originalEditor instanceof ChatEditorInput
				? { editingSession: originalEditor.transferOutEditingSession(), inputState: originalModel?.object?.inputModel.toJSON() }
				: undefined;

			await editorService.replaceEditors([{
				editor: originalEditor,
				replacement: {
					resource: modifiedResource,
					options,
				},
			}], originalGroup);

			// Re-send queued requests from the original session on the committed session
			chatService.migrateRequests(originalResource, modifiedResource);
			return;
		}

		// If chat editor is in the side panel, then those are not listed as editors.
		// In that case we need to transfer editing session using the original model.
		if (originalModel) {
			newSession.transferredState = {
				editingSession: originalModel.object.editingSession,
				inputState: originalModel.object.inputModel.toJSON()
			};
		}

		const chatViewWidget = chatWidgetService.getWidgetBySessionResource(originalResource);
		if (chatViewWidget && isIChatViewViewContext(chatViewWidget.viewContext)) {
			await chatWidgetService.openSession(modifiedResource, undefined, { preserveFocus: true });
		} else if (!chatViewWidget) {
			// No widget currently shows the original session — eagerly load the
			// session so the transferred state set above is materialized into a
			// chat model. We immediately release the reference; if a consumer
			// later acquires the session, the model will be re-created.
			const ref = await chatService.acquireOrLoadSession(modifiedResource, ChatAgentLocation.Chat, CancellationToken.None);
			ref?.dispose();
		}
		// When a chat widget exists for `originalResource` but is not an
		// `IChatViewViewContext` (e.g. the Agents Window's session-view chat
		// widget), that widget owns the rebind to `modifiedResource` via its
		// own observer-driven mechanism. Eagerly load+dispose here would
		// drop the chat model refcount to 0 between this dispose and the
		// widget's async re-acquire, tearing down the ext-host
		// `CopilotCLISession` (and its SDK session) — which aborts any
		// in-flight request on that session.

		// Re-send queued requests from the original session on the committed session
		chatService.migrateRequests(originalResource, modifiedResource);

		// Notify listeners that the session has been committed
		chatSessionsService.fireSessionCommitted(originalResource, modifiedResource);
	} finally {
		originalModel?.dispose();
	}
}
