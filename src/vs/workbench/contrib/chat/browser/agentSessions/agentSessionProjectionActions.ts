/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAgentSessionProjectionService } from './agentSessionProjectionService.js';
import { IAgentSession, isMarshalledAgentSessionContext, IMarshalledAgentSessionContext } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { openSessionInChatWidget } from './agentSessionsOpener.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IsCompactTitleBarContext } from '../../../../common/contextkeys.js';

//#region Enter Agent Session Projection

export class EnterAgentSessionProjectionAction extends Action2 {
	static readonly ID = 'agentSession.enterAgentSessionProjection';

	constructor() {
		super({
			id: EnterAgentSessionProjectionAction.ID,
			title: localize2('enterAgentSessionProjection', "Enter Agent Session Projection"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.has(`config.${ChatConfiguration.AgentSessionProjectionEnabled}`),
				ChatContextKeys.inAgentSessionProjection.negate()
			),
		});
	}

	override async run(accessor: ServicesAccessor, context?: IAgentSession | IMarshalledAgentSessionContext): Promise<void> {
		const projectionService = accessor.get(IAgentSessionProjectionService);
		const agentSessionsService = accessor.get(IAgentSessionsService);

		let session: IAgentSession | undefined;
		if (context) {
			if (isMarshalledAgentSessionContext(context)) {
				session = agentSessionsService.getSession(context.session.resource);
			} else {
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
	static readonly ID = 'agentSession.exitAgentSessionProjection';

	constructor() {
		super({
			id: ExitAgentSessionProjectionAction.ID,
			title: localize2('exitAgentSessionProjection', "Exit Agent Session Projection"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.inAgentSessionProjection
			),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				when: ChatContextKeys.inAgentSessionProjection,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const projectionService = accessor.get(IAgentSessionProjectionService);
		await projectionService.exitProjection();
	}
}

//#endregion

//#region Open in Chat Panel

export class OpenInChatPanelAction extends Action2 {
	static readonly ID = 'agentSession.openInChatPanel';

	constructor() {
		super({
			id: OpenInChatPanelAction.ID,
			title: localize2('openInChatPanel', "Open in Chat Panel"),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.AgentSessionsContext,
				group: '1_open',
				order: 1,
			}]
		});
	}

	override async run(accessor: ServicesAccessor, context?: IAgentSession | IMarshalledAgentSessionContext): Promise<void> {
		const agentSessionsService = accessor.get(IAgentSessionsService);

		let session: IAgentSession | undefined;
		if (context) {
			if (isMarshalledAgentSessionContext(context)) {
				session = agentSessionsService.getSession(context.session.resource);
			} else {
				session = context;
			}
		}

		if (session) {
			await openSessionInChatWidget(accessor, session);
		}
	}
}

//#endregion

//#region Toggle Agent Status

export class ToggleAgentStatusAction extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			ChatConfiguration.AgentStatusEnabled,
			localize('toggle.agentStatus', 'Agent Status'),
			localize('toggle.agentStatusDescription', "Toggle visibility of the Agent Status in title bar"), 6,
			ContextKeyExpr.and(
				ChatContextKeys.enabled,
				IsCompactTitleBarContext.negate(),
				ChatContextKeys.supported
			)
		);
	}
}

//#endregion

//#region Toggle Agent Session Projection

export class ToggleAgentSessionProjectionAction extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			ChatConfiguration.AgentSessionProjectionEnabled,
			localize('toggle.agentSessionProjection', 'Agent Session Projection'),
			localize('toggle.agentSessionProjectionDescription', "Toggle Agent Session Projection mode for focused workspace review of agent sessions"), 7,
			ContextKeyExpr.and(
				ChatContextKeys.enabled,
				IsCompactTitleBarContext.negate(),
				ChatContextKeys.supported
			)
		);
	}
}

//#endregion
