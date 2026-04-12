/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatModel_1;
import { asArray } from '../../../../../base/common/arrays.js';
import { softAssertNever } from '../../../../../base/common/assert.js';
import { VSBuffer, decodeHex, encodeHex } from '../../../../../base/common/buffer.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString, isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, autorunSelfDisposable, constObservable, derived, observableFromEvent, observableSignalFromEvent, observableValue, observableValueOpts } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { IChatRequestVariableEntry, isImplicitVariableEntry, isStringImplicitContextValue, isStringVariableEntry } from '../attachments/chatVariableEntries.js';
import { migrateLegacyTerminalToolSpecificData } from '../chat.js';
import { ChatPerfMark, markChat } from '../chatPerf.js';
import { ChatResponseClearToPreviousToolInvocationReason, IChatService, IChatToolInvocation, isIUsedContext } from '../chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { ChatToolInvocation } from './chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../tools/languageModelToolsService.js';
import { IChatEditingService } from '../editing/chatEditingService.js';
import { IChatAgentService, reviveSerializedAgent } from '../participants/chatAgents.js';
import { ChatRequestTextPart, reviveParsedChatRequest } from '../requestParser/chatParserTypes.js';
import { chatSessionResourceToId, LocalChatSessionUri } from './chatUri.js';
export const CHAT_ATTACHABLE_IMAGE_MIME_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
};
export function getAttachableImageExtension(mimeType) {
    return Object.entries(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).find(([_, value]) => value === mimeType)?.[0];
}
export var IChatRequestVariableData;
(function (IChatRequestVariableData) {
    function toExport(data) {
        return { variables: data.variables.map(IChatRequestVariableEntry.toExport) };
    }
    IChatRequestVariableData.toExport = toExport;
})(IChatRequestVariableData || (IChatRequestVariableData = {}));
export function isCellTextEditOperation(value) {
    const candidate = value;
    return !!candidate && !!candidate.edit && !!candidate.uri && URI.isUri(candidate.uri);
}
export function isCellTextEditOperationArray(value) {
    return value.some(isCellTextEditOperation);
}
const nonHistoryKinds = new Set(['toolInvocation', 'toolInvocationSerialized', 'undoStop']);
function isChatProgressHistoryResponseContent(content) {
    return !nonHistoryKinds.has(content.kind);
}
export function toChatHistoryContent(content) {
    return content.filter(isChatProgressHistoryResponseContent);
}
export const defaultChatResponseModelChangeReason = { reason: 'other' };
export class ChatRequestModel {
    get shouldBeBlocked() {
        return this._shouldBeBlocked;
    }
    setShouldBeBlocked(value) {
        this._shouldBeBlocked.set(value, undefined);
    }
    get session() {
        return this._session;
    }
    get attempt() {
        return this._attempt;
    }
    get variableData() {
        return this._variableData;
    }
    set variableData(v) {
        this._version++;
        this._variableData = v;
    }
    get confirmation() {
        return this._confirmation;
    }
    get locationData() {
        return this._locationData;
    }
    get attachedContext() {
        return this._attachedContext;
    }
    get editedFileEvents() {
        return this._editedFileEvents;
    }
    get version() {
        return this._version;
    }
    constructor(params) {
        this._shouldBeBlocked = observableValue(this, false);
        this._version = 0;
        this._session = params.session;
        this.message = params.message;
        this._variableData = params.variableData;
        this.timestamp = params.timestamp;
        this._attempt = params.attempt ?? 0;
        this.modeInfo = params.modeInfo;
        this._confirmation = params.confirmation;
        this._locationData = params.locationData;
        this._attachedContext = params.attachedContext;
        this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
        this.modelId = params.modelId;
        this.id = params.restoredId ?? 'request_' + generateUuid();
        this._editedFileEvents = params.editedFileEvents;
        this.userSelectedTools = params.userSelectedTools;
        this.isSystemInitiated = params.isSystemInitiated;
        this.systemInitiatedLabel = params.systemInitiatedLabel;
    }
    adoptTo(session) {
        this._session = session;
    }
}
class AbstractResponse {
    get value() {
        return this._responseParts;
    }
    constructor(value) {
        this._responseParts = value;
    }
    toString() {
        if (this._responseRepr === undefined) {
            this._responseRepr = this.computeRepr();
        }
        return this._responseRepr;
    }
    /**
     * _Just_ the content of markdown parts in the response
     */
    getMarkdown() {
        if (this._markdownContent === undefined) {
            this._markdownContent = this.computeMarkdownContent();
        }
        return this._markdownContent;
    }
    /**
     * The trailing contiguous markdown/inline-reference content of the response,
     * skipping any trailing tool calls or empty markdown parts.
     */
    getFinalResponse() {
        const parts = this._responseParts;
        // Walk backwards to find where the last contiguous markdown block starts.
        // Phase 1: skip trailing non-markdown parts and empty markdown.
        let i = parts.length - 1;
        while (i >= 0) {
            const part = parts[i];
            if (part.kind === 'markdownContent' || part.kind === 'markdownVuln') {
                if (part.content.value.length > 0) {
                    break;
                }
            }
            else if (part.kind === 'inlineReference') {
                break;
            }
            i--;
        }
        if (i < 0) {
            return '';
        }
        // Phase 2: collect contiguous markdown/inline-reference parts going backwards.
        const end = i;
        while (i >= 0) {
            const part = parts[i];
            if (part.kind === 'markdownContent' || part.kind === 'markdownVuln' || part.kind === 'inlineReference') {
                i--;
            }
            else {
                break;
            }
        }
        const start = i + 1;
        // Combine the collected parts.
        const segments = [];
        for (let j = start; j <= end; j++) {
            const part = parts[j];
            if (part.kind === 'inlineReference') {
                segments.push(this.inlineRefToRepr(part));
            }
            else if (part.kind === 'markdownContent' || part.kind === 'markdownVuln') {
                if (part.content.value.length > 0) {
                    segments.push(part.content.value);
                }
            }
        }
        return segments.join('');
    }
    /**
     * Invalidate cached representations so they are recomputed on next access.
     */
    _invalidateRepr() {
        this._responseRepr = undefined;
        this._markdownContent = undefined;
    }
    computeMarkdownContent() {
        const segments = [];
        for (const part of this._responseParts) {
            if (part.kind === 'inlineReference') {
                segments.push(this.inlineRefToRepr(part));
            }
            else if (part.kind === 'markdownContent' || part.kind === 'markdownVuln') {
                if (part.content.value.length > 0) {
                    segments.push(part.content.value);
                }
            }
        }
        return segments.join('');
    }
    computeRepr() {
        return this.partsToRepr(this._responseParts);
    }
    partsToRepr(parts) {
        const blocks = [];
        let currentBlockSegments = [];
        let hasEditGroupsAfterLastClear = false;
        for (const part of parts) {
            let segment;
            switch (part.kind) {
                case 'clearToPreviousToolInvocation':
                    currentBlockSegments = [];
                    blocks.length = 0;
                    hasEditGroupsAfterLastClear = false; // Reset edit groups flag when clearing
                    continue;
                case 'treeData':
                case 'progressMessage':
                case 'codeblockUri':
                case 'extensions':
                case 'pullRequest':
                case 'undoStop':
                case 'workspaceEdit':
                case 'elicitation2':
                case 'elicitationSerialized':
                case 'thinking':
                case 'hook':
                case 'multiDiffData':
                case 'mcpServersStarting':
                case 'questionCarousel':
                case 'disabledClaudeHooks':
                    // Ignore
                    continue;
                case 'toolInvocation':
                case 'toolInvocationSerialized':
                    // Include tool invocations in the copy text
                    segment = this.getToolInvocationText(part);
                    break;
                case 'inlineReference':
                    segment = { text: this.inlineRefToRepr(part) };
                    break;
                case 'command':
                    segment = { text: part.command.title, isBlock: true };
                    break;
                case 'textEditGroup':
                case 'notebookEditGroup':
                    // Mark that we have edit groups after the last clear
                    hasEditGroupsAfterLastClear = true;
                    // Skip individual edit groups to avoid duplication
                    continue;
                case 'confirmation':
                    if (part.message instanceof MarkdownString) {
                        segment = { text: `${part.title}\n${part.message.value}`, isBlock: true };
                        break;
                    }
                    segment = { text: `${part.title}\n${part.message}`, isBlock: true };
                    break;
                case 'markdownContent':
                case 'markdownVuln':
                case 'progressTask':
                case 'progressTaskSerialized':
                case 'warning':
                    segment = { text: part.content.value };
                    break;
                default:
                    // Ignore any unknown/obsolete parts, but assert that all are handled:
                    softAssertNever(part);
                    continue;
            }
            if (segment.isBlock) {
                if (currentBlockSegments.length) {
                    blocks.push(currentBlockSegments.join(''));
                    currentBlockSegments = [];
                }
                blocks.push(segment.text);
            }
            else {
                currentBlockSegments.push(segment.text);
            }
        }
        if (currentBlockSegments.length) {
            blocks.push(currentBlockSegments.join(''));
        }
        // Add consolidated edit summary at the end if there were any edit groups after the last clear
        if (hasEditGroupsAfterLastClear) {
            blocks.push(localize('editsSummary', "Made changes."));
        }
        return blocks.join('\n\n');
    }
    inlineRefToRepr(part) {
        if ('uri' in part.inlineReference) {
            return this.uriToRepr(part.inlineReference.uri);
        }
        return 'name' in part.inlineReference
            ? '`' + part.inlineReference.name + '`'
            : this.uriToRepr(part.inlineReference);
    }
    getToolInvocationText(toolInvocation) {
        // Extract the message and input details
        let message = '';
        let input = '';
        if (toolInvocation.pastTenseMessage) {
            message = typeof toolInvocation.pastTenseMessage === 'string'
                ? toolInvocation.pastTenseMessage
                : toolInvocation.pastTenseMessage.value;
        }
        else {
            message = typeof toolInvocation.invocationMessage === 'string'
                ? toolInvocation.invocationMessage
                : toolInvocation.invocationMessage.value;
        }
        // Handle different types of tool invocations
        if (toolInvocation.toolSpecificData) {
            if (toolInvocation.toolSpecificData.kind === 'terminal') {
                message = 'Ran terminal command';
                const terminalData = migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData);
                input = terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
            }
        }
        // Format the tool invocation text
        let text = message;
        if (input) {
            text += `: ${input}`;
        }
        // For completed tool invocations, also include the result details if available
        if (toolInvocation.kind === 'toolInvocationSerialized' || (toolInvocation.kind === 'toolInvocation' && IChatToolInvocation.isComplete(toolInvocation))) {
            const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);
            if (resultDetails && 'input' in resultDetails) {
                const resultPrefix = toolInvocation.kind === 'toolInvocationSerialized' || IChatToolInvocation.isComplete(toolInvocation) ? 'Completed' : 'Errored';
                text += `\n${resultPrefix} with input: ${resultDetails.input}`;
            }
        }
        return { text, isBlock: true };
    }
    uriToRepr(uri) {
        if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
            return uri.toString(false);
        }
        return basename(uri);
    }
}
/** A view of a subset of a response */
class ResponseView extends AbstractResponse {
    constructor(_response, undoStop) {
        let idx = _response.value.findIndex(v => v.kind === 'undoStop' && v.id === undoStop);
        // Undo stops are inserted before `codeblockUri`'s, which are preceeded by a
        // markdownContent containing the opening code fence. Adjust the index
        // backwards to avoid a buggy response if it looked like this happened.
        if (_response.value[idx + 1]?.kind === 'codeblockUri' && _response.value[idx - 1]?.kind === 'markdownContent') {
            idx--;
        }
        super(idx === -1 ? _response.value.slice() : _response.value.slice(0, idx));
        this.undoStop = undoStop;
    }
}
export class Response extends AbstractResponse {
    get onDidChangeValue() {
        return this._onDidChangeValue.event;
    }
    constructor(value) {
        super(asArray(value).map((v) => ('kind' in v ? v :
            isMarkdownString(v) ? { content: v, kind: 'markdownContent' } :
                { kind: 'treeData', treeData: v })));
        this._onDidChangeValue = new Emitter();
        this._citations = [];
    }
    dispose() {
        this._onDidChangeValue.dispose();
    }
    clear() {
        this._responseParts = [];
        this._contentChanged(true);
    }
    clearToPreviousToolInvocation(message) {
        // look through the response parts and find the last tool invocation, then slice the response parts to that point
        let lastToolInvocationIndex = -1;
        for (let i = this._responseParts.length - 1; i >= 0; i--) {
            const part = this._responseParts[i];
            if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
                lastToolInvocationIndex = i;
                break;
            }
        }
        if (lastToolInvocationIndex !== -1) {
            this._responseParts = this._responseParts.slice(0, lastToolInvocationIndex + 1);
        }
        else {
            this._responseParts = [];
        }
        if (message) {
            this._responseParts.push({ kind: 'warning', content: new MarkdownString(message) });
        }
        this._contentChanged(true);
    }
    updateContent(progress, quiet) {
        if (progress.kind === 'clearToPreviousToolInvocation') {
            if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.CopyrightContentRetry) {
                this.clearToPreviousToolInvocation(localize('copyrightContentRetry', "Response cleared due to possible match to public code, retrying with modified prompt."));
            }
            else if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.FilteredContentRetry) {
                this.clearToPreviousToolInvocation(localize('filteredContentRetry', "Response cleared due to content safety filters, retrying with modified prompt."));
            }
            else {
                this.clearToPreviousToolInvocation();
            }
            return;
        }
        else if (progress.kind === 'markdownContent') {
            // last response which is NOT a text edit group because we do want to support heterogenous streaming but not have
            // the MD be chopped up by text edit groups (and likely other non-renderable parts)
            const lastResponsePart = this._responseParts
                .filter(p => p.kind !== 'textEditGroup')
                .at(-1);
            if (!lastResponsePart || lastResponsePart.kind !== 'markdownContent' || !canMergeMarkdownStrings(lastResponsePart.content, progress.content)) {
                // The last part can't be merged with- not markdown, or markdown with different permissions
                this._responseParts.push(progress);
            }
            else {
                // Don't modify the current object, since it's being diffed by the renderer
                const idx = this._responseParts.indexOf(lastResponsePart);
                this._responseParts[idx] = { ...lastResponsePart, content: appendMarkdownString(lastResponsePart.content, progress.content) };
            }
            this._contentChanged(quiet);
        }
        else if (progress.kind === 'thinking') {
            // tries to split thinking chunks if it is an array. only while certain models give us array chunks.
            const lastResponsePart = this._responseParts
                .filter(p => p.kind !== 'textEditGroup')
                .at(-1);
            const lastText = lastResponsePart && lastResponsePart.kind === 'thinking'
                ? (Array.isArray(lastResponsePart.value) ? lastResponsePart.value.join('') : (lastResponsePart.value || ''))
                : '';
            const currText = Array.isArray(progress.value) ? progress.value.join('') : (progress.value || '');
            const isEmpty = (s) => s.length === 0;
            // Do not merge if either the current or last thinking chunk is empty; empty chunks separate thinking
            if (!lastResponsePart
                || lastResponsePart.kind !== 'thinking'
                || isEmpty(currText)
                || isEmpty(lastText)
                || !canMergeMarkdownStrings(new MarkdownString(lastText), new MarkdownString(currText))) {
                this._responseParts.push(progress);
            }
            else {
                const idx = this._responseParts.indexOf(lastResponsePart);
                this._responseParts[idx] = {
                    ...lastResponsePart,
                    value: appendMarkdownString(new MarkdownString(lastText), new MarkdownString(currText)).value
                };
            }
            this._contentChanged(quiet);
        }
        else if (progress.kind === 'textEdit' || progress.kind === 'notebookEdit') {
            // merge edits for the same file no matter when they come in
            const notebookUri = CellUri.parse(progress.uri)?.notebook;
            const uri = notebookUri ?? progress.uri;
            const isExternalEdit = progress.isExternalEdit;
            if (progress.kind === 'textEdit' && !notebookUri) {
                // Text edits to a regular (non-notebook) file
                this._mergeOrPushTextEditGroup(uri, progress.edits, progress.done, isExternalEdit);
            }
            else if (progress.kind === 'textEdit') {
                // Text edits to a notebook cell - convert to ICellTextEditOperation
                const cellEdits = progress.edits.map(edit => ({ uri: progress.uri, edit }));
                this._mergeOrPushNotebookEditGroup(uri, cellEdits, progress.done, isExternalEdit);
            }
            else {
                // Notebook cell edits (ICellEditOperation)
                this._mergeOrPushNotebookEditGroup(uri, progress.edits, progress.done, isExternalEdit);
            }
            this._contentChanged(quiet);
        }
        else if (progress.kind === 'progressTask') {
            // Add a new resolving part
            const responsePosition = this._responseParts.push(progress) - 1;
            this._contentChanged(quiet);
            const disp = progress.onDidAddProgress(() => {
                this._contentChanged(false);
            });
            progress.task?.().then((content) => {
                // Stop listening for progress updates once the task settles
                disp.dispose();
                // Replace the resolving part's content with the resolved response
                if (typeof content === 'string') {
                    this._responseParts[responsePosition].content = new MarkdownString(content);
                }
                this._contentChanged(false);
            });
        }
        else if (progress.kind === 'toolInvocation') {
            autorunSelfDisposable(reader => {
                progress.state.read(reader); // update repr when state changes
                this._contentChanged(false);
                if (IChatToolInvocation.isComplete(progress, reader)) {
                    reader.dispose();
                }
            });
            this._responseParts.push(progress);
            this._contentChanged(quiet);
        }
        else if (progress.kind === 'externalToolInvocationUpdate') {
            this._handleExternalToolInvocationUpdate(progress);
            this._contentChanged(quiet);
        }
        else {
            this._responseParts.push(progress);
            this._contentChanged(quiet);
        }
    }
    addCitation(citation) {
        this._citations.push(citation);
        this._contentChanged();
    }
    _mergeOrPushTextEditGroup(uri, edits, done, isExternalEdit) {
        for (const candidate of this._responseParts) {
            if (candidate.kind === 'textEditGroup' && !candidate.done && isEqual(candidate.uri, uri)) {
                candidate.edits.push(edits);
                candidate.done = done;
                return;
            }
        }
        this._responseParts.push({ kind: 'textEditGroup', uri, edits: [edits], done, isExternalEdit });
    }
    _mergeOrPushNotebookEditGroup(uri, edits, done, isExternalEdit) {
        for (const candidate of this._responseParts) {
            if (candidate.kind === 'notebookEditGroup' && !candidate.done && isEqual(candidate.uri, uri)) {
                candidate.edits.push(edits);
                candidate.done = done;
                return;
            }
        }
        this._responseParts.push({ kind: 'notebookEditGroup', uri, edits: [edits], done, isExternalEdit });
    }
    _handleExternalToolInvocationUpdate(progress) {
        // Look for existing invocation in the response parts
        const existingInvocation = this._responseParts.findLast((part) => part.kind === 'toolInvocation' && part.toolCallId === progress.toolCallId);
        if (existingInvocation) {
            if (progress.toolSpecificData !== undefined) {
                existingInvocation.toolSpecificData = progress.toolSpecificData;
            }
            if (progress.isComplete) {
                existingInvocation.didExecuteTool({
                    content: [],
                    toolResultMessage: progress.pastTenseMessage,
                    toolResultError: progress.errorMessage,
                    toolResultDetails: progress.resultDetails
                });
            }
            return;
        }
        // Create a new external tool invocation
        const toolData = {
            id: progress.toolName,
            source: ToolDataSource.External,
            displayName: progress.toolName,
            modelDescription: progress.toolName,
        };
        const invocation = new ChatToolInvocation({
            invocationMessage: progress.invocationMessage,
            pastTenseMessage: progress.pastTenseMessage,
            toolSpecificData: progress.toolSpecificData,
        }, toolData, progress.toolCallId, progress.subagentInvocationId, undefined, // parameters
        {}, undefined // chatRequestId
        );
        if (progress.isComplete) {
            // Already completed on first push
            if (progress.toolSpecificData !== undefined) {
                invocation.toolSpecificData = progress.toolSpecificData;
            }
            invocation.didExecuteTool({
                content: [],
                toolResultMessage: progress.pastTenseMessage,
                toolResultError: progress.errorMessage,
                toolResultDetails: progress.resultDetails
            });
        }
        this._responseParts.push(invocation);
    }
    computeRepr() {
        let repr = super.computeRepr();
        if (this._citations.length) {
            repr += '\n\n' + getCodeCitationsMessage(this._citations);
        }
        return repr;
    }
    _contentChanged(quiet) {
        this._invalidateRepr();
        if (!quiet) {
            this._onDidChangeValue.fire();
        }
    }
}
export class ChatResponseModel extends Disposable {
    get shouldBeBlocked() {
        return this._shouldBeBlocked;
    }
    get request() {
        return this.session.getRequests().find(r => r.id === this.requestId);
    }
    get session() {
        return this._session;
    }
    get shouldBeRemovedOnSend() {
        return this._shouldBeRemovedOnSend;
    }
    get isComplete() {
        return this._modelState.get().value !== 0 /* ResponseModelState.Pending */ && this._modelState.get().value !== 4 /* ResponseModelState.NeedsInput */;
    }
    get timestamp() {
        return this._timestamp;
    }
    set shouldBeRemovedOnSend(disablement) {
        if (this._shouldBeRemovedOnSend === disablement) {
            return;
        }
        this._shouldBeRemovedOnSend = disablement;
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    get isCanceled() {
        return this._modelState.get().value === 2 /* ResponseModelState.Cancelled */;
    }
    get completedAt() {
        const state = this._modelState.get();
        if (state.value === 1 /* ResponseModelState.Complete */ || state.value === 2 /* ResponseModelState.Cancelled */ || state.value === 3 /* ResponseModelState.Failed */) {
            return state.completedAt;
        }
        return undefined;
    }
    get state() {
        const state = this._modelState.get().value;
        if (state === 1 /* ResponseModelState.Complete */ && !!this._result?.errorDetails && this.result?.errorDetails?.code !== 'canceled') {
            // This check covers sessions created in previous vscode versions which saved a failed response as 'Complete'
            return 3 /* ResponseModelState.Failed */;
        }
        return state;
    }
    get stateT() {
        return this._modelState.get();
    }
    get vote() {
        return this._vote;
    }
    get followups() {
        return this._followups;
    }
    get entireResponse() {
        return this._finalizedResponse || this._response;
    }
    get result() {
        return this._result;
    }
    get usage() {
        return this._usage;
    }
    get username() {
        return this.session.responderUsername;
    }
    get agent() {
        return this._agent;
    }
    get slashCommand() {
        return this._slashCommand;
    }
    get agentOrSlashCommandDetected() {
        return this._agentOrSlashCommandDetected ?? false;
    }
    get usedContext() {
        return this._usedContext;
    }
    get contentReferences() {
        return Array.from(this._contentReferences);
    }
    get codeCitations() {
        return this._codeCitations;
    }
    get progressMessages() {
        return this._progressMessages;
    }
    get isStale() {
        return this._isStale;
    }
    get response() {
        const undoStop = this._shouldBeRemovedOnSend?.afterUndoStop;
        if (!undoStop) {
            return this._finalizedResponse || this._response;
        }
        if (this._responseView?.undoStop !== undoStop) {
            this._responseView = new ResponseView(this._response, undoStop);
        }
        return this._responseView;
    }
    get codeBlockInfos() {
        return this._codeBlockInfos;
    }
    constructor(params) {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._modelState = observableValue(this, { value: 0 /* ResponseModelState.Pending */ });
        this._shouldBeBlocked = observableValue(this, false);
        this._contentReferences = [];
        this._codeCitations = [];
        this._progressMessages = [];
        this._isStale = false;
        this._session = params.session;
        this._agent = params.agent;
        this._slashCommand = params.slashCommand;
        this.requestId = params.requestId;
        this._timestamp = params.timestamp || Date.now();
        if (params.modelState) {
            this._modelState.set(params.modelState, undefined);
        }
        this._timeSpentWaitingAccumulator = params.timeSpentWaiting || 0;
        this._vote = params.vote;
        this._result = params.result;
        this._followups = params.followups ? [...params.followups] : undefined;
        this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
        this._shouldBeRemovedOnSend = params.shouldBeRemovedOnSend;
        this._shouldBeBlocked.set(params.shouldBeBlocked ?? false, undefined);
        // If we are creating a response with some existing content, consider it stale
        this._isStale = Array.isArray(params.responseContent) && (params.responseContent.length !== 0 || isMarkdownString(params.responseContent) && params.responseContent.value.length !== 0);
        this._response = this._register(new Response(params.responseContent));
        this._codeBlockInfos = params.codeBlockInfos ? [...params.codeBlockInfos] : undefined;
        const signal = observableSignalFromEvent(this, this.onDidChange);
        const _pendingInfo = signal.map((_value, r) => {
            signal.read(r);
            for (const part of this._response.value) {
                if (part.kind === 'toolInvocation') {
                    const state = part.state.read(r);
                    if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                        const title = state.confirmationMessages?.title;
                        return title ? (isMarkdownString(title) ? title.value : title) : undefined;
                    }
                    if (state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                        return localize('waitingForPostApproval', "Approve tool result?");
                    }
                }
                if (part.kind === 'confirmation' && !part.isUsed) {
                    return part.title;
                }
                if (part.kind === 'questionCarousel' && !part.isUsed) {
                    return localize('waitingAnswer', "Answer questions to continue...");
                }
                if (part.kind === 'elicitation2' && part.state.read(r) === "pending" /* ElicitationState.Pending */) {
                    const title = part.title;
                    return isMarkdownString(title) ? title.value : title;
                }
            }
            return undefined;
        });
        const _startedWaitingAt = _pendingInfo.map(p => !!p).map(p => p ? Date.now() : undefined);
        this.isPendingConfirmation = _startedWaitingAt.map((waiting, r) => waiting ? { startedWaitingAt: waiting, detail: _pendingInfo.read(r) } : undefined);
        this.isInProgress = signal.map((_value, r) => {
            signal.read(r);
            return !_pendingInfo.read(r)
                && !this.shouldBeRemovedOnSend
                && (this._modelState.read(r).value === 0 /* ResponseModelState.Pending */ || this._modelState.read(r).value === 4 /* ResponseModelState.NeedsInput */);
        });
        this._register(this._response.onDidChangeValue(() => this._onDidChange.fire(defaultChatResponseModelChangeReason)));
        this.id = params.restoredId ?? 'response_' + generateUuid();
        let lastStartedWaitingAt = undefined;
        this.confirmationAdjustedTimestamp = derived(reader => {
            const pending = this.isPendingConfirmation.read(reader);
            if (pending) {
                this._modelState.set({ value: 4 /* ResponseModelState.NeedsInput */ }, undefined);
                if (!lastStartedWaitingAt) {
                    lastStartedWaitingAt = pending.startedWaitingAt;
                }
            }
            else if (lastStartedWaitingAt) {
                // Restore state to Pending if it was set to NeedsInput by this observable
                if (this._modelState.read(reader).value === 4 /* ResponseModelState.NeedsInput */) {
                    this._modelState.set({ value: 0 /* ResponseModelState.Pending */ }, undefined);
                }
                this._timeSpentWaitingAccumulator += Date.now() - lastStartedWaitingAt;
                lastStartedWaitingAt = undefined;
            }
            return this._timestamp + this._timeSpentWaitingAccumulator;
        }).recomputeInitiallyAndOnChange(this._store);
    }
    initializeCodeBlockInfos(codeBlockInfo) {
        if (this._codeBlockInfos) {
            throw new BugIndicatingError('Code block infos have already been initialized');
        }
        this._codeBlockInfos = [...codeBlockInfo];
    }
    setBlockedState(isBlocked) {
        this._shouldBeBlocked.set(isBlocked, undefined);
    }
    /**
     * Apply a progress update to the actual response content.
     */
    updateContent(responsePart, quiet) {
        this._response.updateContent(responsePart, quiet);
    }
    /**
     * Adds an undo stop at the current position in the stream.
     */
    addUndoStop(undoStop) {
        this._onDidChange.fire({ reason: 'undoStop', id: undoStop.id });
        this._response.updateContent(undoStop, true);
    }
    /**
     * Apply one of the progress updates that are not part of the actual response content.
     */
    applyReference(progress) {
        if (progress.kind === 'usedContext') {
            this._usedContext = progress;
        }
        else if (progress.kind === 'reference') {
            this._contentReferences.push(progress);
            this._onDidChange.fire(defaultChatResponseModelChangeReason);
        }
    }
    applyCodeCitation(progress) {
        this._codeCitations.push(progress);
        this._response.addCitation(progress);
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    setAgent(agent, slashCommand) {
        this._agent = agent;
        this._slashCommand = slashCommand;
        this._agentOrSlashCommandDetected = !agent.isDefault || !!slashCommand;
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    setResult(result) {
        this._result = result;
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    setUsage(usage) {
        this._usage = usage;
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    complete() {
        // No-op if it's already complete
        if (this.isComplete) {
            return;
        }
        if (this._result?.errorDetails?.responseIsRedacted) {
            this._response.clear();
        }
        // Canceled sessions can be considered 'Complete'
        const state = !!this._result?.errorDetails && this._result.errorDetails.code !== 'canceled' ? 3 /* ResponseModelState.Failed */ : 1 /* ResponseModelState.Complete */;
        this._modelState.set({ value: state, completedAt: Date.now() }, undefined);
        this._onDidChange.fire({ reason: 'completedRequest' });
    }
    cancel() {
        this._modelState.set({ value: 2 /* ResponseModelState.Cancelled */, completedAt: Date.now() }, undefined);
        this._onDidChange.fire({ reason: 'completedRequest' });
    }
    setFollowups(followups) {
        this._followups = followups;
        this._onDidChange.fire(defaultChatResponseModelChangeReason); // Fire so that command followups get rendered on the row
    }
    setVote(vote) {
        this._vote = vote;
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    setEditApplied(edit, editCount) {
        if (!this.response.value.includes(edit)) {
            return false;
        }
        if (!edit.state) {
            return false;
        }
        edit.state.applied = editCount; // must not be edit.edits.length
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
        return true;
    }
    adoptTo(session) {
        this._session = session;
        this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
    finalizeUndoState() {
        this._finalizedResponse = this.response;
        this._responseView = undefined;
        this._shouldBeRemovedOnSend = undefined;
    }
    toJSON() {
        const modelState = this._modelState.get();
        const pendingConfirmation = this.isPendingConfirmation.get();
        return {
            responseId: this.id,
            result: this.result,
            responseMarkdownInfo: this.codeBlockInfos?.map(info => ({ suggestionId: info.suggestionId })),
            followups: this.followups,
            modelState: modelState.value === 0 /* ResponseModelState.Pending */ || modelState.value === 4 /* ResponseModelState.NeedsInput */ ? { value: 2 /* ResponseModelState.Cancelled */, completedAt: Date.now() } : modelState,
            vote: this.vote,
            slashCommand: this.slashCommand,
            usedContext: this.usedContext,
            contentReferences: this.contentReferences,
            codeCitations: this.codeCitations,
            timestamp: this._timestamp,
            timeSpentWaiting: (pendingConfirmation ? Date.now() - pendingConfirmation.startedWaitingAt : 0) + this._timeSpentWaitingAccumulator,
        };
    }
}
/**
 * Normalize chat data from storage to the current format.
 * TODO- ChatModel#_deserialize and reviveSerializedAgent also still do some normalization and maybe that should be done in here too.
 */
export function normalizeSerializableChatData(raw) {
    normalizeOldFields(raw);
    if (!('version' in raw)) {
        return {
            version: 3,
            ...raw,
            customTitle: undefined,
        };
    }
    if (raw.version === 2) {
        return {
            ...raw,
            version: 3,
            customTitle: raw.computedTitle
        };
    }
    return raw;
}
function normalizeOldFields(raw) {
    // Fill in fields that very old chat data may be missing
    if (!raw.sessionId) {
        raw.sessionId = generateUuid();
    }
    if (!raw.creationDate) {
        raw.creationDate = getLastYearDate();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, local/code-no-any-casts
    if (raw.initialLocation === 'editing-session') {
        raw.initialLocation = ChatAgentLocation.Chat;
    }
}
function getLastYearDate() {
    const lastYearDate = new Date();
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
    return lastYearDate.getTime();
}
export function isExportableSessionData(obj) {
    return !!obj &&
        Array.isArray(obj.requests) &&
        typeof obj.responderUsername === 'string';
}
export function isSerializableSessionData(obj) {
    const data = obj;
    return isExportableSessionData(obj) &&
        typeof data.creationDate === 'number' &&
        typeof data.sessionId === 'string' &&
        obj.requests.every((request) => !request.usedContext /* for backward compat allow missing usedContext */ || isIUsedContext(request.usedContext));
}
export var ChatRequestRemovalReason;
(function (ChatRequestRemovalReason) {
    /**
     * "Normal" remove
     */
    ChatRequestRemovalReason[ChatRequestRemovalReason["Removal"] = 0] = "Removal";
    /**
     * Removed because the request will be resent
     */
    ChatRequestRemovalReason[ChatRequestRemovalReason["Resend"] = 1] = "Resend";
    /**
     * Remove because the request is moving to another model
     */
    ChatRequestRemovalReason[ChatRequestRemovalReason["Adoption"] = 2] = "Adoption";
})(ChatRequestRemovalReason || (ChatRequestRemovalReason = {}));
/**
 * Internal implementation of IInputModel
 */
class InputModel {
    constructor(initialState) {
        this._state = observableValueOpts({ debugName: 'inputModelState', equalsFn: equals }, initialState);
        this.state = this._state;
    }
    setState(state) {
        const current = this._state.get();
        this._state.set({
            // If current is undefined, provide defaults for required fields
            attachments: [],
            mode: { id: 'agent', kind: ChatModeKind.Agent },
            selectedModel: undefined,
            inputText: '',
            selections: [],
            contrib: {},
            ...current,
            ...state
        }, undefined);
    }
    clearState() {
        this._state.set(undefined, undefined);
    }
    toJSON() {
        const value = this.state.get();
        if (!value) {
            return undefined;
        }
        // Filter out extension-contributed context items (kind: 'string' or implicit entries with StringChatContextValue)
        // These have handles that become invalid after window reload and cannot be properly restored.
        const persistableAttachments = value.attachments.filter(attachment => {
            if (isStringVariableEntry(attachment)) {
                return false;
            }
            if (isImplicitVariableEntry(attachment) && isStringImplicitContextValue(attachment.value)) {
                return false;
            }
            return true;
        });
        return {
            contrib: value.contrib,
            attachments: persistableAttachments.map(IChatRequestVariableEntry.toExport),
            mode: value.mode,
            selectedModel: value.selectedModel ? {
                identifier: value.selectedModel.identifier,
                metadata: value.selectedModel.metadata
            } : undefined,
            inputText: value.inputText,
            selections: value.selections,
            permissionLevel: value.permissionLevel,
        };
    }
}
let ChatModel = ChatModel_1 = class ChatModel extends Disposable {
    static getDefaultTitle(requests) {
        const firstRequestMessage = requests.at(0)?.message ?? '';
        const message = typeof firstRequestMessage === 'string' ?
            firstRequestMessage :
            firstRequestMessage.text;
        return message.split('\n')[0].substring(0, 200);
    }
    get repoData() {
        return this._repoData;
    }
    setRepoData(data) {
        this._repoData = data;
    }
    getPendingRequests() {
        return this._pendingRequests;
    }
    setPendingRequests(requests) {
        const existingMap = new Map(this._pendingRequests.map(p => [p.request.id, p]));
        const newPending = [];
        for (const { requestId, kind } of requests) {
            const existing = existingMap.get(requestId);
            if (existing) {
                // Update kind if changed, keep existing request and sendOptions
                newPending.push(existing.kind === kind ? existing : { request: existing.request, kind, sendOptions: existing.sendOptions });
            }
        }
        this._pendingRequests.length = 0;
        this._pendingRequests.push(...newPending);
        this._onDidChangePendingRequests.fire();
    }
    /**
     * @internal Used by ChatService to add a request to the queue.
     * Steering messages are placed before queued messages.
     */
    addPendingRequest(request, kind, sendOptions) {
        const pendingRequest = {
            request,
            kind,
            sendOptions,
        };
        if (kind === "steering" /* ChatRequestQueueKind.Steering */) {
            // Insert after the last steering message, or at the beginning if there is none
            let insertIndex = 0;
            for (let i = 0; i < this._pendingRequests.length; i++) {
                if (this._pendingRequests[i].kind === "steering" /* ChatRequestQueueKind.Steering */) {
                    insertIndex = i + 1;
                }
                else {
                    break;
                }
            }
            this._pendingRequests.splice(insertIndex, 0, pendingRequest);
        }
        else {
            // Queued messages always go at the end
            this._pendingRequests.push(pendingRequest);
        }
        this._onDidChangePendingRequests.fire();
        return pendingRequest;
    }
    /**
     * @internal Used by ChatService to remove a pending request
     */
    removePendingRequest(id) {
        const index = this._pendingRequests.findIndex(r => r.request.id === id);
        if (index !== -1) {
            this._pendingRequests.splice(index, 1);
            this._onDidChangePendingRequests.fire();
        }
    }
    /**
     * @internal Used by ChatService to dequeue the next pending request
     */
    dequeuePendingRequest() {
        const request = this._pendingRequests.shift();
        if (request) {
            this._onDidChangePendingRequests.fire();
        }
        return request;
    }
    /**
     * @internal Used by ChatService to dequeue all consecutive steering requests at the front of the queue.
     * Returns an empty array if the first pending request is not a steering request.
     */
    dequeueAllSteeringRequests() {
        const steeringRequests = [];
        while (this._pendingRequests.at(0)?.kind === "steering" /* ChatRequestQueueKind.Steering */) {
            steeringRequests.push(this._pendingRequests.shift());
        }
        if (steeringRequests.length > 0) {
            this._onDidChangePendingRequests.fire();
        }
        return steeringRequests;
    }
    /**
     * @internal Used by ChatService to clear all pending requests
     */
    clearPendingRequests() {
        if (this._pendingRequests.length > 0) {
            this._pendingRequests.length = 0;
            this._onDidChangePendingRequests.fire();
        }
    }
    /** @deprecated Use {@link sessionResource} instead */
    get sessionId() {
        return this._sessionId;
    }
    get sessionResource() {
        return this._sessionResource;
    }
    get hasRequests() {
        return this._requests.length > 0;
    }
    get lastRequest() {
        return this._requests.at(-1);
    }
    get timestamp() {
        return this._timestamp;
    }
    get timing() {
        const lastRequest = this._requests.at(-1);
        const lastResponse = lastRequest?.response;
        const lastRequestStarted = lastRequest?.timestamp;
        const lastRequestEnded = lastResponse?.completedAt ?? lastResponse?.timestamp;
        return {
            created: this._timestamp,
            lastRequestStarted,
            lastRequestEnded,
        };
    }
    get lastMessageDate() {
        return this._requests.at(-1)?.timestamp ?? this._timestamp;
    }
    get _defaultAgent() {
        return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Ask);
    }
    get responderUsername() {
        return this._defaultAgent?.fullName ??
            this._initialResponderUsername ?? '';
    }
    get isImported() {
        return this._isImported;
    }
    get customTitle() {
        return this._customTitle;
    }
    get title() {
        return this._customTitle || ChatModel_1.getDefaultTitle(this._requests);
    }
    get hasCustomTitle() {
        return this._customTitle !== undefined;
    }
    get editingSession() {
        return this._editingSession;
    }
    get initialLocation() {
        return this._initialLocation;
    }
    get canUseTools() {
        return this._canUseTools;
    }
    get willKeepAlive() {
        return !this._disableBackgroundKeepAlive;
    }
    constructor(dataRef, initialModelProps, logService, chatAgentService, chatEditingService, chatService) {
        super();
        this.logService = logService;
        this.chatAgentService = chatAgentService;
        this.chatEditingService = chatEditingService;
        this.chatService = chatService;
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._pendingRequests = [];
        this._onDidChangePendingRequests = this._register(new Emitter());
        this.onDidChangePendingRequests = this._onDidChangePendingRequests.event;
        this._isImported = false;
        this._canUseTools = true;
        this.currentEditedFileEvents = new ResourceMap();
        this._checkpoint = undefined;
        const initialData = dataRef?.value;
        const isValidExportedData = isExportableSessionData(initialData);
        const isValidFullData = isValidExportedData && isSerializableSessionData(initialData);
        if (initialData && !isValidExportedData) {
            this.logService.warn(`ChatModel#constructor: Loaded malformed session data: ${JSON.stringify(initialData)}`);
        }
        this._isImported = !!initialData && isValidExportedData && !isValidFullData;
        // Set the session resource and id
        if (initialModelProps.resource) {
            // prefer using the provided resource if provided
            this._sessionId = chatSessionResourceToId(initialModelProps.resource);
            this._sessionResource = initialModelProps.resource;
        }
        else if (isValidFullData) {
            // Otherwise use the serialized id. This is only valid for local chat sessions
            this._sessionId = initialData.sessionId;
            this._sessionResource = LocalChatSessionUri.forSession(initialData.sessionId);
        }
        else {
            // Finally fall back to generating a new id for a local session. This is used in the case where a
            // chat has been exported (but not serialized)
            this._sessionId = generateUuid();
            this._sessionResource = LocalChatSessionUri.forSession(this._sessionId);
        }
        this._disableBackgroundKeepAlive = initialModelProps.disableBackgroundKeepAlive ?? false;
        this._requests = initialData ? this._deserialize(initialData) : [];
        this._timestamp = (isValidFullData && initialData.creationDate) || Date.now();
        this._customTitle = isValidFullData ? initialData.customTitle : undefined;
        // Initialize input model from serialized data (undefined for new chats)
        const serializedInputState = initialModelProps.inputState || (isValidFullData && initialData.inputState ? initialData.inputState : undefined);
        this.inputModel = new InputModel(serializedInputState && {
            attachments: (serializedInputState.attachments ?? []).map(IChatRequestVariableEntry.fromExport),
            mode: serializedInputState.mode,
            selectedModel: serializedInputState.selectedModel && {
                identifier: serializedInputState.selectedModel.identifier,
                metadata: serializedInputState.selectedModel.metadata
            },
            contrib: serializedInputState.contrib,
            inputText: serializedInputState.inputText,
            selections: serializedInputState.selections,
            permissionLevel: serializedInputState.permissionLevel,
        });
        this.dataSerializer = dataRef?.serializer;
        this._initialResponderUsername = initialData?.responderUsername;
        this._repoData = isValidFullData && initialData.repoData ? initialData.repoData : undefined;
        // Hydrate pending requests from serialized data
        if (isValidFullData && initialData.pendingRequests) {
            this._pendingRequests = this._deserializePendingRequests(initialData.pendingRequests);
        }
        this._initialLocation = initialData?.initialLocation ?? initialModelProps.initialLocation;
        this._canUseTools = initialModelProps.canUseTools;
        this.lastRequestObs = observableFromEvent(this, this.onDidChange, () => this._requests.at(-1));
        this._register(autorun(reader => {
            const request = this.lastRequestObs.read(reader);
            if (!request?.response) {
                return;
            }
            reader.store.add(request.response.onDidChange(async (ev) => {
                if (!this._editingSession || ev.reason !== 'completedRequest') {
                    return;
                }
                this._onDidChange.fire({ kind: 'completedRequest', request });
            }));
        }));
        this.requestInProgress = this.lastRequestObs.map((request, r) => {
            return request?.response?.isInProgress.read(r) ?? false;
        });
        this.requestNeedsInput = this.lastRequestObs.map((request, r) => {
            const pendingInfo = request?.response?.isPendingConfirmation.read(r);
            if (!pendingInfo) {
                return undefined;
            }
            return {
                title: this.title,
                detail: pendingInfo.detail,
            };
        });
        // Retain a reference to itself when a request is in progress, so the ChatModel stays alive in the background
        // only while running a request. TODO also keep it alive for 5min or so so we don't have to dispose/restore too often?
        if (this.initialLocation === ChatAgentLocation.Chat && !initialModelProps.disableBackgroundKeepAlive) {
            const selfRef = this._register(new MutableDisposable());
            this._register(autorun(r => {
                const inProgress = this.requestInProgress.read(r);
                const needsInput = this.requestNeedsInput.read(r);
                const shouldStayAlive = inProgress || !!needsInput;
                if (shouldStayAlive && !selfRef.value) {
                    selfRef.value = chatService.acquireExistingSession(this._sessionResource, 'ChatModel#requestInProgressKeepAlive');
                }
                else if (!shouldStayAlive && selfRef.value) {
                    selfRef.clear();
                }
            }));
        }
    }
    startEditingSession(isGlobalEditingSession, transferFromSession) {
        const session = this._editingSession ??= this._register(transferFromSession
            ? this.chatEditingService.transferEditingSession(this, transferFromSession)
            : isGlobalEditingSession
                ? this.chatEditingService.startOrContinueGlobalEditingSession(this)
                : this.chatEditingService.createEditingSession(this));
        if (!this._disableBackgroundKeepAlive) {
            // todo@connor4312: hold onto a reference so background sessions don't
            // trigger early disposal. This will be cleaned up with the globalization of edits.
            const selfRef = this._register(new MutableDisposable());
            this._register(autorun(r => {
                const hasModified = session.entries.read(r).some(e => e.state.read(r) === 0 /* ModifiedFileEntryState.Modified */);
                if (hasModified && !selfRef.value) {
                    selfRef.value = this.chatService.acquireExistingSession(this._sessionResource, 'ChatModel#modifiedEditsKeepAlive');
                }
                else if (!hasModified && selfRef.value) {
                    selfRef.clear();
                }
            }));
        }
        this._register(autorun(reader => {
            this._setDisabledRequests(session.requestDisablement.read(reader));
        }));
    }
    notifyEditingAction(action) {
        const state = action.outcome === 'accepted' ? ChatRequestEditedFileEventKind.Keep :
            action.outcome === 'rejected' ? ChatRequestEditedFileEventKind.Undo :
                action.outcome === 'userModified' ? ChatRequestEditedFileEventKind.UserModification : null;
        if (state === null) {
            return;
        }
        if (!this.currentEditedFileEvents.has(action.uri) || this.currentEditedFileEvents.get(action.uri)?.eventKind === ChatRequestEditedFileEventKind.Keep) {
            this.currentEditedFileEvents.set(action.uri, { eventKind: state, uri: action.uri });
        }
    }
    _deserialize(obj) {
        const requests = hasKey(obj, { serializer: true }) ? obj.value.requests : obj.requests;
        if (!Array.isArray(requests)) {
            this.logService.error(`Ignoring malformed session data: ${JSON.stringify(obj)}`);
            return [];
        }
        try {
            return requests.map(r => this._deserializeRequest(r));
        }
        catch (error) {
            this.logService.error('Failed to parse chat data', error);
            return [];
        }
    }
    _deserializeRequest(raw) {
        const parsedRequest = typeof raw.message === 'string'
            ? this.getParsedRequestFromString(raw.message)
            : reviveParsedChatRequest(raw.message);
        // Old messages don't have variableData, or have it in the wrong (non-array) shape
        const variableData = this.reviveVariableData(raw.variableData);
        const request = new ChatRequestModel({
            session: this,
            message: parsedRequest,
            variableData,
            timestamp: raw.timestamp ?? -1,
            restoredId: raw.requestId,
            confirmation: raw.confirmation,
            editedFileEvents: raw.editedFileEvents,
            modelId: raw.modelId,
            modeInfo: raw.modeInfo,
            isSystemInitiated: raw.isSystemInitiated,
            systemInitiatedLabel: raw.systemInitiatedLabel,
        });
        request.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, local/code-no-any-casts
        if (raw.response || raw.result || raw.responseErrorDetails) {
            const agent = (raw.agent && 'metadata' in raw.agent) ? // Check for the new format, ignore entries in the old format
                reviveSerializedAgent(raw.agent) : undefined;
            // Port entries from old format
            const result = 'responseErrorDetails' in raw ?
                // eslint-disable-next-line local/code-no-dangerous-type-assertions
                { errorDetails: raw.responseErrorDetails } : raw.result;
            let modelState = raw.modelState || { value: raw.isCanceled ? 2 /* ResponseModelState.Cancelled */ : 1 /* ResponseModelState.Complete */, completedAt: Date.now() };
            if (modelState.value === 0 /* ResponseModelState.Pending */ || modelState.value === 4 /* ResponseModelState.NeedsInput */) {
                modelState = { value: 2 /* ResponseModelState.Cancelled */, completedAt: Date.now() };
            }
            // Mark question carousels as used after
            // deserialization. After a reload, the extension is no longer listening for
            // their responses, so they cannot be interacted with.
            if (raw.response) {
                for (const part of raw.response) {
                    if (hasKey(part, { kind: true }) && (part.kind === 'questionCarousel')) {
                        part.isUsed = true;
                    }
                }
            }
            request.response = new ChatResponseModel({
                responseContent: raw.response ?? [new MarkdownString(raw.response)],
                session: this,
                agent,
                slashCommand: raw.slashCommand,
                requestId: request.id,
                modelState,
                vote: raw.vote,
                timestamp: raw.timestamp,
                result,
                followups: raw.followups,
                restoredId: raw.responseId,
                timeSpentWaiting: raw.timeSpentWaiting,
                shouldBeBlocked: request.shouldBeBlocked.get(),
                codeBlockInfos: raw.responseMarkdownInfo?.map(info => ({ suggestionId: info.suggestionId })),
            });
            request.response.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
            if (raw.usedContext) { // @ulugbekna: if this's a new vscode sessions, doc versions are incorrect anyway?
                request.response.applyReference(revive(raw.usedContext));
            }
            raw.contentReferences?.forEach(r => request.response.applyReference(revive(r)));
            raw.codeCitations?.forEach(c => request.response.applyCodeCitation(revive(c)));
        }
        return request;
    }
    reviveVariableData(raw) {
        const variableData = raw && Array.isArray(raw.variables)
            ? raw :
            { variables: [] };
        variableData.variables = variableData.variables.map(IChatRequestVariableEntry.fromExport);
        return variableData;
    }
    getParsedRequestFromString(message) {
        // TODO These offsets won't be used, but chat replies need to go through the parser as well
        const parts = [new ChatRequestTextPart(new OffsetRange(0, message.length), { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, message)];
        return {
            text: message,
            parts
        };
    }
    /**
     * Hydrates pending requests from serialized data.
     * For each serialized pending request, finds the matching request model and adds it to the pending queue.
     */
    _deserializePendingRequests(pendingRequests) {
        try {
            return pendingRequests.map(pending => ({
                id: pending.id,
                request: this._deserializeRequest(pending.request),
                kind: pending.kind,
                sendOptions: {
                    ...pending.sendOptions,
                    userSelectedTools: pending.sendOptions.userSelectedTools
                        ? constObservable(pending.sendOptions.userSelectedTools)
                        : undefined,
                }
            }));
        }
        catch (e) {
            this.logService.error('Failed to parse pending chat requests', e);
            return [];
        }
    }
    getRequests() {
        return this._requests;
    }
    resetCheckpoint() {
        for (const request of this._requests) {
            request.setShouldBeBlocked(false);
            if (request.response) {
                request.response.setBlockedState(false);
            }
        }
    }
    setCheckpoint(requestId) {
        let checkpoint;
        let checkpointIndex = -1;
        if (requestId !== undefined) {
            this._requests.forEach((request, index) => {
                if (request.id === requestId) {
                    checkpointIndex = index;
                    checkpoint = request;
                    request.setShouldBeBlocked(true);
                }
            });
            if (!checkpoint) {
                return; // Invalid request ID
            }
        }
        for (let i = this._requests.length - 1; i >= 0; i -= 1) {
            const request = this._requests[i];
            if (this._checkpoint && !checkpoint) {
                request.setShouldBeBlocked(false);
                if (request.response) {
                    request.response.setBlockedState(false);
                }
            }
            else if (checkpoint && i >= checkpointIndex) {
                request.setShouldBeBlocked(true);
                if (request.response) {
                    request.response.setBlockedState(true);
                }
            }
            else if (checkpoint && i < checkpointIndex) {
                request.setShouldBeBlocked(false);
                if (request.response) {
                    request.response.setBlockedState(false);
                }
            }
        }
        this._checkpoint = checkpoint;
    }
    get checkpoint() {
        return this._checkpoint;
    }
    _setDisabledRequests(requestIds) {
        this._requests.forEach((request) => {
            const shouldBeRemovedOnSend = requestIds.find(r => r.requestId === request.id);
            request.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
            if (request.response) {
                request.response.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
            }
        });
        this._onDidChange.fire({ kind: 'setHidden' });
    }
    addRequest(message, variableData, attempt, modeInfo, chatAgent, slashCommand, confirmation, locationData, attachments, isCompleteAddedRequest, modelId, userSelectedTools, id, isSystemInitiated, systemInitiatedLabel) {
        const editedFileEvents = [...this.currentEditedFileEvents.values()];
        this.currentEditedFileEvents.clear();
        const request = new ChatRequestModel({
            restoredId: id,
            session: this,
            message,
            variableData,
            timestamp: Date.now(),
            attempt,
            modeInfo,
            confirmation,
            locationData,
            attachedContext: attachments,
            isCompleteAddedRequest,
            modelId,
            editedFileEvents: editedFileEvents.length ? editedFileEvents : undefined,
            userSelectedTools,
            isSystemInitiated,
            systemInitiatedLabel,
        });
        request.response = new ChatResponseModel({
            responseContent: [],
            session: this,
            agent: chatAgent,
            slashCommand,
            requestId: request.id,
            isCompleteAddedRequest,
            codeBlockInfos: undefined,
        });
        this._requests.push(request);
        markChat(this.sessionResource, ChatPerfMark.RequestUiUpdated);
        this._onDidChange.fire({ kind: 'addRequest', request });
        return request;
    }
    setCustomTitle(title) {
        this._customTitle = title;
        this._onDidChange.fire({ kind: 'setCustomTitle', title });
    }
    updateRequest(request, variableData) {
        request.variableData = variableData;
        this._onDidChange.fire({ kind: 'changedRequest', request });
    }
    adoptRequest(request) {
        // this doesn't use `removeRequest` because it must not dispose the request object
        const oldOwner = request.session;
        const index = oldOwner._requests.findIndex((candidate) => candidate.id === request.id);
        if (index === -1) {
            return;
        }
        oldOwner._requests.splice(index, 1);
        request.adoptTo(this);
        request.response?.adoptTo(this);
        this._requests.push(request);
        oldOwner._onDidChange.fire({ kind: 'removeRequest', requestId: request.id, responseId: request.response?.id, reason: 2 /* ChatRequestRemovalReason.Adoption */ });
        this._onDidChange.fire({ kind: 'addRequest', request });
    }
    acceptResponseProgress(request, progress, quiet) {
        if (!request.response) {
            request.response = new ChatResponseModel({
                responseContent: [],
                session: this,
                requestId: request.id,
                codeBlockInfos: undefined,
            });
        }
        if (request.response.isComplete) {
            throw new Error('acceptResponseProgress: Adding progress to a completed response');
        }
        if (progress.kind === 'usedContext' || progress.kind === 'reference') {
            request.response.applyReference(progress);
        }
        else if (progress.kind === 'codeCitation') {
            request.response.applyCodeCitation(progress);
        }
        else if (progress.kind === 'move') {
            this._onDidChange.fire({ kind: 'move', target: progress.uri, range: progress.range });
        }
        else if (progress.kind === 'codeblockUri' && progress.isEdit) {
            request.response.addUndoStop({ id: progress.undoStopId ?? generateUuid(), kind: 'undoStop' });
            request.response.updateContent(progress, quiet);
        }
        else if (progress.kind === 'progressTaskResult') {
            // Should have been handled upstream, not sent to model
            this.logService.error(`Couldn't handle progress: ${JSON.stringify(progress)}`);
        }
        else {
            request.response.updateContent(progress, quiet);
        }
    }
    removeRequest(id, reason = 0 /* ChatRequestRemovalReason.Removal */) {
        const index = this._requests.findIndex(request => request.id === id);
        const request = this._requests[index];
        if (index !== -1) {
            this._onDidChange.fire({ kind: 'removeRequest', requestId: request.id, responseId: request.response?.id, reason });
            this._requests.splice(index, 1);
            request.response?.dispose();
        }
    }
    cancelRequest(request) {
        if (request.response) {
            request.response.cancel();
        }
    }
    setResponse(request, result) {
        if (!request.response) {
            request.response = new ChatResponseModel({
                responseContent: [],
                session: this,
                requestId: request.id,
                codeBlockInfos: undefined,
            });
        }
        request.response.setResult(result);
    }
    setFollowups(request, followups) {
        if (!request.response) {
            // Maybe something went wrong?
            return;
        }
        request.response.setFollowups(followups);
    }
    setResponseModel(request, response) {
        request.response = response;
        this._onDidChange.fire({ kind: 'addResponse', response });
    }
    toExport() {
        return {
            responderUsername: this.responderUsername,
            initialLocation: this.initialLocation,
            requests: this._requests.map((r) => {
                const message = {
                    ...r.message,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    parts: r.message.parts.map((p) => p && 'toJSON' in p ? p.toJSON() : p)
                };
                const agent = r.response?.agent;
                const agentJson = agent && 'toJSON' in agent ? agent.toJSON() :
                    agent ? { ...agent } : undefined;
                return {
                    requestId: r.id,
                    message,
                    variableData: IChatRequestVariableData.toExport(r.variableData),
                    response: r.response ?
                        r.response.entireResponse.value.map(item => {
                            // Keeping the shape of the persisted data the same for back compat
                            if (item.kind === 'treeData') {
                                return item.treeData;
                            }
                            else if (item.kind === 'markdownContent') {
                                return item.content;
                            }
                            else {
                                // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                                return item; // TODO
                            }
                        })
                        : undefined,
                    shouldBeRemovedOnSend: r.shouldBeRemovedOnSend,
                    agent: agentJson,
                    timestamp: r.timestamp,
                    confirmation: r.confirmation,
                    editedFileEvents: r.editedFileEvents,
                    modelId: r.modelId,
                    modeInfo: r.modeInfo,
                    isSystemInitiated: r.isSystemInitiated || undefined,
                    systemInitiatedLabel: r.systemInitiatedLabel,
                    ...r.response?.toJSON(),
                };
            }),
        };
    }
    toJSON() {
        return {
            version: 3,
            ...this.toExport(),
            sessionId: this.sessionId,
            creationDate: this._timestamp,
            customTitle: this._customTitle,
            inputState: this.inputModel.toJSON(),
        };
    }
    dispose() {
        this._requests.forEach(r => r.response?.dispose());
        this._onDidDispose.fire();
        super.dispose();
    }
};
ChatModel = ChatModel_1 = __decorate([
    __param(2, ILogService),
    __param(3, IChatAgentService),
    __param(4, IChatEditingService),
    __param(5, IChatService)
], ChatModel);
export { ChatModel };
export function updateRanges(variableData, diff) {
    return {
        variables: variableData.variables.map(v => ({
            ...v,
            range: v.range && {
                start: v.range.start - diff,
                endExclusive: v.range.endExclusive - diff
            }
        }))
    };
}
export function canMergeMarkdownStrings(md1, md2) {
    if (md1.baseUri && md2.baseUri) {
        const baseUriEquals = md1.baseUri.scheme === md2.baseUri.scheme
            && md1.baseUri.authority === md2.baseUri.authority
            && md1.baseUri.path === md2.baseUri.path
            && md1.baseUri.query === md2.baseUri.query
            && md1.baseUri.fragment === md2.baseUri.fragment;
        if (!baseUriEquals) {
            return false;
        }
    }
    else if (md1.baseUri || md2.baseUri) {
        return false;
    }
    return equals(md1.isTrusted, md2.isTrusted) &&
        md1.supportHtml === md2.supportHtml &&
        md1.supportThemeIcons === md2.supportThemeIcons;
}
export function appendMarkdownString(md1, md2) {
    const appendedValue = typeof md2 === 'string' ? md2 : md2.value;
    return {
        value: md1.value + appendedValue,
        isTrusted: md1.isTrusted,
        supportThemeIcons: md1.supportThemeIcons,
        supportHtml: md1.supportHtml,
        baseUri: md1.baseUri
    };
}
export function getCodeCitationsMessage(citations) {
    if (citations.length === 0) {
        return '';
    }
    const licenseTypes = citations.reduce((set, c) => set.add(c.license), new Set());
    const label = licenseTypes.size === 1 ?
        localize('codeCitation', "Similar code found with 1 license type", licenseTypes.size) :
        localize('codeCitations', "Similar code found with {0} license types", licenseTypes.size);
    return label;
}
/**
 * Converts IChatSendRequestOptions to a serializable format by extracting only
 * serializable fields and converting observables to static values.
 */
export function serializeSendOptions(options) {
    return {
        modeInfo: options.modeInfo,
        userSelectedModelId: options.userSelectedModelId,
        userSelectedTools: options.userSelectedTools?.get(),
        location: options.location,
        locationData: options.locationData,
        attempt: options.attempt,
        noCommandDetection: options.noCommandDetection,
        agentId: options.agentId,
        agentIdSilent: options.agentIdSilent,
        slashCommand: options.slashCommand,
        confirmation: options.confirmation,
    };
}
export var ChatRequestEditedFileEventKind;
(function (ChatRequestEditedFileEventKind) {
    ChatRequestEditedFileEventKind[ChatRequestEditedFileEventKind["Keep"] = 1] = "Keep";
    ChatRequestEditedFileEventKind[ChatRequestEditedFileEventKind["Undo"] = 2] = "Undo";
    ChatRequestEditedFileEventKind[ChatRequestEditedFileEventKind["UserModification"] = 3] = "UserModification";
})(ChatRequestEditedFileEventKind || (ChatRequestEditedFileEventKind = {}));
/** URI for a resource embedded in a chat request/response */
export var ChatResponseResource;
(function (ChatResponseResource) {
    ChatResponseResource.scheme = 'vscode-chat-response-resource';
    function createUri(sessionResource, toolCallId, index, basename) {
        return URI.from({
            scheme: ChatResponseResource.scheme,
            authority: encodeHex(VSBuffer.fromString(sessionResource.toString())),
            path: `/tool/${toolCallId}/${index}` + (basename ? `/${basename}` : ''),
        });
    }
    ChatResponseResource.createUri = createUri;
    function parseUri(uri) {
        if (uri.scheme !== ChatResponseResource.scheme) {
            return undefined;
        }
        const parts = uri.path.split('/');
        if (parts.length < 4) {
            return undefined;
        }
        const [, kind, toolCallId, index] = parts;
        if (kind !== 'tool') {
            return undefined;
        }
        let sessionResource;
        try {
            sessionResource = URI.parse(decodeHex(uri.authority).toString());
        }
        catch (e) {
            if (e instanceof SyntaxError) { // pre-1.108 local session ID
                sessionResource = LocalChatSessionUri.forSession(uri.authority);
            }
            else {
                throw e;
            }
        }
        return {
            sessionResource,
            toolCallId: toolCallId,
            index: Number(index),
        };
    }
    ChatResponseResource.parseUri = parseUri;
})(ChatResponseResource || (ChatResponseResource = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxVQUFVLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0QsT0FBTyxFQUFlLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZOLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFD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