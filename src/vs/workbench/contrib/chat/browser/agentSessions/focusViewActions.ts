/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IFocusViewService } from './focusViewService.js';
import { IAgentSession, isMarshalledAgentSessionContext, IMarshalledAgentSessionContext } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { openSessionInChatWidget } from './agentSessionsOpener.js';

//#region Enter Astral Projection

export class EnterFocusViewAction extends Action2 {
	static readonly ID = 'agentSession.enterAstralProjection';

	constructor() {
		super({
			id: EnterFocusViewAction.ID,
			title: localize2('enterAstralProjection', "Enter Astral Projection"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.inFocusViewMode.negate(),
			menu: [{
				id: MenuId.AgentSessionsContext,
				group: '0_focus',
				order: 1,
				when: ChatContextKeys.inFocusViewMode.negate()
			}]
		});
	}

	override async run(accessor: ServicesAccessor, context?: IAgentSession | IMarshalledAgentSessionContext): Promise<void> {
		const focusViewService = accessor.get(IFocusViewService);
		const agentSessionsService = accessor.get(IAgentSessionsService);

		let session: IAgentSession | undefined;
		if (context) {
			if (isMarshalledAgentSessionContext(context)) {
				session = agentSessionsService.getSession(context.session.resource);
			} else {
				session = context;
			}
		}

		// If no session provided via context, get all sessions and pick the first one for now
		// TODO: In the future, show a session picker
		if (!session) {
			const allSessions = agentSessionsService.model.sessions;
			if (allSessions.length > 0) {
				session = allSessions[0];
			}
		}

		if (session) {
			await focusViewService.enterFocusView(session);
		}
	}
}

//#endregion

//#region Exit Astral Projection

export class ExitFocusViewAction extends Action2 {
	static readonly ID = 'agentSession.exitAstralProjection';

	constructor() {
		super({
			id: ExitFocusViewAction.ID,
			title: localize2('exitAstralProjection', "Exit Astral Projection"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.inFocusViewMode,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				when: ChatContextKeys.inFocusViewMode,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const focusViewService = accessor.get(IFocusViewService);
		await focusViewService.exitFocusView();
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
