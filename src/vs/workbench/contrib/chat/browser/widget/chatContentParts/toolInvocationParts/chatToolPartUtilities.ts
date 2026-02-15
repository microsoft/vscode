/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createMarkdownCommandLink, IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../../nls.js';
import { ConfirmedReason, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';

/**
 * Creates a markdown message explaining why a tool was auto-approved.
 * @param toolInvocation The tool invocation to get the approval message for
 * @returns A markdown string with the approval message, or undefined if no message should be shown
 */
export function getToolApprovalMessage(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): IMarkdownString | undefined {
	const reason = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation);
	if (!reason || typeof reason === 'boolean') {
		return undefined;
	}

	return getApprovalMessageFromReason(reason);
}

/**
 * Creates a markdown message from a ConfirmedReason explaining why a tool was auto-approved.
 * @param reason The confirmation reason
 * @returns A markdown string with the approval message, or undefined if no message should be shown
 */
export function getApprovalMessageFromReason(reason: ConfirmedReason): IMarkdownString | undefined {
	let md: string;
	switch (reason.type) {
		case ToolConfirmKind.Setting:
			md = localize('chat.autoapprove.setting', 'Auto approved by {0}', createMarkdownCommandLink({ title: '`' + reason.id + '`', id: 'workbench.action.openSettings', arguments: [reason.id] }, false));
			break;
		case ToolConfirmKind.LmServicePerTool:
			md = reason.scope === 'session'
				? localize('chat.autoapprove.lmServicePerTool.session', 'Auto approved for this session')
				: reason.scope === 'workspace'
					? localize('chat.autoapprove.lmServicePerTool.workspace', 'Auto approved for this workspace')
					: localize('chat.autoapprove.lmServicePerTool.profile', 'Auto approved for this profile');
			md += ' (' + createMarkdownCommandLink({ title: localize('edit', 'Edit'), id: 'workbench.action.chat.editToolApproval', arguments: [reason.scope] }) + ')';
			break;
		case ToolConfirmKind.ConfirmationNotNeeded:
			if (reason.reason) {
				return typeof reason.reason === 'string'
					? new MarkdownString(reason.reason, { isTrusted: true })
					: reason.reason;
			}
			return undefined;
		case ToolConfirmKind.UserAction:
		case ToolConfirmKind.Denied:
		default:
			return undefined;
	}

	return new MarkdownString(md, { isTrusted: true });
}
