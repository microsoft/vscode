/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { encodeBase64 } from '../../../../../../base/common/buffer.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IChatToolInvocation } from '../../chatService/chatService.js';
import { isToolResultOutputDetails } from '../../tools/languageModelToolsService.js';
export class ChatToolInvocation {
    get state() {
        return this._state;
    }
    /**
     * Create a tool invocation in streaming state.
     * Use this when the tool call is beginning to stream partial input from the LM.
     */
    static createStreaming(options) {
        return new ChatToolInvocation(undefined, options.toolData, options.toolCallId, options.subagentInvocationId, undefined, { startInStreaming: true }, options.chatRequestId);
    }
    /**
     * Create a tool invocation already in cancelled state.
     * Use this when a hook denies tool execution before it even starts.
     */
    static createCancelled(options, parameters, reason, reasonMessage) {
        return new ChatToolInvocation(undefined, options.toolData, options.toolCallId, options.subagentInvocationId, parameters, { startInCancelled: true, cancelReason: reason, cancelReasonMessage: reasonMessage }, options.chatRequestId);
    }
    constructor(preparedInvocation, toolData, toolCallId, subAgentInvocationId, parameters, startOptions = {}, chatRequestId) {
        this.toolCallId = toolCallId;
        this.kind = 'toolInvocation';
        this.isAttachedToThinking = false;
        this._progress = observableValue(this, { progress: 0 });
        // Streaming-related observables
        this._partialInput = observableValue(this, undefined);
        this._streamingMessage = observableValue(this, undefined);
        // For streaming invocations, use a default message until handleToolStream provides one
        let defaultMessage = '';
        if (startOptions.startInStreaming) {
            defaultMessage = toolData.displayName;
        }
        else if (startOptions.startInCancelled) {
            defaultMessage = startOptions.cancelReasonMessage ?? localize('toolDeniedMessage', "Tool \"{0}\" was denied", toolData.displayName);
        }
        this.invocationMessage = preparedInvocation?.invocationMessage ?? defaultMessage;
        this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
        this.originMessage = preparedInvocation?.originMessage;
        this.confirmationMessages = preparedInvocation?.confirmationMessages;
        this.presentation = preparedInvocation?.presentation;
        this.toolSpecificData = preparedInvocation?.toolSpecificData;
        this.toolId = toolData.id;
        this.icon = preparedInvocation?.icon ?? (toolData.icon && ThemeIcon.isThemeIcon(toolData.icon) ? toolData.icon : undefined);
        this.source = toolData.source;
        this.subAgentInvocationId = subAgentInvocationId;
        this.parameters = parameters;
        this.chatRequestId = chatRequestId;
        if (startOptions.startInCancelled) {
            // Start directly in cancelled state (e.g., when a hook denies execution)
            this._state = observableValue(this, {
                type: 5 /* IChatToolInvocation.StateKind.Cancelled */,
                reason: startOptions.cancelReason ?? 0 /* ToolConfirmKind.Denied */,
                reasonMessage: startOptions.cancelReasonMessage,
                parameters: this.parameters,
                confirmationMessages: this.confirmationMessages,
            });
        }
        else if (startOptions.startInStreaming) {
            // Start in streaming state
            this._state = observableValue(this, {
                type: 0 /* IChatToolInvocation.StateKind.Streaming */,
                partialInput: this._partialInput,
                streamingMessage: this._streamingMessage,
            });
        }
        else if (!this.confirmationMessages?.title) {
            this._state = observableValue(this, {
                type: 2 /* IChatToolInvocation.StateKind.Executing */,
                confirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */, reason: this.confirmationMessages?.confirmationNotNeededReason },
                progress: this._progress,
                parameters: this.parameters,
                confirmationMessages: this.confirmationMessages,
            });
        }
        else {
            this._state = observableValue(this, {
                type: 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */,
                parameters: this.parameters,
                confirmationMessages: this.confirmationMessages,
                confirm: reason => {
                    if (reason.type === 0 /* ToolConfirmKind.Denied */ || reason.type === 5 /* ToolConfirmKind.Skipped */) {
                        this._state.set({
                            type: 5 /* IChatToolInvocation.StateKind.Cancelled */,
                            reason: reason.type,
                            parameters: this.parameters,
                            confirmationMessages: this.confirmationMessages,
                        }, undefined);
                    }
                    else {
                        this._state.set({
                            type: 2 /* IChatToolInvocation.StateKind.Executing */,
                            confirmed: reason,
                            progress: this._progress,
                            parameters: this.parameters,
                            confirmationMessages: this.confirmationMessages,
                        }, undefined);
                    }
                }
            });
        }
    }
    /**
     * Update the partial input observable during streaming.
     */
    updatePartialInput(input) {
        if (this._state.get().type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
            return; // Only update in streaming state
        }
        this._partialInput.set(input, undefined);
    }
    /**
     * Update the streaming message (from handleToolStream).
     */
    updateStreamingMessage(message) {
        const state = this._state.get();
        if (state.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
            return; // Only update in streaming state
        }
        this._streamingMessage.set(message, undefined);
    }
    /**
     * Cancel a streaming invocation directly (e.g., when preToolUse hook denies).
     * Only works when in Streaming state.
     * @returns true if the cancellation was applied, false if not in streaming state
     */
    cancelFromStreaming(reason, reasonMessage) {
        const currentState = this._state.get();
        if (currentState.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
            return false; // Only cancel from streaming state
        }
        this._state.set({
            type: 5 /* IChatToolInvocation.StateKind.Cancelled */,
            reason: reason,
            reasonMessage: reasonMessage,
            parameters: this.parameters,
            confirmationMessages: this.confirmationMessages,
        }, undefined);
        return true;
    }
    /**
     * Transition from streaming state to prepared/executing state.
     * Called when the full tool call is ready.
     */
    transitionFromStreaming(preparedInvocation, parameters, autoConfirmed) {
        const currentState = this._state.get();
        if (currentState.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
            return; // Only transition from streaming state
        }
        // Preserve the last streaming message if no new invocation message is provided
        const lastStreamingMessage = this._streamingMessage.get();
        if (lastStreamingMessage && !preparedInvocation?.invocationMessage) {
            this.invocationMessage = lastStreamingMessage;
        }
        // Update fields from prepared invocation
        this.parameters = parameters;
        if (preparedInvocation) {
            if (preparedInvocation.invocationMessage) {
                this.invocationMessage = preparedInvocation.invocationMessage;
            }
            this.pastTenseMessage = preparedInvocation.pastTenseMessage;
            this.confirmationMessages = preparedInvocation.confirmationMessages;
            this.presentation = preparedInvocation.presentation;
            this.toolSpecificData = preparedInvocation.toolSpecificData;
        }
        const confirm = (reason) => {
            if (reason.type === 0 /* ToolConfirmKind.Denied */ || reason.type === 5 /* ToolConfirmKind.Skipped */) {
                this._state.set({
                    type: 5 /* IChatToolInvocation.StateKind.Cancelled */,
                    reason: reason.type,
                    parameters: this.parameters,
                    confirmationMessages: this.confirmationMessages,
                }, undefined);
            }
            else {
                this._state.set({
                    type: 2 /* IChatToolInvocation.StateKind.Executing */,
                    confirmed: reason,
                    progress: this._progress,
                    parameters: this.parameters,
                    confirmationMessages: this.confirmationMessages,
                }, undefined);
            }
        };
        // Transition to the appropriate state
        if (autoConfirmed) {
            confirm(autoConfirmed);
        }
        else if (!this.confirmationMessages?.title) {
            this._state.set({
                type: 2 /* IChatToolInvocation.StateKind.Executing */,
                confirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */, reason: this.confirmationMessages?.confirmationNotNeededReason },
                progress: this._progress,
                parameters: this.parameters,
                confirmationMessages: this.confirmationMessages,
            }, undefined);
        }
        else {
            this._state.set({
                type: 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */,
                parameters: this.parameters,
                confirmationMessages: this.confirmationMessages,
                confirm,
            }, undefined);
        }
    }
    _setCompleted(result, postConfirmed) {
        if (postConfirmed && (postConfirmed.type === 0 /* ToolConfirmKind.Denied */ || postConfirmed.type === 5 /* ToolConfirmKind.Skipped */)) {
            this._state.set({
                type: 5 /* IChatToolInvocation.StateKind.Cancelled */,
                reason: postConfirmed.type,
                parameters: this.parameters,
                confirmationMessages: this.confirmationMessages,
            }, undefined);
            return;
        }
        this._state.set({
            type: 4 /* IChatToolInvocation.StateKind.Completed */,
            confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
            resultDetails: result?.toolResultDetails,
            postConfirmed,
            contentForModel: result?.content || [],
            parameters: this.parameters,
            confirmationMessages: this.confirmationMessages,
        }, undefined);
    }
    async didExecuteTool(result, final, checkIfResultAutoApproved) {
        if (result?.toolResultMessage) {
            this.pastTenseMessage = result.toolResultMessage;
        }
        else if (this._progress.get().message) {
            this.pastTenseMessage = this._progress.get().message;
        }
        if (this.confirmationMessages?.confirmResults && !result?.toolResultError && result?.confirmResults !== false && !final) {
            const autoApproved = await checkIfResultAutoApproved?.();
            if (autoApproved) {
                this._setCompleted(result, autoApproved);
            }
            else {
                this._state.set({
                    type: 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */,
                    confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
                    resultDetails: result?.toolResultDetails,
                    contentForModel: result?.content || [],
                    confirm: reason => this._setCompleted(result, reason),
                    parameters: this.parameters,
                    confirmationMessages: this.confirmationMessages,
                }, undefined);
            }
        }
        else {
            this._setCompleted(result);
        }
        return this._state.get();
    }
    acceptProgress(step) {
        const prev = this._progress.get();
        this._progress.set({
            progress: step.progress || prev.progress || 0,
            message: step.message,
        }, undefined);
    }
    toJSON() {
        // persist the serialized call as 'skipped' if we were waiting for postapproval
        const waitingForPostApproval = this.state.get().type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */;
        const details = waitingForPostApproval ? undefined : IChatToolInvocation.resultDetails(this);
        return {
            kind: 'toolInvocationSerialized',
            presentation: this.presentation,
            invocationMessage: this.invocationMessage,
            pastTenseMessage: this.pastTenseMessage,
            originMessage: this.originMessage,
            isConfirmed: waitingForPostApproval ? { type: 5 /* ToolConfirmKind.Skipped */ } : IChatToolInvocation.executionConfirmedOrDenied(this),
            isComplete: true,
            source: this.source,
            resultDetails: isToolResultOutputDetails(details)
                ? { output: { type: 'data', mimeType: details.output.mimeType, base64Data: encodeBase64(details.output.value) } }
                : details,
            toolSpecificData: this.toolSpecificData,
            toolCallId: this.toolCallId,
            toolId: this.toolId,
            subAgentInvocationId: this.subAgentInvocationId,
            generatedTitle: this.generatedTitle,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xJbnZvY2F0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFRvb2xJbnZvY2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV2RSxPQUFPLEVBQW9DLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFtTSxtQkFBbUIsRUFBd0YsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5VixPQUFPLEVBQTJCLHlCQUF5QixFQUF3RixNQUFNLDBDQUEwQyxDQUFDO0FBVXBNLE1BQU0sT0FBTyxrQkFBa0I7SUEwQjlCLElBQVcsS0FBSztRQUNmLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ksTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFrQztRQUMvRCxPQUFPLElBQUksa0JBQWtCLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsb0JBQW9CLEVBQUUsU0FBUyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzVLLENBQUM7SUFFRDs7O09BR0c7SUFDSSxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQWtDLEVBQUUsVUFBbUIsRUFBRSxNQUF3RCxFQUFFLGFBQXdDO1FBQ3hMLE9BQU8sSUFBSSxrQkFBa0IsQ0FB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