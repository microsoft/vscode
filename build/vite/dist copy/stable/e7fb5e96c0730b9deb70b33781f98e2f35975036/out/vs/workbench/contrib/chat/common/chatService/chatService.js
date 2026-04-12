/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export var ChatErrorLevel;
(function (ChatErrorLevel) {
    ChatErrorLevel[ChatErrorLevel["Info"] = 0] = "Info";
    ChatErrorLevel[ChatErrorLevel["Warning"] = 1] = "Warning";
    ChatErrorLevel[ChatErrorLevel["Error"] = 2] = "Error";
})(ChatErrorLevel || (ChatErrorLevel = {}));
export function isIDocumentContext(obj) {
    return (!!obj &&
        typeof obj === 'object' &&
        'uri' in obj && obj.uri instanceof URI &&
        'version' in obj && typeof obj.version === 'number' &&
        'ranges' in obj && Array.isArray(obj.ranges) && obj.ranges.every(Range.isIRange));
}
export function isIUsedContext(obj) {
    return (!!obj &&
        typeof obj === 'object' &&
        'documents' in obj &&
        Array.isArray(obj.documents) &&
        obj.documents.every(isIDocumentContext));
}
export function isChatContentVariableReference(obj) {
    return !!obj &&
        typeof obj === 'object' &&
        typeof obj.variableName === 'string';
}
export var ChatResponseReferencePartStatusKind;
(function (ChatResponseReferencePartStatusKind) {
    ChatResponseReferencePartStatusKind[ChatResponseReferencePartStatusKind["Complete"] = 1] = "Complete";
    ChatResponseReferencePartStatusKind[ChatResponseReferencePartStatusKind["Partial"] = 2] = "Partial";
    ChatResponseReferencePartStatusKind[ChatResponseReferencePartStatusKind["Omitted"] = 3] = "Omitted";
})(ChatResponseReferencePartStatusKind || (ChatResponseReferencePartStatusKind = {}));
export var ChatResponseClearToPreviousToolInvocationReason;
(function (ChatResponseClearToPreviousToolInvocationReason) {
    ChatResponseClearToPreviousToolInvocationReason[ChatResponseClearToPreviousToolInvocationReason["NoReason"] = 0] = "NoReason";
    ChatResponseClearToPreviousToolInvocationReason[ChatResponseClearToPreviousToolInvocationReason["FilteredContentRetry"] = 1] = "FilteredContentRetry";
    ChatResponseClearToPreviousToolInvocationReason[ChatResponseClearToPreviousToolInvocationReason["CopyrightContentRetry"] = 2] = "CopyrightContentRetry";
})(ChatResponseClearToPreviousToolInvocationReason || (ChatResponseClearToPreviousToolInvocationReason = {}));
export class ChatMultiDiffData {
    constructor(opts) {
        this.kind = 'multiDiffData';
        this.readOnly = opts.readOnly;
        this.collapsed = opts.collapsed;
        this.multiDiffData = opts.multiDiffData;
    }
    toJSON() {
        return {
            kind: this.kind,
            multiDiffData: hasKey(this.multiDiffData, { title: true }) ? this.multiDiffData : this.multiDiffData.get(),
            collapsed: this.collapsed,
            readOnly: this.readOnly,
        };
    }
}
export var ElicitationState;
(function (ElicitationState) {
    ElicitationState["Pending"] = "pending";
    ElicitationState["Accepted"] = "accepted";
    ElicitationState["Rejected"] = "rejected";
})(ElicitationState || (ElicitationState = {}));
export function isLegacyChatTerminalToolInvocationData(data) {
    return !!data && typeof data === 'object' && 'command' in data && 'language' in data;
}
export var ToolConfirmKind;
(function (ToolConfirmKind) {
    ToolConfirmKind[ToolConfirmKind["Denied"] = 0] = "Denied";
    ToolConfirmKind[ToolConfirmKind["ConfirmationNotNeeded"] = 1] = "ConfirmationNotNeeded";
    ToolConfirmKind[ToolConfirmKind["Setting"] = 2] = "Setting";
    ToolConfirmKind[ToolConfirmKind["LmServicePerTool"] = 3] = "LmServicePerTool";
    ToolConfirmKind[ToolConfirmKind["UserAction"] = 4] = "UserAction";
    ToolConfirmKind[ToolConfirmKind["Skipped"] = 5] = "Skipped";
})(ToolConfirmKind || (ToolConfirmKind = {}));
export var IChatToolInvocation;
(function (IChatToolInvocation) {
    let StateKind;
    (function (StateKind) {
        /** Tool call is streaming partial input from the LM */
        StateKind[StateKind["Streaming"] = 0] = "Streaming";
        StateKind[StateKind["WaitingForConfirmation"] = 1] = "WaitingForConfirmation";
        StateKind[StateKind["Executing"] = 2] = "Executing";
        StateKind[StateKind["WaitingForPostApproval"] = 3] = "WaitingForPostApproval";
        StateKind[StateKind["Completed"] = 4] = "Completed";
        StateKind[StateKind["Cancelled"] = 5] = "Cancelled";
    })(StateKind = IChatToolInvocation.StateKind || (IChatToolInvocation.StateKind = {}));
    function executionConfirmedOrDenied(invocation, reader) {
        if (invocation.kind === 'toolInvocationSerialized') {
            if (invocation.isConfirmed === undefined || typeof invocation.isConfirmed === 'boolean') {
                return { type: invocation.isConfirmed ? 4 /* ToolConfirmKind.UserAction */ : 0 /* ToolConfirmKind.Denied */ };
            }
            return invocation.isConfirmed;
        }
        const state = invocation.state.read(reader);
        if (state.type === 0 /* StateKind.Streaming */ || state.type === 1 /* StateKind.WaitingForConfirmation */) {
            return undefined; // don't know yet
        }
        if (state.type === 5 /* StateKind.Cancelled */) {
            return { type: state.reason };
        }
        return state.confirmed;
    }
    IChatToolInvocation.executionConfirmedOrDenied = executionConfirmedOrDenied;
    function awaitConfirmation(invocation, token) {
        const reason = executionConfirmedOrDenied(invocation);
        if (reason) {
            return Promise.resolve(reason);
        }
        const store = new DisposableStore();
        return new Promise(resolve => {
            if (token) {
                store.add(token.onCancellationRequested(() => {
                    resolve({ type: 0 /* ToolConfirmKind.Denied */ });
                }));
            }
            store.add(autorun(reader => {
                const reason = executionConfirmedOrDenied(invocation, reader);
                if (reason) {
                    store.dispose();
                    resolve(reason);
                }
            }));
        }).finally(() => {
            store.dispose();
        });
    }
    IChatToolInvocation.awaitConfirmation = awaitConfirmation;
    function postApprovalConfirmedOrDenied(invocation, reader) {
        const state = invocation.state.read(reader);
        if (state.type === 4 /* StateKind.Completed */) {
            return state.postConfirmed || { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ };
        }
        if (state.type === 5 /* StateKind.Cancelled */) {
            return { type: state.reason };
        }
        return undefined;
    }
    function confirmWith(invocation, reason) {
        const state = invocation?.state.get();
        if (state?.type === 1 /* StateKind.WaitingForConfirmation */ || state?.type === 3 /* StateKind.WaitingForPostApproval */) {
            state.confirm(reason);
            return true;
        }
        return false;
    }
    IChatToolInvocation.confirmWith = confirmWith;
    function awaitPostConfirmation(invocation, token) {
        const reason = postApprovalConfirmedOrDenied(invocation);
        if (reason) {
            return Promise.resolve(reason);
        }
        const store = new DisposableStore();
        return new Promise(resolve => {
            if (token) {
                store.add(token.onCancellationRequested(() => {
                    resolve({ type: 0 /* ToolConfirmKind.Denied */ });
                }));
            }
            store.add(autorun(reader => {
                const reason = postApprovalConfirmedOrDenied(invocation, reader);
                if (reason) {
                    store.dispose();
                    resolve(reason);
                }
            }));
        }).finally(() => {
            store.dispose();
        });
    }
    IChatToolInvocation.awaitPostConfirmation = awaitPostConfirmation;
    function resultDetails(invocation, reader) {
        if (invocation.kind === 'toolInvocationSerialized') {
            return invocation.resultDetails;
        }
        const state = invocation.state.read(reader);
        if (state.type === 4 /* StateKind.Completed */ || state.type === 3 /* StateKind.WaitingForPostApproval */) {
            return state.resultDetails;
        }
        return undefined;
    }
    IChatToolInvocation.resultDetails = resultDetails;
    function isComplete(invocation, reader) {
        if (invocation.kind === 'toolInvocationSerialized') {
            return true; // always cancelled or complete
        }
        const state = invocation.state.read(reader);
        return state.type === 4 /* StateKind.Completed */ || state.type === 5 /* StateKind.Cancelled */;
    }
    IChatToolInvocation.isComplete = isComplete;
    function isEffectivelyHidden(invocation, reader) {
        if (invocation.presentation === 'hidden') {
            return true;
        }
        if (invocation.presentation === 'hiddenAfterComplete' && isComplete(invocation, reader)) {
            return true;
        }
        return false;
    }
    IChatToolInvocation.isEffectivelyHidden = isEffectivelyHidden;
    function isStreaming(invocation, reader) {
        if (invocation.kind === 'toolInvocationSerialized') {
            return false;
        }
        const state = invocation.state.read(reader);
        return state.type === 0 /* StateKind.Streaming */;
    }
    IChatToolInvocation.isStreaming = isStreaming;
    /**
     * Get parameters from invocation. Returns undefined during streaming state.
     */
    function getParameters(invocation, reader) {
        if (invocation.kind === 'toolInvocationSerialized') {
            return undefined; // serialized invocations don't store parameters
        }
        const state = invocation.state.read(reader);
        if (state.type === 0 /* StateKind.Streaming */) {
            return undefined;
        }
        return state.parameters;
    }
    IChatToolInvocation.getParameters = getParameters;
    /**
     * Get confirmation messages from invocation. Returns undefined during streaming state.
     */
    function getConfirmationMessages(invocation, reader) {
        if (invocation.kind === 'toolInvocationSerialized') {
            return undefined; // serialized invocations don't store confirmation messages
        }
        const state = invocation.state.read(reader);
        if (state.type === 0 /* StateKind.Streaming */) {
            return undefined;
        }
        return state.confirmationMessages;
    }
    IChatToolInvocation.getConfirmationMessages = getConfirmationMessages;
})(IChatToolInvocation || (IChatToolInvocation = {}));
export class ChatMcpServersStarting {
    get isEmpty() {
        const s = this.state.get();
        return !s.working && s.serversRequiringInteraction.length === 0;
    }
    constructor(state) {
        this.state = state;
        this.kind = 'mcpServersStarting';
        this.didStartServerIds = [];
    }
    wait() {
        return new Promise(resolve => {
            autorunSelfDisposable(reader => {
                const s = this.state.read(reader);
                if (!s.working) {
                    reader.dispose();
                    resolve(s);
                }
            });
        });
    }
    toJSON() {
        return { kind: 'mcpServersStarting', didStartServerIds: this.didStartServerIds };
    }
}
export function isChatFollowup(obj) {
    return (!!obj &&
        obj.kind === 'reply' &&
        typeof obj.message === 'string' &&
        typeof obj.agentId === 'string');
}
export var ChatAgentVoteDirection;
(function (ChatAgentVoteDirection) {
    ChatAgentVoteDirection[ChatAgentVoteDirection["Down"] = 0] = "Down";
    ChatAgentVoteDirection[ChatAgentVoteDirection["Up"] = 1] = "Up";
})(ChatAgentVoteDirection || (ChatAgentVoteDirection = {}));
export var ChatCopyKind;
(function (ChatCopyKind) {
    // Keyboard shortcut or context menu
    ChatCopyKind[ChatCopyKind["Action"] = 1] = "Action";
    ChatCopyKind[ChatCopyKind["Toolbar"] = 2] = "Toolbar";
})(ChatCopyKind || (ChatCopyKind = {}));
export function convertLegacyChatSessionTiming(timing) {
    if (hasKey(timing, { created: true })) {
        return timing;
    }
    return {
        created: timing.startTime,
        lastRequestStarted: timing.startTime,
        lastRequestEnded: timing.endTime,
    };
}
export var ResponseModelState;
(function (ResponseModelState) {
    ResponseModelState[ResponseModelState["Pending"] = 0] = "Pending";
    ResponseModelState[ResponseModelState["Complete"] = 1] = "Complete";
    ResponseModelState[ResponseModelState["Cancelled"] = 2] = "Cancelled";
    ResponseModelState[ResponseModelState["Failed"] = 3] = "Failed";
    ResponseModelState[ResponseModelState["NeedsInput"] = 4] = "NeedsInput";
})(ResponseModelState || (ResponseModelState = {}));
export var ChatSendResult;
(function (ChatSendResult) {
    function isSent(result) {
        return result.kind === 'sent';
    }
    ChatSendResult.isSent = isSent;
    function isRejected(result) {
        return result.kind === 'rejected';
    }
    ChatSendResult.isRejected = isRejected;
    function isQueued(result) {
        return result.kind === 'queued';
    }
    ChatSendResult.isQueued = isQueued;
    /** Assertion function for tests - asserts that the result is a sent result */
    function assertSent(result) {
        if (result.kind !== 'sent') {
            throw new Error(`Expected ChatSendResult to be 'sent', but was '${result.kind}'`);
        }
    }
    ChatSendResult.assertSent = assertSent;
})(ChatSendResult || (ChatSendResult = {}));
/**
 * The kind of queue request.
 */
