/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './dashboardWorkTools.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsBoardService } from '../../../services/sessions/browser/sessionsBoardService.js';
import { SessionsBoardVisibleContext } from '../../../common/contextkeys.js';
import { ISessionIntentService } from '../common/sessionIntent.js';
import { SessionIntentService } from './sessionIntentService.js';

registerSingleton(ISessionIntentService, SessionIntentService, InstantiationType.Delayed);

const when = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, SessionsBoardVisibleContext);

registerAction2(class NewWorkAction extends Action2 {
	constructor() {
		super({ id: 'sessions.intent.newWork', title: localize2('intent.newWork', "New Work"), precondition: when, f1: true });
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		if (!accessor.get(ISessionsService).isSessionBoardVisible.get()) { throw new Error(localize('intent.dashboardOnly', "This experiment is available only in the work dashboard.")); }
		const board = accessor.get(ISessionsBoardService).activeView.get();
		if (!board?.startNewWork) { throw new Error(localize('intent.dashboardUnavailable', "The dashboard is not ready. Reopen it and try again.")); }
		await board.startNewWork();
	}
});
