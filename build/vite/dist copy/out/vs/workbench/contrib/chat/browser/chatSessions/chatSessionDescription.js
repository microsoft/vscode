/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
export function getInProgressSessionDescription(chatModel) {
    const requests = chatModel.getRequests();
    if (requests.length === 0) {
        return undefined;
    }
    // Get the last request to check its response status
    const lastRequest = requests.at(-1);
    const response = lastRequest?.response;
    if (!response) {
        return undefined;
    }
    // If the response is complete, show Finished
    if (response.isComplete) {
        return undefined;
    }
    // Get the response parts to find tool invocations and progress messages
    const responseParts = response.response.value;
    let description = '';
    for (let i = responseParts.length - 1; i >= 0; i--) {
        const part = responseParts[i];
        if (description) {
            break;
        }
        if (part.kind === 'confirmation' && typeof part.message === 'string') {
            description = part.message;
        }
        else if (part.kind === 'toolInvocation') {
            const toolInvocation = part;
            const state = toolInvocation.state.get();
            description = toolInvocation.generatedTitle || toolInvocation.pastTenseMessage || toolInvocation.invocationMessage;
            if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                const confirmationTitle = state.confirmationMessages?.title;
                const titleMessage = confirmationTitle && (typeof confirmationTitle === 'string'
                    ? confirmationTitle
                    : confirmationTitle.value);
                const descriptionValue = typeof description === 'string' ? description : description.value;
                description = titleMessage ?? localize('chat.sessions.description.waitingForConfirmation', "Waiting for confirmation: {0}", descriptionValue);
            }
        }
        else if (part.kind === 'toolInvocationSerialized') {
            description = part.invocationMessage;
        }
        else if (part.kind === 'progressMessage') {
            description = part.content;
        }
        else if (part.kind === 'thinking') {
            description = localize('chat.sessions.description.thinking', 'Thinking...');
        }
    }
    return description ? renderAsPlaintext(description, { useLinkFormatter: true }) : '';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25EZXNjcmlwdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25EZXNjcmlwdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUVwRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFJakQsTUFBTSxVQUFVLCtCQUErQixDQUFDLFNBQXFCO0lBQ3BFLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN6QyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDM0IsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELG9EQUFvRDtJQUNwRCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEMsTUFBTSxRQUFRLEdBQUcsV0FBVyxFQUFFLFFBQVEsQ0FBQztJQUN2QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsNkNBQTZDO0lBQzdDLElBQUksUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3pCLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCx3RUFBd0U7SUFDeEUsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7SUFDOUMsSUFBSSxXQUFXLEdBQXlDLEVBQUUsQ0FBQztJQUUzRCxLQUFLLElBQUksQ0FBQyxHQUFHLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNwRCxNQUFNLElBQUksR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNqQixNQUFNO1FBQ1AsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxjQUFjLElBQUksT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RFLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzVCLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssZ0JBQWdCLEVBQUUsQ0FBQztZQUMzQyxNQUFNLGNBQWMsR0FBRyxJQUEyQixDQUFDO1lBQ25ELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDekMsV0FBVyxHQUFHLGNBQWMsQ0FBQyxjQUFjLElBQUksY0FBYyxDQUFDLGdCQUFnQixJQUFJLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQztZQUNuSCxJQUFJLEtBQUssQ0FBQyxJQUFJLGlFQUF5RCxFQUFFLENBQUM7Z0JBQ3pFLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQztnQkFDNUQsTUFBTSxZQUFZLEdBQUcsaUJBQWlCLElBQUksQ0FBQyxPQUFPLGlCQUFpQixLQUFLLFFBQVE7b0JBQy9FLENBQUMsQ0FBQyxpQkFBaUI7b0JBQ25CLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLFdBQVcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztnQkFDM0YsV0FBVyxHQUFHLFlBQVksSUFBSSxRQUFRLENBQUMsa0RBQWtELEVBQUUsK0JBQStCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUMvSSxDQUFDO1FBQ0YsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSywwQkFBMEIsRUFBRSxDQUFDO1lBQ3JELFdBQVcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUM7UUFDdEMsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxpQkFBaUIsRUFBRSxDQUFDO1lBQzVDLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzVCLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDckMsV0FBVyxHQUFHLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUM3RSxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sV0FBVyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdEYsQ0FBQyJ9