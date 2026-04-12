/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import * as nls from '../../../../../nls.js';
import { formatDebugEventsForContext, getDebugEventsModelDescription } from '../../common/chatDebugEvents.js';
/**
 * Creates a debug events attachment for a chat session.
 * This can be used to attach debug logs to a chat request.
 */
export async function createDebugEventsAttachment(sessionResource, chatDebugService) {
    chatDebugService.markDebugDataAttached(sessionResource);
    if (!chatDebugService.hasInvokedProviders(sessionResource)) {
        await chatDebugService.invokeProviders(sessionResource);
    }
    const events = chatDebugService.getEvents(sessionResource);
    const summary = events.length > 0
        ? formatDebugEventsForContext(events)
        : nls.localize('debugEventsSnapshot.noEvents', "No debug events found for this conversation.");
    return {
        id: 'chatDebugEvents',
        name: nls.localize('debugEventsSnapshot.contextName', "Debug Events Snapshot"),
        icon: Codicon.output,
        kind: 'debugEvents',
        snapshotTime: Date.now(),
        sessionResource,
        value: summary,
        modelDescription: getDebugEventsModelDescription(),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnQXR0YWNobWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnQXR0YWNobWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFakUsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUU3QyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUc5Rzs7O0dBR0c7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLDJCQUEyQixDQUNoRCxlQUFvQixFQUNwQixnQkFBbUM7SUFFbkMsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDeEQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDNUQsTUFBTSxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUNELE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUMzRCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUM7UUFDaEMsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLE1BQU0sQ0FBQztRQUNyQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO0lBRWhHLE9BQU87UUFDTixFQUFFLEVBQUUsaUJBQWlCO1FBQ3JCLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLHVCQUF1QixDQUFDO1FBQzlFLElBQUksRUFBRSxPQUFPLENBQUMsTUFBTTtRQUNwQixJQUFJLEVBQUUsYUFBYTtRQUNuQixZQUFZLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtRQUN4QixlQUFlO1FBQ2YsS0FBSyxFQUFFLE9BQU87UUFDZCxnQkFBZ0IsRUFBRSw4QkFBOEIsRUFBRTtLQUNsRCxDQUFDO0FBQ0gsQ0FBQyJ9