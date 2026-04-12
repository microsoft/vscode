/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool } from './copilotToolDisplay.js';
import { buildSessionDbUri } from './fileEditTracker.js';
function tryStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return undefined;
    }
}
/**
 * Maps raw SDK session events into agent protocol events, restoring
 * stored file-edit metadata from the session database when available.
 *
 * Extracted as a standalone function so it can be tested without the
 * full CopilotAgent or SDK dependencies.
 */
export async function mapSessionEvents(session, db, events) {
    const result = [];
    const toolInfoByCallId = new Map();
    // Collect all tool call IDs for edit tools so we can batch-query the database
    const editToolCallIds = [];
    // First pass: collect tool info and identify edit tool calls
    for (const e of events) {
        if (e.type === 'tool.execution_start') {
            const d = e.data;
            if (isHiddenTool(d.toolName)) {
                continue;
            }
            const toolArgs = d.arguments !== undefined ? tryStringify(d.arguments) : undefined;
            let parameters;
            if (toolArgs) {
                try {
                    parameters = JSON.parse(toolArgs);
                }
                catch { /* ignore */ }
            }
            toolInfoByCallId.set(d.toolCallId, { toolName: d.toolName, parameters });
            if (isEditTool(d.toolName)) {
                editToolCallIds.push(d.toolCallId);
            }
        }
    }
    // Query the database for stored file edits (metadata only)
    let storedEdits;
    if (db && editToolCallIds.length > 0) {
        try {
            const records = await db.getFileEdits(editToolCallIds);
            if (records.length > 0) {
                storedEdits = new Map();
                for (const r of records) {
                    let list = storedEdits.get(r.toolCallId);
                    if (!list) {
                        list = [];
                        storedEdits.set(r.toolCallId, list);
                    }
                    list.push(r);
                }
            }
        }
        catch (_e) {
            // Database may not exist yet for new sessions — that's fine
        }
    }
    const sessionUriStr = session.toString();
    // Second pass: build result events
    for (const e of events) {
        if (e.type === 'assistant.message' || e.type === 'user.message') {
            const d = e.data;
            result.push({
                session,
                type: 'message',
                role: e.type === 'user.message' ? 'user' : 'assistant',
                messageId: d?.messageId ?? d?.interactionId ?? '',
                content: d?.content ?? '',
                toolRequests: d?.toolRequests?.map((tr) => ({
                    toolCallId: tr.toolCallId,
                    name: tr.name,
                    arguments: tr.arguments !== undefined ? tryStringify(tr.arguments) : undefined,
                    type: tr.type,
                })),
                reasoningOpaque: d?.reasoningOpaque,
                reasoningText: d?.reasoningText,
                encryptedContent: d?.encryptedContent,
                parentToolCallId: d?.parentToolCallId,
            });
        }
        else if (e.type === 'tool.execution_start') {
            const d = e.data;
            if (isHiddenTool(d.toolName)) {
                continue;
            }
            const info = toolInfoByCallId.get(d.toolCallId);
            const displayName = getToolDisplayName(d.toolName);
            const toolKind = getToolKind(d.toolName);
            const toolArgs = d.arguments !== undefined ? tryStringify(d.arguments) : undefined;
            result.push({
                session,
                type: 'tool_start',
                toolCallId: d.toolCallId,
                toolName: d.toolName,
                displayName,
                invocationMessage: getInvocationMessage(d.toolName, displayName, info?.parameters),
                toolInput: getToolInputString(d.toolName, info?.parameters, toolArgs),
                toolKind,
                language: toolKind === 'terminal' ? getShellLanguage(d.toolName) : undefined,
                toolArguments: toolArgs,
                mcpServerName: d.mcpServerName,
                mcpToolName: d.mcpToolName,
                parentToolCallId: d.parentToolCallId,
            });
        }
        else if (e.type === 'tool.execution_complete') {
            const d = e.data;
            const info = toolInfoByCallId.get(d.toolCallId);
            if (!info) {
                continue;
            }
            toolInfoByCallId.delete(d.toolCallId);
            const displayName = getToolDisplayName(info.toolName);
            const toolOutput = d.error?.message ?? d.result?.content;
            const content = [];
            if (toolOutput !== undefined) {
                content.push({ type: "text" /* ToolResultContentType.Text */, text: toolOutput });
            }
            // Restore file edit content references from the database
            const edits = storedEdits?.get(d.toolCallId);
            if (edits) {
                for (const edit of edits) {
                    const beforeUri = edit.kind === 'rename' && edit.originalPath
                        ? URI.file(edit.originalPath).toString()
                        : URI.file(edit.filePath).toString();
                    const afterUri = URI.file(edit.filePath).toString();
                    const hasBefore = edit.kind !== 'create';
                    const hasAfter = edit.kind !== 'delete';
                    content.push({
                        type: "fileEdit" /* ToolResultContentType.FileEdit */,
                        before: hasBefore ? {
                            uri: beforeUri,
                            content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'before') },
                        } : undefined,
                        after: hasAfter ? {
                            uri: afterUri,
                            content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'after') },
                        } : undefined,
                        diff: (edit.addedLines !== undefined || edit.removedLines !== undefined)
                            ? { added: edit.addedLines, removed: edit.removedLines }
                            : undefined,
                    });
                }
            }
            result.push({
                session,
                type: 'tool_complete',
                toolCallId: d.toolCallId,
                result: {
                    success: d.success,
                    pastTenseMessage: getPastTenseMessage(info.toolName, displayName, info.parameters, d.success),
                    content: content.length > 0 ? content : undefined,
                    error: d.error,
                },
                isUserRequested: d.isUserRequested,
                toolTelemetry: d.toolTelemetry !== undefined ? tryStringify(d.toolTelemetry) : undefined,
                parentToolCallId: d.parentToolCallId,
            });
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwU2Vzc2lvbkV2ZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFJckQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDckwsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFekQsU0FBUyxZQUFZLENBQUMsS0FBYztJQUNuQyxJQUFJLENBQUM7UUFDSixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNSLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7QUFDRixDQUFDO0FBK0NEOzs7Ozs7R0FNRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLENBQ3JDLE9BQVksRUFDWixFQUFnQyxFQUNoQyxNQUFnQztJQUVoQyxNQUFNLE1BQU0sR0FBNEUsRUFBRSxDQUFDO0lBQzNGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQWlGLENBQUM7SUFFbEgsOEVBQThFO0lBQzlFLE1BQU0sZUFBZSxHQUFhLEVBQUUsQ0FBQztJQUVyQyw2REFBNkQ7SUFDN0QsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssc0JBQXNCLEVBQUUsQ0FBQztZQUN2QyxNQUFNLENBQUMsR0FBSSxDQUE0QixD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