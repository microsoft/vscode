/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { SessionHasChangesContext, SessionIsCreatedContext, SessionWorkspaceIsVirtualContext, DesktopLayoutContext } from '../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { CodeReviewService, ICodeReviewService } from './codeReviewService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { Menus } from '../../../browser/menus.js';
import { SessionChangesEditorInput } from '../../changes/browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';

registerSingleton(ICodeReviewService, CodeReviewService, InstantiationType.Delayed);

const CODE_REVIEW_QUERY = '/code-review';

const desktopDetailPanel = DesktopLayoutContext;

const desktopCodeReviewWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ActiveEditorContext.isEqualTo(SessionChangesEditorInput.EDITOR_ID),
	desktopDetailPanel,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext,
	SessionWorkspaceIsVirtualContext.toNegated(),
	SessionIsCreatedContext,
	SessionHasChangesContext,
);

class RunSessionCodeReviewAction extends Action2 {

	static readonly ID = 'sessions.codeReview.run';

	constructor() {
		super({
			id: RunSessionCodeReviewAction.ID,
			title: localize2('sessions.runCodeReview', "Run Code Review"),
			tooltip: localize('sessions.runCodeReview.tooltip', "Run Code Review"),
			category: CHAT_CATEGORY,
			icon: Codicon.codeReview,
			precondition: ContextKeyExpr.or(ChatContextKeys.hasAgentSessionChanges, SessionHasChangesContext),
			menu: {
				id: Menus.SessionsEditorHeaderLayout,
				group: 'navigation',
				order: 10,
				when: desktopCodeReviewWhen,
			},
		});
	}

	override async run(accessor: ServicesAccessor, sessionResource?: URI): Promise<void> {
		const sessionManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const sessionChangesService = accessor.get(ISessionChangesService);

		const candidateResource = URI.isUri(sessionResource)
			? sessionResource
			: sessionsService.activeSession.get()?.resource;
		const resource = candidateResource
			? sessionChangesService.getSessionResource(candidateResource) ?? candidateResource
			: undefined;
		if (!resource) {
			return;
		}

		const session = sessionManagementService.getSession(resource);
		if (!session) {
			return;
		}

		if (session.capabilities.get().supportsMultipleChats) {
			await sessionManagementService.sendNewChatRequest(session, { query: CODE_REVIEW_QUERY });
		} else {
			chatWidgetService.getWidgetBySessionResource(session.resource)?.acceptInput(CODE_REVIEW_QUERY);
		}
	}
}

registerAction2(RunSessionCodeReviewAction);
