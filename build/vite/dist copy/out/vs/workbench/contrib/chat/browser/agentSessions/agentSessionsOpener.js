/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isLocalAgentSessionItem } from './agentSessionsModel.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { localize } from '../../../../../nls.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
class SessionOpenerRegistry {
    constructor() {
        this.participants = new Set();
    }
    registerParticipant(participant) {
        this.participants.add(participant);
        return {
            dispose: () => {
                this.participants.delete(participant);
            }
        };
    }
    getParticipants() {
        return Array.from(this.participants);
    }
}
export const sessionOpenerRegistry = new SessionOpenerRegistry();
//#endregion
export async function openSession(accessor, session, openOptions) {
    const instantiationService = accessor.get(IInstantiationService);
    const logService = accessor.get(ILogService);
    // First, give registered participants a chance to handle the session
    for (const participant of sessionOpenerRegistry.getParticipants()) {
        try {
            const handled = await instantiationService.invokeFunction(accessor => participant.handleOpenSession(accessor, session, openOptions));
            if (handled) {
                return undefined; // Participant handled the session, skip default opening
            }
        }
        catch (error) {
            logService.error(error); // log error but continue to support opening from default logic
        }
    }
    // Default session opening logic
    return instantiationService.invokeFunction(accessor => openSessionDefault(accessor, session, openOptions));
}
async function openSessionDefault(accessor, session, openOptions) {
    const chatSessionsService = accessor.get(IChatSessionsService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const notificationService = accessor.get(INotificationService);
    try {
        session.setRead(true); // mark as read when opened
        let sessionOptions;
        if (isLocalAgentSessionItem(session)) {
            sessionOptions = {};
        }
        else {
            sessionOptions = { title: { preferred: session.label } };
        }
        let options = {
            ...sessionOptions,
            ...openOptions?.editorOptions,
            revealIfOpened: true, // always try to reveal if already opened
        };
        await chatSessionsService.activateChatSessionItemProvider(session.providerType); // ensure provider is activated before trying to open
        let target;
        if (openOptions?.sideBySide) {
            target = ACTIVE_GROUP;
        }
        else {
            target = ChatViewPaneTarget;
        }
        const isLocalChatSession = session.resource.scheme === Schemas.vscodeChatEditor || session.resource.scheme === Schemas.vscodeLocalChatSession;
        if (!isLocalChatSession && !(await chatSessionsService.canResolveChatSession(session.resource.scheme))) {
            target = openOptions?.sideBySide ? SIDE_GROUP : ACTIVE_GROUP; // force to open in editor if session cannot be resolved in panel
            options = { ...options, revealIfOpened: true };
        }
        return await chatWidgetService.openSession(session.resource, target, options);
    }
    catch (error) {
        notificationService.error(localize('chat.openSessionFailed', "Failed to open chat session: {0}", toErrorMessage(error)));
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc09wZW5lci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNPcGVuZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFpQix1QkFBdUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBR2pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBZSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNqRixPQUFPLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRS9GLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQWF4RSxNQUFNLHFCQUFxQjtJQUEzQjtRQUVrQixpQkFBWSxHQUFHLElBQUksR0FBRyxFQUE2QixDQUFDO0lBZXRFLENBQUM7SUFiQSxtQkFBbUIsQ0FBQyxXQUFzQztRQUN6RCxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVuQyxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FB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