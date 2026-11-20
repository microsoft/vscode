/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../base/common/network.js';
import { URI } from '../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../platform/agentHost/common/agentHostConnectionsService.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IRemoteAgentHostService } from '../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService } from '../../platform/agentHost/common/tunnelAgentHost.js';
import { ILabelService, Verbosity } from '../../platform/label/common/label.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IFolderToOpen, IOpenEmptyWindowOptions } from '../../platform/window/common/window.js';
import { getEditorWindowSessionResource, notifyEditorWindowSessionUnsupported, resolveRemoteAuthority, resolveRemoteFolderUri } from '../../workbench/contrib/sessions/browser/openInVSCodeUtils.js';
import { ISessionsProvidersService } from '../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession, isSessionCreated } from '../../workbench/services/sessions/common/session.js';

export type EditorWindowTarget =
	| { readonly kind: 'empty'; readonly options: IOpenEmptyWindowOptions | undefined }
	| { readonly kind: 'folders'; readonly folders: IFolderToOpen[]; readonly chatSessionToOpen: URI | undefined };

/**
 * Provisional sessions remain owned by the Agents composer and may be replaced or disposed, so only materialized sessions are safe to share across windows.
 */
export function getChatSessionToOpenInEditor(session: ISession | undefined, chat?: IChat): URI | undefined {
	return session && isSessionCreated(session) ? chat?.resource ?? session.resource : undefined;
}

/**
 * Resolves the folders of a session to open in an editor window, or the empty window to open when they cannot be.
 */
export class EditorWindowTargetResolver {

	constructor(
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@ITunnelAgentHostService private readonly tunnelAgentHostService: ITunnelAgentHostService,
		@ISSHRemoteAgentHostService private readonly sshRemoteAgentHostService: ISSHRemoteAgentHostService,
		@IRemoteAgentHostLocationPreferenceService private readonly remoteAgentHostLocationPreferenceService: IRemoteAgentHostLocationPreferenceService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILabelService private readonly labelService: ILabelService,
	) { }

	/**
	 * @param options.notify whether to tell the user when the chat cannot be handed off to the editor window
	 */
	resolve(session: ISession | undefined, chat?: IChat, options?: { readonly notify?: boolean }): EditorWindowTarget {
		const folders = (chat ?? session?.mainChat.get())?.workspace.get()?.folders;
		if (!session || !folders?.length) {
			const remoteAuthority = session && resolveRemoteAuthority(session.providerId, this.sessionsProvidersService, this.remoteAgentHostService);
			return { kind: 'empty', options: remoteAuthority ? { remoteAuthority } : undefined };
		}

		const foldersToOpen: IFolderToOpen[] = [];
		for (const folder of folders) {
			const folderUri = resolveRemoteFolderUri(folder.workingDirectory, session.providerId, this.sessionsProvidersService, this.remoteAgentHostService);
			if (!folderUri) {
				return { kind: 'empty', options: { remoteAuthority: null } };
			}
			foldersToOpen.push({
				folderUri,
				label: folderUri.scheme === Schemas.vscodeRemote ? this.labelService.getWorkspaceLabel(folder.workingDirectory, { verbose: Verbosity.LONG }) : undefined,
			});
		}

		return { kind: 'folders', folders: foldersToOpen, chatSessionToOpen: this.resolveChatSession(session, chat, options) };
	}

	/**
	 * The resource under which an editor window opens the chat of the session, if it can.
	 */
	resolveChatSession(session: ISession, chat?: IChat, options?: { readonly notify?: boolean }): URI | undefined {
		const chatSessionToOpen = getChatSessionToOpenInEditor(session, chat);
		const editorChatSession = chatSessionToOpen && getEditorWindowSessionResource(chatSessionToOpen, session.providerId, this.sessionsProvidersService, this.remoteAgentHostService, this.agentHostConnectionsService, this.tunnelAgentHostService, this.sshRemoteAgentHostService, this.remoteAgentHostLocationPreferenceService);
		if (typeof editorChatSession === 'string' && options?.notify !== false) {
			notifyEditorWindowSessionUnsupported(this.notificationService, editorChatSession);
		}
		return URI.isUri(editorChatSession) ? editorChatSession : undefined;
	}
}
