/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { getToolFileEdits, getToolOutputText } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
function getPtyTerminalData(meta) {
    if (!meta) {
        return undefined;
    }
    const value = meta['ptyTerminal'];
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const input = value.input;
    const output = value.output;
    return {
        input: typeof input === 'string' ? input : undefined,
        output: typeof output === 'string' ? output : undefined,
    };
}
/**
 * Converts completed turns from the protocol state into session history items.
 */
export function turnsToHistory(turns, participantId) {
    const history = [];
    for (const turn of turns) {
        // Request
        history.push({ id: turn.id, type: 'request', prompt: turn.userMessage.text, participant: participantId });
        // Response parts — iterate the unified responseParts array
        const parts = [];
        for (const rp of turn.responseParts) {
            switch (rp.kind) {
                case "markdown" /* ResponsePartKind.Markdown */:
                    if (rp.content) {
                        parts.push({ kind: 'markdownContent', content: new MarkdownString(rp.content, { supportHtml: true }) });
                    }
                    break;
                case "toolCall" /* ResponsePartKind.ToolCall */: {
                    const tc = rp.toolCall;
                    const fileEditParts = completedToolCallToEditParts(tc);
                    const serialized = completedToolCallToSerialized(tc);
                    if (fileEditParts.length > 0) {
                        serialized.presentation = ToolInvocationPresentation.Hidden;
                    }
                    parts.push(serialized);
                    parts.push(...fileEditParts);
                    break;
                }
                case "reasoning" /* ResponsePartKind.Reasoning */:
                    if (rp.content) {
                        parts.push({ kind: 'thinking', value: rp.content });
                    }
                    break;
                case "contentRef" /* ResponsePartKind.ContentRef */:
                    // Content references are not restored into history;
                    // they are handled separately by the content provider.
                    break;
            }
        }
        // Error message for failed turns
        if (turn.state === "error" /* TurnState.Error */ && turn.error) {
            parts.push({ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${turn.error.errorType}) ${turn.error.message}`) });
        }
        history.push({ type: 'response', parts, participant: participantId });
    }
    return history;
}
/**
 * Converts an active (in-progress) turn's accumulated state into progress
 * items suitable for replaying into the chat UI when reconnecting to a
 * session that is mid-turn.
 *
 * Returns serialized progress items for content already received (text,
 * reasoning, completed tool calls) and live {@link ChatToolInvocation}
 * objects for running tool calls and pending confirmations.
 */
export function activeTurnToProgress(activeTurn) {
    const parts = [];
    for (const rp of activeTurn.responseParts) {
        switch (rp.kind) {
            case "markdown" /* ResponsePartKind.Markdown */:
                if (rp.content) {
                    parts.push({ kind: 'markdownContent', content: new MarkdownString(rp.content) });
                }
                break;
            case "reasoning" /* ResponsePartKind.Reasoning */:
                if (rp.content) {
                    parts.push({ kind: 'thinking', value: rp.content });
                }
                break;
            case "toolCall" /* ResponsePartKind.ToolCall */: {
                const tc = rp.toolCall;
                if (tc.status === "completed" /* ToolCallStatus.Completed */ || tc.status === "cancelled" /* ToolCallStatus.Cancelled */) {
                    parts.push(completedToolCallToSerialized(tc));
                }
                else if (tc.status === "running" /* ToolCallStatus.Running */ || tc.status === "streaming" /* ToolCallStatus.Streaming */ || tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                    parts.push(toolCallStateToInvocation(tc));
                }
                break;
            }
            case "contentRef" /* ResponsePartKind.ContentRef */:
                break;
        }
    }
    return parts;
}
/**
 * Converts a completed tool call from the protocol state into a serialized
 * tool invocation suitable for history replay.
 */
function completedToolCallToSerialized(tc) {
    const isTerminal = getToolKind(tc) === 'terminal';
    const isSuccess = tc.status === "completed" /* ToolCallStatus.Completed */ && tc.success;
    const invocationMsg = stringOrMarkdownToString(tc.invocationMessage) ?? '';
    let toolSpecificData;
    if (isTerminal) {
        const ptyTerminal = getPtyTerminalData(tc._meta);
        const commandInput = ptyTerminal?.input ?? tc.toolInput;
        const toolOutput = tc.status === "completed" /* ToolCallStatus.Completed */ ? (ptyTerminal?.output ?? getToolOutputText(tc)) : undefined;
        if (!commandInput && toolOutput === undefined) {
            toolSpecificData = undefined;
        }
        else {
            toolSpecificData = {
                kind: 'terminal',
                commandLine: { original: commandInput ?? '' },
                language: getToolLanguage(tc) ?? 'shellscript',
                terminalCommandOutput: toolOutput !== undefined ? { text: toolOutput } : undefined,
                terminalCommandState: { exitCode: isSuccess ? 0 : 1 },
            };
        }
    }
    const pastTenseMsg = isSuccess
        ? stringOrMarkdownToString(tc.pastTenseMessage) ?? invocationMsg
        : invocationMsg;
    return {
        kind: 'toolInvocationSerialized',
        toolCallId: tc.toolCallId,
        toolId: tc.toolName,
        source: ToolDataSource.Internal,
        invocationMessage: invocationMsg,
        originMessage: undefined,
        pastTenseMessage: isTerminal ? undefined : pastTenseMsg,
        isConfirmed: isSuccess
            ? { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ }
            : { type: 0 /* ToolConfirmKind.Denied */ },
        isComplete: true,
        presentation: undefined,
        toolSpecificData,
    };
}
/**
 * Builds edit-structure progress parts for a completed tool call that
 * produced file edits. Returns an empty array if the tool call has no edits.
 * These parts replay the undo stops and code-block UI when restoring history.
 */
function completedToolCallToEditParts(tc) {
    if (tc.status !== "completed" /* ToolCallStatus.Completed */) {
        return [];
    }
    const fileEdits = getToolFileEdits(tc);
    if (fileEdits.length === 0) {
        return [];
    }
    const parts = [];
    for (const edit of fileEdits) {
        const fileUri = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
        if (!fileUri) {
            continue;
        }
        // Emit workspace file edit progress for creates, deletes, and renames
        const isCreate = !edit.before && !!edit.after;
        const isDelete = !!edit.before && !edit.after;
        const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));
        if (isCreate || isDelete || isRename) {
            parts.push({
                kind: 'workspaceEdit',
                edits: [{
                        oldResource: edit.before?.uri ? URI.parse(edit.before.uri) : undefined,
                        newResource: edit.after?.uri ? URI.parse(edit.after.uri) : undefined,
                    }],
            });
        }
        // Emit code-block UI for content edits (and renames with content changes)
        if (edit.after?.content) {
            parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
            parts.push({ kind: 'codeblockUri', uri: fileUri, isEdit: true, undoStopId: tc.toolCallId });
            parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: false, isExternalEdit: true });
            parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: true, isExternalEdit: true });
            parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
        }
    }
    return parts;
}
/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
/**
 * Converts a protocol `StringOrMarkdown` value to a chat-layer `IMarkdownString`.
 */
function stringOrMarkdownToString(value) {
    if (value === undefined) {
        return undefined;
    }
    return typeof value === 'string' ? value : new MarkdownString(value.markdown);
}
/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
export function toolCallStateToInvocation(tc) {
    const toolData = {
        id: tc.toolName,
        source: ToolDataSource.Internal,
        displayName: tc.displayName,
        modelDescription: tc.toolName,
    };
    if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
        // Tool needs confirmation — create with confirmation messages
        const titleText = stringOrMarkdownToString(tc.confirmationTitle) ?? stringOrMarkdownToString(tc.invocationMessage) ?? tc.displayName;
        const titleStr = typeof titleText === 'string' ? titleText : titleText?.value ?? '';
        const confirmationMessages = {
            title: typeof titleText === 'string' ? new MarkdownString(titleText) : (titleText ?? new MarkdownString('')),
            message: new MarkdownString(''),
        };
        let toolSpecificData;
        if (getToolKind(tc) === 'terminal' && tc.toolInput) {
            toolSpecificData = {
                kind: 'terminal',
                commandLine: { original: tc.toolInput },
                language: getToolLanguage(tc) ?? 'shellscript',
            };
        }
        else if (tc.toolInput) {
            let rawInput;
            try {
                rawInput = JSON.parse(tc.toolInput);
            }
            catch {
                rawInput = { input: tc.toolInput };
            }
            toolSpecificData = { kind: 'input', rawInput };
        }
        return new ChatToolInvocation({
            invocationMessage: typeof titleText === 'string' ? new MarkdownString(titleStr) : (titleText ?? new MarkdownString('')),
            confirmationMessages,
            presentation: ToolInvocationPresentation.HiddenAfterComplete,
            toolSpecificData,
        }, toolData, tc.toolCallId, undefined, undefined);
    }
    const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, undefined, undefined);
    invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? '';
    if (getToolKind(tc) === 'terminal') {
        const ptyTerminal = getPtyTerminalData(tc._meta);
        const commandInput = ptyTerminal?.input ?? (tc.status !== "streaming" /* ToolCallStatus.Streaming */ ? (tc.toolInput ?? '') : '');
        invocation.toolSpecificData = {
            kind: 'terminal',
            commandLine: { original: commandInput },
            language: getToolLanguage(tc) ?? 'shellscript',
            terminalCommandOutput: ptyTerminal?.output !== undefined ? { text: ptyTerminal.output } : undefined,
        };
    }
    return invocation;
}
/**
 * Updates a live {@link ChatToolInvocation} with completion data from the
 * protocol's tool-call state, transitioning it to the completed state.
 *
 * Returns file edits that the caller should route through the editing
 * session's external edits pipeline.
 */
export function finalizeToolInvocation(invocation, tc) {
    const isCompleted = tc.status === "completed" /* ToolCallStatus.Completed */;
    const isCancelled = tc.status === "cancelled" /* ToolCallStatus.Cancelled */;
    const isTerminal = invocation.toolSpecificData?.kind === 'terminal' || getToolKind(tc) === 'terminal';
    if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
        invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? invocation.invocationMessage;
    }
    if (isTerminal && (isCompleted || isCancelled)) {
        const ptyTerminal = getPtyTerminalData(tc._meta);
        const toolOutput = isCompleted ? (ptyTerminal?.output ?? getToolOutputText(tc)) : undefined;
        const existing = invocation.toolSpecificData;
        const commandInput = ptyTerminal?.input ?? tc.toolInput ?? existing?.commandLine?.original ?? '';
        invocation.toolSpecificData = {
            kind: 'terminal',
            commandLine: { original: commandInput },
            language: existing?.language ?? getToolLanguage(tc) ?? 'shellscript',
            terminalCommandOutput: toolOutput !== undefined ? { text: toolOutput } : undefined,
            terminalCommandState: { exitCode: isCompleted && tc.success ? 0 : 1 },
        };
    }
    else if (isCompleted && tc.pastTenseMessage) {
        invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage);
    }
    const isFailure = (isCompleted && !tc.success) || isCancelled;
    const errorMessage = isCompleted ? tc.error?.message : (isCancelled ? tc.reasonMessage : undefined);
    const errorString = typeof errorMessage === 'string' ? errorMessage : errorMessage?.markdown;
    invocation.didExecuteTool(isFailure ? { content: [], toolResultError: errorString } : undefined);
    // Extract file edits for the editing session pipeline
    return isCompleted ? fileEditsToExternalEdits(tc) : [];
}
/**
 * Extracts file edit content entries from a completed tool call and
 * converts them to {@link IToolCallFileEdit} data for routing through
 * the editing session's external edits pipeline.
 */
export function fileEditsToExternalEdits(tc) {
    if (tc.status !== "completed" /* ToolCallStatus.Completed */) {
        return [];
    }
    const edits = getToolFileEdits(tc);
    if (edits.length === 0) {
        return [];
    }
    const result = [];
    for (const edit of edits) {
        const isCreate = !edit.before && !!edit.after;
        const isDelete = !!edit.before && !edit.after;
        const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));
        let kind;
        if (isCreate) {
            kind = "create" /* FileEditKind.Create */;
        }
        else if (isDelete) {
            kind = "delete" /* FileEditKind.Delete */;
        }
        else if (isRename) {
            kind = "rename" /* FileEditKind.Rename */;
        }
        else {
            kind = "edit" /* FileEditKind.Edit */;
        }
        const resource = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
        if (!resource) {
            continue;
        }
        result.push({
            kind,
            resource,
            originalResource: isRename ? URI.parse(edit.before.uri) : undefined,
            beforeContentUri: edit.before?.content.uri ? URI.parse(edit.before.content.uri) : undefined,
            afterContentUri: edit.after?.content.uri ? URI.parse(edit.after.content.uri) : undefined,
            undoStopId: tc.toolCallId,
            diff: edit.diff,
        });
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGVUb1Byb2dyZXNzQWRhcHRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0YsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBK0MsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQTRGLE1BQU0sbUVBQW1FLENBQUM7QUFDL1AsT0FBTyxFQUFFLFdBQVcsRUFBRSxlQUFlLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUdwSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuRyxPQUFPLEVBQWtELGNBQWMsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ2hLLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFaEUsU0FBUyxrQkFBa0IsQ0FBQyxJQUF5QztJQUNwRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDekMsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFJLEtBQTZCLENBQUMsS0FBSyxDQUFDO0lBQ25ELE1BQU0s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