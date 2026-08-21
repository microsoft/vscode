/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

/**
 * Shared implementation of "Open Agent Host State File". Asks the Agent Host
 * connection that owns the session for its provider-owned state file.
 *
 * Both the workbench-side action (uses `IChatWidgetService`) and the
 * sessions-app-side action (uses `ISessionsService`) call into
 * this helper after resolving the active Agent Host session resource.
 */
export async function openAgentHostStateFile(
	accessor: ServicesAccessor,
	sessionResource: URI | undefined,
): Promise<void> {
	const connectionsService = accessor.get(IAgentHostConnectionsService);
	const editorService = accessor.get(IEditorService);
	const notificationService = accessor.get(INotificationService);

	if (!sessionResource) {
		notificationService.info(localize('openAgentHostStateFile.noSession', "No Agent Host session is active."));
		return;
	}

	const sessionResolution = connectionsService.resolveSessionResource(sessionResource);
	if (!sessionResolution) {
		notificationService.info(localize('openAgentHostStateFile.unsupported', "The active chat session is not an Agent Host session."));
		return;
	}

	try {
		const stateFile = await sessionResolution.connection.getSessionStateFile(sessionResolution.backendSession);
		if (!stateFile) {
			notificationService.info(localize('openAgentHostStateFile.noStateFile', "The active Agent Host session does not expose a state file."));
			return;
		}
		await editorService.openEditor({ resource: stateFile });
	} catch (error) {
		notificationService.error(localize('openAgentHostStateFile.error', "Failed to open the Agent Host state file: {0}", error instanceof Error ? error.message : String(error)));
	}
}

/**
 * Workbench-side action. Uses the last-focused chat widget's view model to
 * find the active Agent Host chat session. Suitable for vscode where the
 * agents-window-specific `ISessionsService` is not present.
 */
export class OpenAgentHostStateFileAction extends Action2 {

	static readonly ID = 'workbench.action.chat.openCopilotCliStateFile';

	constructor() {
		super({
			id: OpenAgentHostStateFileAction.ID,
			title: localize2('openAgentHostStateFile', "Open Agent Host State File"),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				IsSessionsWindowContext.negate(),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const sessionResource = chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
		await openAgentHostStateFile(accessor, sessionResource);
	}
}
