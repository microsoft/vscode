/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createMarkdownCommandLink, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../../nls.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
export function isMcpToolInvocation(toolInvocation) {
    return toolInvocation.source?.type === 'mcp' || toolInvocation.toolId.toLowerCase().includes('mcp');
}
/**
 * Determines whether a tool invocation's progress text should shimmer.
 * MCP tools shimmer; askQuestions defers to the caller's default; all others opt out.
 */
export function shouldShimmerForTool(toolInvocation) {
    if (isMcpToolInvocation(toolInvocation)) {
        return !IChatToolInvocation.isComplete(toolInvocation);
    }
    if (toolInvocation.toolId === 'copilot_askQuestions' || toolInvocation.toolId === 'vscode_askQuestions') {
        return false;
    }
    return false;
}
/**
 * Creates a markdown message explaining why a tool was auto-approved.
 * @param toolInvocation The tool invocation to get the approval message for
 * @returns A markdown string with the approval message, or undefined if no message should be shown
 */
export function getToolApprovalMessage(toolInvocation) {
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
export function getApprovalMessageFromReason(reason) {
    let md;
    switch (reason.type) {
        case 2 /* ToolConfirmKind.Setting */:
            md = localize('chat.autoapprove.setting', 'Auto approved by {0}', createMarkdownCommandLink({ text: '`' + reason.id + '`', id: 'workbench.action.openSettings', arguments: [reason.id], tooltip: localize('openSettings.tooltip', 'Open settings') }, false));
            break;
        case 3 /* ToolConfirmKind.LmServicePerTool */:
            md = reason.scope === 'session'
                ? localize('chat.autoapprove.lmServicePerTool.session', 'Auto approved for this session')
                : reason.scope === 'workspace'
                    ? localize('chat.autoapprove.lmServicePerTool.workspace', 'Auto approved for this workspace')
                    : localize('chat.autoapprove.lmServicePerTool.profile', 'Auto approved for this profile');
            md += ' (' + createMarkdownCommandLink({ text: localize('edit', 'Edit'), id: 'workbench.action.chat.editToolApproval', arguments: [reason.scope], tooltip: localize('editToolApproval.tooltip', 'Edit tool approval settings') }) + ')';
            break;
        case 1 /* ToolConfirmKind.ConfirmationNotNeeded */:
            if (reason.reason) {
                return typeof reason.reason === 'string'
                    ? new MarkdownString(reason.reason, { isTrusted: true })
                    : reason.reason;
            }
            return undefined;
        case 4 /* ToolConfirmKind.UserAction */:
        case 0 /* ToolConfirmKind.Denied */:
        default:
            return undefined;
    }
    return new MarkdownString(md, { isTrusted: true });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xQYXJ0VXRpbGl0aWVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xQYXJ0VXRpbGl0aWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSx5QkFBeUIsRUFBbUIsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0gsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZELE9BQU8sRUFBbUIsbUJBQW1CLEVBQWtELE1BQU0sK0NBQStDLENBQUM7QUFFckosTUFBTSxVQUFVLG1CQUFtQixDQUFDLGNBQW1FO0lBQ3RHLE9BQU8sY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLEtBQUssS0FBSyxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3JHLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsb0JBQW9CLENBQUMsY0FBbUU7SUFDdkcsSUFBSSxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1FBQ3pDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUNELElBQUksY0FBYyxDQUFDLE1BQU0sS0FBSyxzQkFBc0IsSUFBSSxjQUFjLENBQUMsTUFBTSxLQUFLLHFCQUFxQixFQUFFLENBQUM7UUFDekcsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxjQUFtRTtJQUN6RyxNQUFNLE1BQU0sR0FBRyxtQkFBbUIsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUM5RSxJQUFJLENBQUMsTUFBTSxJQUFJLE9BQU8sTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzVDLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxPQUFPLDRCQUE0QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzdDLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLDRCQUE0QixDQUFDLE1BQXVCO0lBQ25FLElBQUksRUFBVSxDQUFDO0lBQ2YsUUFBUSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDckI7WUFDQyxFQUFFLEdBQUcsUUFBUSxDQUFDLDBCQUEwQixFQUFFLHNCQUFzQixFQUFFLHlCQUF5QixDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsR0FBRyxNQUFNLENBQUMsRUFBRSxHQUFHLEdBQUcsRUFBRSxFQUFFLEVBQUUsK0JBQStCLEVBQUUsU0FBUyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsZUFBZSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzlQLE1BQU07UUFDUDtZQUNDLEVBQUUsR0FBRyxNQUFNLENBQUMsS0FBSyxLQUFLLFNBQVM7Z0JBQzlCLENBQUMsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLEVBQUUsZ0NBQWdDLENBQUM7Z0JBQ3pGLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxLQUFLLFdBQVc7b0JBQzdCLENBQUMsQ0FBQyxRQUFRLENBQUMsNkNBQTZDLEVBQUUsa0NBQWtDLENBQUM7b0JBQzdGLENBQUMsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztZQUM1RixFQUFFLElBQUksSUFBSSxHQUFHLHlCQUF5QixDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLHdDQUF3QyxFQUFFLFNBQVMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDZCQUE2QixDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUN4TyxNQUFNO1FBQ1A7WUFDQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDbkIsT0FBTyxPQUFPLE1BQU0sQ0FBQyxNQUFNLEtBQUssUUFBUTtvQkFDdkMsQ0FBQyxDQUFDLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7b0JBQ3hELENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ2xCLENBQUM7WUFDRCxPQUFPLFNBQVMsQ0FBQztRQUNsQix3Q0FBZ0M7UUFDaEMsb0NBQTRCO1FBQzVCO1lBQ0MsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztJQUVELE9BQU8sSUFBSSxjQUFjLENBQUMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFDcEQsQ0FBQyJ9