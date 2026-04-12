/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { softAssertNever } from '../../../../../base/common/assert.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { isEqual as _urisEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatRequestVariableEntry } from '../attachments/chatVariableEntries.js';
import { serializeSendOptions } from './chatModel.js';
import * as Adapt from './objectMutationLog.js';
/**
 * ChatModel has lots of properties and lots of ways those properties can mutate.
 * The naive way to store the ChatModel is serializing it to JSON and calling it
 * a day. However, chats can get very, very long, and thus doing so is slow.
 *
 * In this file, we define a `storageSchema` that adapters from the `IChatModel`
 * into the serializable format. This schema tells us what properties in the chat
 * model correspond to the serialized properties, *and how they change*. For
 * example, `Adapt.constant(...)` defines a property that will never be checked
 * for changes after it's written, and `Adapt.primitive(...)` defines a property
 * that will be checked for changes using strict equality each time we store it.
 *
 * We can then use this to generate a log of mutations that we can append to
 * cheaply without rewriting and reserializing the entire request each time.
 */
const toJson = (obj) => {
    const cast = obj;
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return (cast && typeof cast.toJSON === 'function' ? cast.toJSON() : obj);
};
const responsePartSchema = Adapt.v((obj) => obj.kind === 'markdownContent' ? obj.content : toJson(obj), (a, b) => {
    if (isMarkdownString(a) && isMarkdownString(b)) {
        return a.value === b.value;
    }
    if (hasKey(a, { kind: true }) && hasKey(b, { kind: true })) {
        if (a.kind !== b.kind) {
            return false;
        }
        switch (a.kind) {
            case 'markdownContent':
                return a.content === b.content;
            // Dynamic types that can change after initial push need deep equality
            // Note: these are the *serialized* kind names (e.g. toolInvocationSerialized not toolInvocation)
            case 'toolInvocationSerialized':
            case 'elicitationSerialized':
            case 'progressTaskSerialized':
            case 'textEditGroup':
            case 'multiDiffData':
            case 'mcpServersStarting':
            case 'thinking':
                return objectsEqual(a, b);
            // Static types that won't change after being pushed can use strict equality.
            case 'clearToPreviousToolInvocation':
            case 'codeblockUri':
            case 'command':
            case 'confirmation':
            case 'extensions':
            case 'hook':
            case 'inlineReference':
            case 'markdownVuln':
            case 'notebookEditGroup':
            case 'progressMessage':
            case 'pullRequest':
            case 'questionCarousel':
            case 'undoStop':
            case 'warning':
            case 'treeData':
            case 'workspaceEdit':
            case 'disabledClaudeHooks':
                return a.kind === b.kind;
            default: {
                // Hello developer! You are probably here because you added a new chat response type.
                // This logic controls when we'll update chat parts stored on disk as part of the session.
                // If it's a 'static' type that is not expected to change, add it to the 'return true'
                // block above. However it's a type that is going to change, add it to the 'objectsEqual'
                // block or make something more tailored.
                softAssertNever(a);
                return objectsEqual(a, b);
            }
        }
    }
    return false;
});
const urisEqual = (a, b) => {
    return _urisEqual(URI.from(a), URI.from(b));
};
const messageSchema = Adapt.object({
    text: Adapt.v(m => m.text),
    parts: Adapt.v(m => m.parts, (a, b) => a.length === b.length && a.every((part, i) => part.text === b[i].text)),
});
const agentEditedFileEventSchema = Adapt.object({
    uri: Adapt.v(e => e.uri, urisEqual),
    eventKind: Adapt.v(e => e.eventKind),
});
const chatVariableSchema = Adapt.object({
    variables: Adapt.t(v => v.variables.map(IChatRequestVariableEntry.toExport), Adapt.array(Adapt.value((a, b) => a.name === b.name))),
});
const requestSchema = Adapt.object({
    // request parts
    requestId: Adapt.t(m => m.id, Adapt.key()),
    timestamp: Adapt.v(m => m.timestamp),
    confirmation: Adapt.v(m => m.confirmation),
    message: Adapt.t(m => m.message, messageSchema),
    shouldBeRemovedOnSend: Adapt.v(m => m.shouldBeRemovedOnSend, objectsEqual),
    agent: Adapt.v(m => m.response?.agent, (a, b) => a?.id === b?.id),
    modelId: Adapt.v(m => m.modelId),
    editedFileEvents: Adapt.t(m => m.editedFileEvents, Adapt.array(agentEditedFileEventSchema)),
    variableData: Adapt.t(m => m.variableData, chatVariableSchema),
    isHidden: Adapt.v(() => undefined), // deprecated, always undefined for new data
    isCanceled: Adapt.v(() => undefined), // deprecated, modelState is used instead
    // response parts (from ISerializableChatResponseData via response.toJSON())
    response: Adapt.t(m => m.response?.entireResponse.value, Adapt.array(responsePartSchema)),
    responseId: Adapt.v(m => m.response?.id),
    result: Adapt.v(m => m.response?.result, objectsEqual),
    responseMarkdownInfo: Adapt.v(m => m.response?.codeBlockInfos?.map(info => ({ suggestionId: info.suggestionId })), objectsEqual),
    followups: Adapt.v(m => m.response?.followups, objectsEqual),
    modelState: Adapt.v(m => m.response?.stateT, objectsEqual),
    vote: Adapt.v(m => m.response?.vote),
    slashCommand: Adapt.t(m => m.response?.slashCommand, Adapt.value((a, b) => a?.name === b?.name)),
    usedContext: Adapt.v(m => m.response?.usedContext, objectsEqual),
    contentReferences: Adapt.v(m => m.response?.contentReferences, objectsEqual),
    codeCitations: Adapt.v(m => m.response?.codeCitations, objectsEqual),
    timeSpentWaiting: Adapt.v(m => m.response?.timestamp), // based on response timestamp
    modeInfo: Adapt.v(m => m.modeInfo, objectsEqual),
    isSystemInitiated: Adapt.v(m => m.isSystemInitiated),
    systemInitiatedLabel: Adapt.v(m => m.systemInitiatedLabel),
}, {
    sealed: (o) => o.modelState?.value === 2 /* ResponseModelState.Cancelled */ || o.modelState?.value === 3 /* ResponseModelState.Failed */ || o.modelState?.value === 1 /* ResponseModelState.Complete */,
});
const inputStateSchema = Adapt.object({
    attachments: Adapt.v(i => i.attachments.map(IChatRequestVariableEntry.toExport), objectsEqual),
    mode: Adapt.v(i => i.mode, (a, b) => a.id === b.id),
    selectedModel: Adapt.v(i => i.selectedModel, (a, b) => a?.identifier === b?.identifier),
    inputText: Adapt.v(i => i.inputText),
    selections: Adapt.v(i => i.selections, objectsEqual),
    permissionLevel: Adapt.v(i => i.permissionLevel),
    contrib: Adapt.v(i => i.contrib, objectsEqual),
});
const pendingRequestSchema = Adapt.object({
    id: Adapt.t(p => p.request.id, Adapt.key()),
    request: Adapt.t(p => p.request, requestSchema),
    kind: Adapt.v(p => p.kind),
    sendOptions: Adapt.v(p => serializeSendOptions(p.sendOptions), objectsEqual),
});
export const storageSchema = Adapt.object({
    version: Adapt.v(() => 3),
    creationDate: Adapt.v(m => m.timestamp),
    customTitle: Adapt.v(m => m.hasCustomTitle ? m.title : undefined),
    initialLocation: Adapt.v(m => m.initialLocation),
    inputState: Adapt.t(m => m.inputModel.toJSON(), inputStateSchema),
    responderUsername: Adapt.v(m => m.responderUsername),
    sessionId: Adapt.v(m => m.sessionId),
    requests: Adapt.t(m => m.getRequests(), Adapt.array(requestSchema)),
    hasPendingEdits: Adapt.v(m => m.editingSession?.entries.get().some(e => e.state.get() === 0 /* ModifiedFileEntryState.Modified */)),
    repoData: Adapt.v(m => m.repoData, objectsEqual),
    pendingRequests: Adapt.t(m => m.getPendingRequests(), Adapt.array(pendingRequestSchema)),
});
export class ChatSessionOperationLog extends Adapt.ObjectMutationLog {
    constructor() {
        super(storageSchema, 1024);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25PcGVyYXRpb25Mb2cuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0U2Vzc2lvbk9wZXJhdGlvbkxvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDN0UsT0FBTyxFQUFFLE1BQU0sSUFBSSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxJQUFJLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBSWxGLE9BQU8sRUFBcVQsb0JBQW9CLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUN6VyxPQUFPLEtBQUssS0FBSyxNQUFNLHdCQUF3QixDQUFDO0FBRWhEOzs7Ozs7Ozs7Ozs7OztHQWNHO0FBRUgsTUFBTSxNQUFNLEdBQUcsQ0FBSSxHQUFNLEVBQTRDLEVBQUU7SUFDdEUsTUFBTSxJQUFJLEdBQUcsR0FBMkIsQ0FBQztJQUN6Qyx1RkFBdUY7SUFDdkYsT0FBTyxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBUSxDQUFDO0FBQ2pGLENBQUMsQ0FBQztBQUVGLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FDakMsQ0FBQyxHQUFHLEVBQThCLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQy9GLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQ1IsSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ2hELE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQzVCLENBQUM7SUFFRCxJQUFJLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUM1RCxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLEtBQUssaUJBQWlCO2dCQUNyQixPQUFPLENBQUMsQ0FBQyxPQUFPLEtBQU0sQ0FBMEIsQ0FBQyxPQUFPLENBQUM7WUFFMUQsc0VBQXNFO1lBQ3RFLGlHQUFpRztZQUNqRyxLQUFLLDBCQUEwQixDQUFDO1lBQ2hDLEtBQUssdUJBQXVCLENBQUM7WUFDN0IsS0FBSyx3QkFBd0IsQ0FBQztZQUM5QixLQUFLLGVBQWUsQ0FBQztZQUNyQixLQUFLLGVBQWUsQ0FBQztZQUNyQixLQUFLLG9CQUFvQixDQUFDO1lBQzFCLEtBQUssVUFBVTtnQkFDZCxPQUFPLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFM0IsNkVBQTZFO1lBQzdFLEtBQUssK0JBQStCLENBQUM7WUFDckMsS0FBSyxjQUFjLENBQUM7WUFDcEIsS0FBSyxTQUFTLENBQUM7WUFDZixLQUFLLGNBQWMsQ0FBQztZQUNwQixLQUFLLFlBQVksQ0FBQztZQUNsQixLQUFLLE1BQU0sQ0FBQztZQUNaLEtBQUssaUJBQWlCLENBQUM7WUFDdkIsS0FBSyxjQUFjLENBQUM7WUFDcEIsS0FBSyxtQkFBbUIsQ0FBQztZQUN6QixLQUFLLGlCQUFpQixDQUFDO1lBQ3ZCLEtBQUssYUFBYSxDQUFDO1lBQ25CLEtBQUssa0JBQWtCLENBQUM7WUFDeEIsS0FBSyxVQUFVLENBQUM7WUFDaEIsS0FBSyxTQUFTLENBQUM7WUFDZixLQUFLLFVBQVUsQ0FBQztZQUNoQixLQUFLLGVBQWUsQ0FBQztZQUNyQixLQUFLLHFCQUFxQjtnQkFDekIsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFFMUIsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDVCxxRkFBcUY7Z0JBQ3JGLDBGQUEwRjtnQkFDMUYsc0ZBQXNGO2dCQUN0Rix5RkFBeUY7Z0JBQ3pGLHlDQUF5QztnQkFDekMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVuQixPQUFPLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDM0IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDLENBQ0QsQ0FBQztBQUVGLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBZ0IsRUFBRSxDQUFnQixFQUFXLEVBQUU7SUFDakUsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0MsQ0FBQyxDQUFDO0FBRUYsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBeUM7SUFDMUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQzFCLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7Q0FDOUcsQ0FBQyxDQUFDO0FBRUgsTUFBTSwwQkFBMEIsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUF1RDtJQUNyRyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDO0lBQ25DLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztDQUNwQyxDQUFDLENBQUM7QUFFSCxNQUFNLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxNQUFNLENBQXFEO0lBQzNGLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztDQUNuSSxDQUFDLENBQUM7QUFFSCxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFrRDtJQUNuRixnQkFBZ0I7SUFDaEIsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDcEMsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDO0lBQzFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUM7SUFDL0MscUJBQXFCLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsRUFBRSxZQUFZLENBQUM7SUFDMUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUNqRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDaEMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDM0YsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLGtCQUFrQixDQUFDO0lBQzlELFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLDRDQUE0QztJQUNoRixVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRSx5Q0FBeUM7SUFFL0UsNEVBQTRFO0lBQzVFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN6RixVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO0lBQ3hDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsWUFBWSxDQUFDO0lBQ3RELG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQzVCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxjQUFjLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxFQUNuRixZQUFZLENBQ1o7SUFDRCxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLFlBQVksQ0FBQztJQUM1RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLFlBQVksQ0FBQztJQUMxRCxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDO0lBQ3BDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hHLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxXQUFXLEVBQUUsWUFBWSxDQUFDO0lBQ2hFLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLGlCQUFpQixFQUFFLFlBQVksQ0FBQztJQUM1RSxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQztJQUNwRSxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsRUFBRSw4QkFBOEI7SUFDckYsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQztJQUNoRCxpQkFBaUIsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDO0lBQ3BELG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUM7Q0FDMUQsRUFBRTtJQUNGLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLHlDQUFpQyxJQUFJLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxzQ0FBOEIsSUFBSSxDQUFDLENBQUMsVUFBVSxFQUFFLEtBQUssd0NBQWdDO0NBQy9LLENBQUMsQ0FBQztBQUVILE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBcUU7SUFDekcsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxZQUFZLENBQUM7SUFDOUYsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ25ELGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxVQUFVLEtBQUssQ0FBQyxFQUFFLFVBQVUsQ0FBQztJQUN2RixTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDcEMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQztJQUNwRCxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUM7SUFDaEQsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxNQUFNLENBQXVEO0lBQy9GLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzNDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUM7SUFDL0MsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQzFCLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLFlBQVksQ0FBQztDQUM1RSxDQUFDLENBQUM7QUFFSCxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBb0M7SUFDNUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pCLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUN2QyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNqRSxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUM7SUFDaEQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLGdCQUFnQixDQUFDO0lBQ2pFLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUM7SUFDcEQsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ3BDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDbkUsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSw0Q0FBb0MsQ0FBQyxDQUFDO0lBQzNILFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUM7SUFDaEQsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Q0FDeEYsQ0FBQyxDQUFDO0FBRUgsTUFBTSxPQUFPLHVCQUF3QixTQUFRLEtBQUssQ0FBQyxpQkFBb0Q7SUFDdEc7UUFDQyxLQUFLLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVCLENBQUM7Q0FDRCJ9