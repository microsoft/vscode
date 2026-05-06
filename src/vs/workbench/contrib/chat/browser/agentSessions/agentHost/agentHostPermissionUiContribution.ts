/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import {
	AgentHostPermissionMode,
	IAgentHostPermissionService,
	IPendingResourceRequest,
} from '../../../../../../platform/agentHost/common/agentHostPermissionService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import {
	ChatInputNotificationSeverity,
	IChatInputNotification,
	IChatInputNotificationService,
} from '../../widget/input/chatInputNotificationService.js';

const ALLOW_COMMAND = '_agentHost.permission.allow';
const ALLOW_ALWAYS_COMMAND = '_agentHost.permission.allowAlways';
const DENY_COMMAND = '_agentHost.permission.deny';

CommandsRegistry.registerCommand(ALLOW_COMMAND, (accessor: ServicesAccessor, requestId: string) => {
	accessor.get(IAgentHostPermissionService).findPending(requestId)?.allow();
});

CommandsRegistry.registerCommand(ALLOW_ALWAYS_COMMAND, (accessor: ServicesAccessor, requestId: string) => {
	accessor.get(IAgentHostPermissionService).findPending(requestId)?.allowAlways();
});

CommandsRegistry.registerCommand(DENY_COMMAND, (accessor: ServicesAccessor, requestId: string) => {
	accessor.get(IAgentHostPermissionService).findPending(requestId)?.deny();
});

/**
 * Bridges {@link IAgentHostPermissionService} to the chat input notification
 * banner. While there are pending permission requests, the oldest one is
 * shown above the chat input with three actions:
 *
 * - **Deny** — reject the request.
 * - **Allow** — approve the request and remember it in memory until the
 *   connection closes or the window is reloaded.
 * - **Always allow** — approve and persist into `chat.agentHost.localFilePermissions`.
 */
export class AgentHostPermissionUiContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostPermissionUi';

	/** Stable id used in {@link IChatInputNotification} so updates replace in place. */
	private static readonly NOTIFICATION_ID = 'agentHost.permissionRequest';

	private _lastRequestId: string | undefined;

	constructor(
		@IAgentHostPermissionService private readonly _permissionService: IAgentHostPermissionService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();

		this._register(autorun(reader => {
			const pending = this._permissionService.allPending.read(reader);
			this._render(pending);
		}));
	}

	private _render(pending: readonly IPendingResourceRequest[]): void {
		// Show the oldest pending request first (FIFO). Empty → clear.
		const next = pending[0];
		if (!next) {
			if (this._lastRequestId) {
				this._chatInputNotificationService.deleteNotification(AgentHostPermissionUiContribution.NOTIFICATION_ID);
				this._lastRequestId = undefined;
			}
			return;
		}

		this._lastRequestId = next.id;
		this._chatInputNotificationService.setNotification(this._buildNotification(next, pending.length));
	}

	private _buildNotification(request: IPendingResourceRequest, totalPending: number): IChatInputNotification {
		const hostName = escapeMarkdownSyntaxTokens(this._resolveHostName(request.address));
		const path = request.uri.scheme === Schemas.file ? request.uri.fsPath : request.uri.toString();
		// Wrap the path in a markdown code span so it stands out from the
		// surrounding sentence. Use the longest run of backticks in `path`
		// + 1 as the fence so embedded backticks don't break the span.
		const fence = '`'.repeat((path.match(/`+/g)?.reduce((m, s) => Math.max(m, s.length), 0) ?? 0) + 1);
		const codePath = `${fence}${path}${fence}`;

		const message = new MarkdownString(
			request.mode === AgentHostPermissionMode.Write
				? localize(
					'agentHost.permission.write',
					"Remote agent host \"{0}\" wants to write {1}",
					hostName,
					codePath,
				)
				: localize(
					'agentHost.permission.read',
					"Remote agent host \"{0}\" wants to read {1}",
					hostName,
					codePath,
				),
		);

		const description = totalPending > 1
			? totalPending === 2
				? localize('agentHost.permission.oneMorePending', "+1 more request waiting")
				: localize('agentHost.permission.morePending', "+{0} more requests waiting", totalPending - 1)
			: undefined;

		return {
			id: AgentHostPermissionUiContribution.NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Warning,
			message,
			description,
			actions: [
				{
					label: localize('agentHost.permission.deny', "Deny"),
					commandId: DENY_COMMAND,
					commandArgs: [request.id],
				},
				{
					label: localize('agentHost.permission.allow', "Allow"),
					commandId: ALLOW_COMMAND,
					commandArgs: [request.id],
				},
				{
					label: localize('agentHost.permission.allowAlways', "Always Allow"),
					commandId: ALLOW_ALWAYS_COMMAND,
					commandArgs: [request.id],
				},
			],
			// Do not let the user dismiss without choosing — this is a security
			// decision. Clicking any of the three buttons resolves it.
			dismissible: false,
			autoDismissOnMessage: false,
		};
	}

	private _resolveHostName(address: string): string {
		const authority = agentHostAuthority(address);
		const label = this._labelService.getHostLabel(AGENT_HOST_SCHEME, authority);
		return label && label !== authority ? label : address;
	}
}
