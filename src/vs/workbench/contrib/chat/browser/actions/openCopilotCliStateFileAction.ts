/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { resolveEventsUri } from '../copilotCliEventsUri.js';

/**
 * Shared implementation of "Open Copilot CLI State File". Resolves the
 * `events.jsonl` URI for the given chat session resource and opens it in
 * an editor, or shows a notification explaining why it could not be
 * opened.
 *
 * Both the workbench-side action (uses `IChatWidgetService`) and the
 * sessions-app-side action (uses `ISessionsManagementService`) call into
 * this helper after resolving the active Copilot CLI session resource.
 */
export async function openCopilotCliStateFile(
	accessor: ServicesAccessor,
	sessionResource: URI | undefined,
): Promise<void> {
	const pathService = accessor.get(IPathService);
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const editorService = accessor.get(IEditorService);
	const notificationService = accessor.get(INotificationService);

	const userHome = pathService.userHome({ preferLocal: true });

	const result = resolveEventsUri(
		sessionResource,
		userHome,
		authority => remoteAgentHostService.connections.find(c => agentHostAuthority(c.address) === authority),
	);

	switch (result.kind) {
		case 'ok':
			await editorService.openEditor({ resource: result.resource });
			return;
		case 'no-session':
			notificationService.info(localize('openSessionEventsFile.noSession', "No Copilot CLI session is active."));
			return;
		case 'unsupported-scheme':
			notificationService.info(localize('openSessionEventsFile.unsupported', "The active chat session is not a Copilot CLI session."));
			return;
		case 'remote-not-connected':
			notificationService.warn(localize('openSessionEventsFile.notConnected', "No active connection found for remote agent host '{0}'.", result.authority));
			return;
		case 'remote-no-home':
			notificationService.warn(localize('openSessionEventsFile.noHome', "Remote agent host '{0}' did not report a home directory.", result.authority));
			return;
	}
}

/**
 * Workbench-side action. Uses the last-focused chat widget's view model to
 * find the active Copilot CLI chat session. Suitable for vscode where the
 * agents-window-specific `ISessionsManagementService` is not present.
 */
export class OpenCopilotCliStateFileAction extends Action2 {

	static readonly ID = 'workbench.action.chat.openCopilotCliStateFile';

	constructor() {
		super({
			id: OpenCopilotCliStateFileAction.ID,
			title: localize2('openSessionEventsFile', "Open Copilot CLI State File"),
			f1: true,
			category: Categories.Developer,
			precondition: ChatContextKeys.enabled,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const sessionResource = chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
		await openCopilotCliStateFile(accessor, sessionResource);
	}
}
