/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IAgentSessionProjectionService } from './agentSessionProjectionService.js';
import { isMarshalledAgentSessionContext } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ToggleTitleBarConfigAction } from '../../../../../browser/parts/titlebar/titlebarActions.js';
import { IsCompactTitleBarContext } from '../../../../../common/contextkeys.js';
import { inAgentSessionProjection } from './agentSessionProjection.js';
import { ChatConfiguration } from '../../../common/constants.js';
//#region Enter Agent Session Projection
export class EnterAgentSessionProjectionAction extends Action2 {
    static { this.ID = 'agentSession.enterAgentSessionProjection'; }
    constructor() {
        super({
            id: EnterAgentSessionProjectionAction.ID,
            title: localize2('enterAgentSessionProjection', "Enter Agent Session Projection"),
            category: CHAT_CATEGORY,
            f1: false,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.AgentSessionProjectionEnabled}`), inAgentSessionProjection.negate()),
        });
    }
    async run(accessor, context) {
        const projectionService = accessor.get(IAgentSessionProjectionService);
        const agentSessionsService = accessor.get(IAgentSessionsService);
        let session;
        if (context) {
            if (isMarshalledAgentSessionContext(context)) {
                session = agentSessionsService.getSession(context.session.resource);
            }
            else {
                session = context;
            }
        }
        if (session) {
            await projectionService.enterProjection(session);
        }
    }
}
//#endregion
//#region Exit Agent Session Projection
export class ExitAgentSessionProjectionAction extends Action2 {
    static { this.ID = 'agentSession.exitAgentSessionProjection'; }
    constructor() {
        super({
            id: ExitAgentSessionProjectionAction.ID,
            title: localize2('exitAgentSessionProjection', "Exit Agent Session Projection"),
            category: CHAT_CATEGORY,
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, inAgentSessionProjection),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 9 /* KeyCode.Escape */,
                when: inAgentSessionProjection,
            },
        });
    }
    async run(accessor) {
        const projectionService = accessor.get(IAgentSessionProjectionService);
        await projectionService.exitProjection();
    }
}
//#endregion
//#region Toggle Agent Quick Input
export class ToggleUnifiedAgentsBarAction extends ToggleTitleBarConfigAction {
    constructor() {
        super(ChatConfiguration.UnifiedAgentsBar, localize('toggle.agentQuickInput', 'Agent Quick Input'), localize('toggle.agentQuickInputDescription', "Toggle Agent Quick Input, replacing the classic command center search box."), 7, ContextKeyExpr.and(ChatContextKeys.enabled, IsCompactTitleBarContext.negate(), ChatContextKeys.supported, ContextKeyExpr.has('config.window.commandCenter')));
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9leHBlcmltZW50cy9hZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUkvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDNUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3BGLE9BQU8sRUFBaUIsK0JBQStCLEVBQWtDLE1BQU0sMEJBQTBCLENBQUM7QUFDMUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzdELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRWpFLHdDQUF3QztBQUV4QyxNQUFNLE9BQU8saUNBQWtDLFNBQVEsT0FBTzthQUM3QyxPQUFFLEdBQUcsMENBQTBDLENBQUM7SUFFaEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFF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