export var ChatRequestQueueKind;
(function (ChatRequestQueueKind) {
    /** Request is queued to be sent after current request completes */
    ChatRequestQueueKind["Queued"] = "queued";
    /** Request is queued and signals the active request to yield */
    ChatRequestQueueKind["Steering"] = "steering";
})(ChatRequestQueueKind || (ChatRequestQueueKind = {}));
export const IChatService = createDecorator('IChatService');
export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
export const ChatStopCancellationNoopEventName = 'chat.stopCancellationNoop';
export const ChatPendingRequestChangeEventName = 'chat.pendingRequestChange';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU9oRyxPQUFPLEVBQUUsZUFBZSxFQUFjLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBd0IsTUFBTSwwQ0FBMEMsQ0FBQztBQUVoSCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFJM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBc0JoRyxNQUFNLENBQU4sSUFBWSxjQUlYO0FBSkQsV0FBWSxjQUFjO0lBQ3pCLG1EQUFRLENBQUE7SUFDUix5REFBVyxDQUFBO0lBQ1gscURBQVMsQ0FBQTtBQUNWLENBQUMsRUFKVyxjQUFjLEtBQWQsY0FBYyxRQUl6QjtBQWtDRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsR0FBWTtJQUM5QyxPQUFPLENBQ04sQ0FBQyxDQUFDLEdBQUc7UUFDTCxPQUFPLEdBQUcsS0FBSyxRQUFRO1FBQ3ZCLEtBQUssSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsWUFBWSxHQUFHO1FBQ3RDLFNBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxHQUFHLENBQUMsT0FBTyxLQUFLLFFBQVE7UUFDbkQsUUFBUSxJQUFJLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQ2hGLENBQUM7QUFDSCxDQUFDO0FBT0QsTUFBTSxVQUFVLGNBQWMsQ0FBQyxHQUFZO0lBQzFDLE9BQU8sQ0FDTixDQUFDLENBQUMsR0FBRztRQUNMLE9BQU8sR0FBRyxLQUFLLFFBQVE7UUFDdkIsV0FBVyxJQUFJLEdBQUc7UUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDO1FBQzVCLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQ3ZDLENBQUM7QUFDSCxDQUFDO0FBT0QsTUFBTSxVQUFVLDhCQUE4QixDQUFDLEdBQVk7SUFDMUQsT0FBTyxDQUFDLENBQUMsR0FBRztRQUNYLE9BQU8sR0FBRyxLQUFLLFFBQVE7UUFDdkIsT0FBUSxHQUFxQyxDQUFDLFlBQVksS0FBSyxRQUFRLENBQUM7QUFDMUUsQ0FBQztBQUVELE1BQU0sQ0FBTixJQUFZLG1DQUlYO0FBSkQsV0FBWSxtQ0FBbUM7SUFDOUMscUdBQVksQ0FBQTtJQUNaLG1HQUFXLENBQUE7SUFDWCxtR0FBVyxDQUFBO0FBQ1osQ0FBQyxFQUpXLG1DQUFtQyxLQUFuQyxtQ0FBbUMsUUFJOUM7QUFFRCxNQUFNLENBQU4sSUFBWSwrQ0FJWDtBQUpELFdBQVksK0NBQStDO0lBQzFELDZIQUFZLENBQUE7SUFDWixxSkFBd0IsQ0FBQTtJQUN4Qix1SkFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBSlcsK0NBQStDLEtBQS9DLCtDQUErQyxRQUkxRDtBQWdGRCxNQUFNLE9BQU8saUJBQWlCO0lBTTdCLFlBQVksSUFJWDtRQVRlLFNBQUksR0FBRyxlQUFlLENBQUM7UUFVdEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUNoQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDekMsQ0FBQztJQUVELE1BQU07UUFDTCxPQUFPO1lBQ04sSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsYUFBYSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO1lBQzFHLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztZQUN6QixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7U0FDdkIsQ0FBQztJQUNILENBQUM7Q0FDRDtBQXNNRCxNQUFNLENBQU4sSUFBa0IsZ0JBSWpCO0FBSkQsV0FBa0IsZ0JBQWdCO0lBQ2pDLHVDQUFtQixDQUFBO0lBQ25CLHlDQUFxQixDQUFBO0lBQ3JCLHlDQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFKaUIsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUlqQztBQWlKRCxNQUFNLFVBQVUsc0NBQXNDLENBQUMsSUFBYTtJQUNuRSxPQUFPLENBQUMsQ0FBQyxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLFNBQVMsSUFBSSxJQUFJLElBQUksVUFBVSxJQUFJLElBQUksQ0FBQztBQUN0RixDQUFDO0FBaUJELE1BQU0sQ0FBTixJQUFrQixlQU9qQjtBQVBELFdBQWtCLGVBQWU7SUFDaEMseURBQU0sQ0FBQTtJQUNOLHVGQUFxQixDQUFBO0lBQ3JCLDJEQUFPLENBQUE7SUFDUCw2RUFBZ0IsQ0FBQTtJQUNoQixpRUFBVSxDQUFBO0lBQ1YsMkRBQU8sQ0FBQTtBQUNSLENBQUMsRUFQaUIsZUFBZSxLQUFmLGVBQWUsUUFPaEM7QUE4QkQsTUFBTSxLQUFXLG1CQUFtQixDQThPbkM7QUE5T0QsV0FBaUIsbUJBQW1CO0lBQ25DLElBQWtCLFNBUWpCO0lBUkQsV0FBa0IsU0FBUztRQUMxQix1REFBdUQ7UUFDdkQsbURBQVMsQ0FBQTtRQUNULDZFQUFzQixDQUFBO1FBQ3RCLG1EQUFTLENBQUE7UUFDVCw2RUFBc0IsQ0FBQTtRQUN0QixtREFBUyxDQUFBO1FBQ1QsbURBQVMsQ0FBQTtJQUNWLENBQUMsRUFSaUIsU0FBUyxHQUFULDZCQUFTLEtBQVQsNkJBQVMsUUFRMUI7SUFpRUQsU0FBZ0IsMEJBQTBCLENBQUMsVUFBK0QsRUFBRSxNQUFnQjtRQUMzSCxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLEVBQUUsQ0FBQztZQUNwRCxJQUFJLFVBQVUsQ0FBQyxXQUFXLEtBQUssU0FBUyxJQUFJLE9BQU8sVUFBVSxDQUFDLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDekYsT0FBTyxFQUFFLElBQUksRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsb0NBQTRCLENBQUMsK0JBQXVCLEVBQUUsQ0FBQztZQUMvRixDQUFDO1lBQ0QsT0FBTyxVQUFVLENBQUMsV0FBVyxDQUFDO1FBQy9CLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLEtBQUssQ0FBQyxJQUFJLGdDQUF3QixJQUFJLEtBQUssQ0FBQyxJQUFJLDZDQUFxQyxFQUFFLENBQUM7WUFDM0YsT0FBTyxTQUFTLENBQUMsQ0FBQyxpQkFBaUI7UUFDcEMsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLElBQUksZ0NBQXdCLEVBQUUsQ0FBQztZQUN4QyxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUMvQixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ3hCLENBQUM7SUFqQmUsOENBQTBCLDZCQWlCekMsQ0FBQTtJQUVELFNBQWdCLGlCQUFpQixDQUFDLFVBQStCLEVBQUUsS0FBeUI7UUFDM0YsTUFBTSxNQUFNLEdBQUcsMEJBQTBCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEQsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxPQUFPLElBQUksT0FBTyxDQUFrQixPQUFPLENBQUMsRUFBRTtZQUM3QyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtvQkFDNUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxnQ0FBd0IsRUFBRSxDQUFDLENBQUM7Z0JBQzNDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQzFCLE1BQU0sTUFBTSxHQUFHLDBCQUEwQixDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2hCLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDakIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO1lBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQXhCZSxxQ0FBaUIsb0JBd0JoQyxDQUFBO0lBRUQsU0FBUyw2QkFBNkIsQ0FBQyxVQUErQixFQUFFLE1BQWdCO1FBQ3ZGLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLElBQUksS0FBSyxDQUFDLElBQUksZ0NBQXdCLEVBQUUsQ0FBQztZQUN4QyxPQUFPLEtBQUssQ0FBQyxhQUFhLElBQUksRUFBRSxJQUFJLCtDQUF1QyxFQUFFLENBQUM7UUFDL0UsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLElBQUksZ0NBQXdCLEVBQUUsQ0FBQztZQUN4QyxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUMvQixDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELFNBQWdCLFdBQVcsQ0FBQyxVQUEyQyxFQUFFLE1BQXVCO1FBQy9GLE1BQU0sS0FBSyxHQUFHLFVBQVUsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdEMsSUFBSSxLQUFLLEVBQUUsSUFBSSw2Q0FBcUMsSUFBSSxLQUFLLEVBQUUsSUFBSSw2Q0FBcUMsRUFBRSxDQUFDO1lBQzFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBUGUsK0JBQVcsY0FPMUIsQ0FBQTtJQUVELFNBQWdCLHFCQUFxQixDQUFDLFVBQStCLEVBQUUsS0FBeUI7UUFDL0YsTUFBTSxNQUFNLEdBQUcsNkJBQTZCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDekQsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxPQUFPLElBQUksT0FBTyxDQUFrQixPQUFPLENBQUMsRUFBRTtZQUM3QyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtvQkFDNUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxnQ0FBd0IsRUFBRSxDQUFDLENBQUM7Z0JBQzNDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQzFCLE1BQU0sTUFBTSxHQUFHLDZCQUE2QixDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDakUsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2hCLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDakIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO1lBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQXhCZSx5Q0FBcUIsd0JBd0JwQyxDQUFBO0lBRUQsU0FBZ0IsYUFBYSxDQUFDLFVBQStELEVBQUUsTUFBZ0I7UUFDOUcsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFDcEQsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDO1FBQ2pDLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLEtBQUssQ0FBQyxJQUFJLGdDQUF3QixJQUFJLEtBQUssQ0FBQyxJQUFJLDZDQUFxQyxFQUFFLENBQUM7WUFDM0YsT0FBTyxLQUFLLENBQUMsYUFBYSxDQUFDO1FBQzVCLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBWGUsaUNBQWEsZ0JBVzVCLENBQUE7SUFFRCxTQUFnQixVQUFVLENBQUMsVUFBK0QsRUFBRSxNQUFnQjtRQUMzRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLEVBQUUsQ0FBQztZQUNwRCxPQUFPLElBQUksQ0FBQyxDQUFDLCtCQUErQjtRQUM3QyxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsT0FBTyxLQUFLLENBQUMsSUFBSSxnQ0FBd0IsSUFBSSxLQUFLLENBQUMsSUFBSSxnQ0FBd0IsQ0FBQztJQUNqRixDQUFDO0lBUGUsOEJBQVUsYUFPekIsQ0FBQTtJQUVELFNBQWdCLG1CQUFtQixDQUFDLFVBQStELEVBQUUsTUFBZ0I7UUFDcEgsSUFBSSxVQUFVLENBQUMsWUFBWSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksVUFBVSxDQUFDLFlBQVksS0FBSyxxQkFBcUIsSUFBSSxVQUFVLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDekYsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBUmUsdUNBQW1CLHNCQVFsQyxDQUFBO0lBRUQsU0FBZ0IsV0FBVyxDQUFDLFVBQStELEVBQUUsTUFBZ0I7UUFDNUcsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFDcEQsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsT0FBTyxLQUFLLENBQUMsSUFBSSxnQ0FBd0IsQ0FBQztJQUMzQyxDQUFDO0lBUGUsK0JBQVcsY0FPMUIsQ0FBQTtJQUVEOztPQUVHO0lBQ0gsU0FBZ0IsYUFBYSxDQUFDLFVBQStELEVBQUUsTUFBZ0I7UUFDOUcsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFDcEQsT0FBTyxTQUFTLENBQUMsQ0FBQyxnREFBZ0Q7UUFDbkUsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLElBQUksS0FBSyxDQUFDLElBQUksZ0NBQXdCLEVBQUUsQ0FBQztZQUN4QyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUMsVUFBVSxDQUFDO0lBQ3pCLENBQUM7SUFYZSxpQ0FBYSxnQkFXNUIsQ0FBQTtJQUVEOztPQUVHO0lBQ0gsU0FBZ0IsdUJBQXVCLENBQUMsVUFBK0QsRUFBRSxNQUFnQjtRQUN4SCxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLEVBQUUsQ0FBQztZQUNwRCxPQUFPLFNBQVMsQ0FBQyxDQUFDLDJEQUEyRDtRQUM5RSxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsSUFBSSxLQUFLLENBQUMsSUFBSSxnQ0FBd0IsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQztJQUNuQyxDQUFDO0lBWGUsMkNBQXVCLDBCQVd0QyxDQUFBO0FBQ0YsQ0FBQyxFQTlPZ0IsbUJBQW1CLEtBQW5CLG1CQUFtQixRQThPbkM7QUFpSUQsTUFBTSxPQUFPLHNCQUFzQjtJQUtsQyxJQUFXLE9BQU87UUFDakIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzQixPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUMsMkJBQTJCLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsWUFBNEIsS0FBb0M7UUFBcEMsVUFBSyxHQUFMLEtBQUssQ0FBK0I7UUFUaEQsU0FBSSxHQUFHLG9CQUFvQixDQUFDO1FBRXJDLHNCQUFpQixHQUFjLEVBQUUsQ0FBQztJQU8yQixDQUFDO0lBRXJFLElBQUk7UUFDSCxPQUFPLElBQUksT0FBTyxDQUFtQixPQUFPLENBQUMsRUFBRTtZQUM5QyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDOUIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDakIsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNaLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELE1BQU07UUFDTCxPQUFPLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQ2xGLENBQUM7Q0FDRDtBQWlERCxNQUFNLFVBQVUsY0FBYyxDQUFDLEdBQVk7SUFDMUMsT0FBTyxDQUNOLENBQUMsQ0FBQyxHQUFHO1FBQ0osR0FBcUIsQ0FBQyxJQUFJLEtBQUssT0FBTztRQUN2QyxPQUFRLEdBQXFCLENBQUMsT0FBTyxLQUFLLFFBQVE7UUFDbEQsT0FBUSxHQUFxQixDQUFDLE9BQU8sS0FBSyxRQUFRLENBQ2xELENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxDQUFOLElBQVksc0JBR1g7QUFIRCxXQUFZLHNCQUFzQjtJQUNqQyxtRUFBUSxDQUFBO0lBQ1IsK0RBQU0sQ0FBQTtBQUNQLENBQUMsRUFIVyxzQkFBc0IsS0FBdEIsc0JBQXNCLFFBR2pDO0FBT0QsTUFBTSxDQUFOLElBQVksWUFJWDtBQUpELFdBQVksWUFBWTtJQUN2QixvQ0FBb0M7SUFDcEMsbURBQVUsQ0FBQTtJQUNWLHFEQUFXLENBQUE7QUFDWixDQUFDLEVBSlcsWUFBWSxLQUFaLFlBQVksUUFJdkI7QUFvSkQsTUFBTSxVQUFVLDhCQUE4QixDQUFDLE1BQXFEO0lBQ25HLElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDdkMsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBQ0QsT0FBTztRQUNOLE9BQU8sRUFBRSxNQUFNLENBQUMsU0FBUztRQUN6QixrQkFBa0IsRUFBRSxNQUFNLENBQUMsU0FBUztRQUNwQyxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsT0FBTztLQUNoQyxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sQ0FBTixJQUFrQixrQkFNakI7QUFORCxXQUFrQixrQkFBa0I7SUFDbkMsaUVBQU8sQ0FBQTtJQUNQLG1FQUFRLENBQUE7SUFDUixxRUFBUyxDQUFBO0lBQ1QsK0RBQU0sQ0FBQTtJQUNOLHVFQUFVLENBQUE7QUFDWCxDQUFDLEVBTmlCLGtCQUFrQixLQUFsQixrQkFBa0IsUUFNbkM7QUF3REQsTUFBTSxLQUFXLGNBQWMsQ0FtQjlCO0FBbkJELFdBQWlCLGNBQWM7SUFDOUIsU0FBZ0IsTUFBTSxDQUFDLE1BQXNCO1FBQzVDLE9BQU8sTUFBTSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUM7SUFDL0IsQ0FBQztJQUZlLHFCQUFNLFNBRXJCLENBQUE7SUFFRCxTQUFnQixVQUFVLENBQUMsTUFBc0I7UUFDaEQsT0FBTyxNQUFNLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQztJQUNuQyxDQUFDO0lBRmUseUJBQVUsYUFFekIsQ0FBQTtJQUVELFNBQWdCLFFBQVEsQ0FBQyxNQUFzQjtRQUM5QyxPQUFPLE1BQU0sQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDO0lBQ2pDLENBQUM7SUFGZSx1QkFBUSxXQUV2QixDQUFBO0lBRUQsOEVBQThFO0lBQzlFLFNBQWdCLFVBQVUsQ0FBQyxNQUFzQjtRQUNoRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxrREFBa0QsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDbkYsQ0FBQztJQUNGLENBQUM7SUFKZSx5QkFBVSxhQUl6QixDQUFBO0FBQ0YsQ0FBQyxFQW5CZ0IsY0FBYyxLQUFkLGNBQWMsUUFtQjlCO0FBc0JEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLG9CQUtqQjtBQUxELFdBQWtCLG9CQUFvQjtJQUNyQyxtRUFBbUU7SUFDbkUseUNBQWlCLENBQUE7SUFDakIsZ0VBQWdFO0lBQ2hFLDZDQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFMaUIsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUtyQztBQTJERCxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFlLGNBQWMsQ0FBQyxDQUFDO0FBeUkxRSxNQUFNLENBQUMsTUFBTSw4QkFBOEIsR0FBRyx1Q0FBdUMsQ0FBQztBQVF0RixNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRywyQkFBMkIsQ0FBQztBQXdCN0UsTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsMkJBQTJCLENBQUMifQ==