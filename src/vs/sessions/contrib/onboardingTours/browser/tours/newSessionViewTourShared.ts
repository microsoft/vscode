/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISpotlightStep } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, NewSessionOnboardingHandoffContext, SessionHasWorkspaceContext, SessionsWelcomeVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';

export function createNewSessionViewRecentTourWhen(): ContextKeyExpression | undefined {
	return ContextKeyExpr.and(
		ChatContextKeys.enabled,
		IsNewChatSessionContext,
		AgentHostSessionTypesAvailableContext,
		ChatEntitlementContextKeys.Entitlement.signedOut.toNegated(),
		EditorPartModalVisibleContext.toNegated(),
		NewSessionOnboardingHandoffContext.toNegated(),
		SessionsWelcomeVisibleContext.toNegated(),
	);
}

export function createNewSessionViewWorkspaceStep(options: { requireSelection?: boolean } = {}): ISpotlightStep {
	const requireSelection = options.requireSelection ?? true;
	return {
		id: 'workspacePicker',
		targetId: 'sessions.newSession.workspacePicker',
		title: localize('sessions.onboarding.newSessionViewV2.workspace.title', "Choose a workspace"),
		description: requireSelection
			? localize('sessions.onboarding.newSessionViewV2.workspace.description', "A workspace is the folder or repository where your agent reads context and makes changes. Choose one so it can understand your project and work on the right files.")
			: localize('sessions.onboarding.newSessionViewV2.workspace.optional.description', "A workspace is the folder or repository where your agent reads context and makes changes. Choose one for project-specific work, or continue without one."),
		placement: 'above',
		when: ContextKeyExpr.and(SessionWorkspacePickerVisibleContext, SessionHasWorkspaceContext.toNegated()),
		missingTarget: { kind: 'skip' },
		openTarget: true,
		allowTargetInteraction: true,
		advanceWhen: requireSelection ? SessionHasWorkspaceContext : undefined,
	};
}

/** Workspace step copy that contrasts the Agents window with a classic editor window, which is locked to one folder. */
export function getNewSessionViewMentalModelWorkspaceCopy(): Pick<ISpotlightStep, 'title' | 'description' | 'selectedContent'> {
	return {
		title: localize('sessions.onboarding.newSessionViewV2.mentalModelAndModels.workspace.title', "Pick a project for this session"),
		description: localize('sessions.onboarding.newSessionViewV2.mentalModelAndModels.workspace.description', "Unlike a normal VS Code window, you aren't locked to one folder. Point this session to any folder. Each session can work on a different folder without opening a new window."),
		selectedContent: {
			title: localize('sessions.onboarding.newSessionViewV2.mentalModelAndModels.workspace.selected.title', "Pick a project for this session"),
			description: localize('sessions.onboarding.newSessionViewV2.mentalModelAndModels.workspace.selected.description', "We've selected your current project to get you started. You can point each new session to any folder without opening a new window."),
		},
	};
}
