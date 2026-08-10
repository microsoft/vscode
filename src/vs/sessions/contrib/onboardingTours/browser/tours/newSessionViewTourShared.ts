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
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, SessionHasWorkspaceContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';

export function createNewSessionViewRecentTourWhen(): ContextKeyExpression | undefined {
	return ContextKeyExpr.and(
		ChatContextKeys.enabled,
		IsNewChatSessionContext,
		AgentHostSessionTypesAvailableContext,
		ChatEntitlementContextKeys.Entitlement.signedOut.toNegated(),
		EditorPartModalVisibleContext.toNegated(),
	);
}

export function createNewSessionViewWorkspaceStep(): ISpotlightStep {
	return {
		id: 'workspacePicker',
		targetId: 'sessions.newSession.workspacePicker',
		title: localize('sessions.onboarding.newSessionViewV2.workspace.title', "Choose a workspace"),
		description: localize('sessions.onboarding.newSessionViewV2.workspace.description', "A workspace is the folder or repository where your agent reads context and makes changes. Choose one so it can understand your project and work on the right files."),
		placement: 'above',
		when: ContextKeyExpr.and(SessionWorkspacePickerVisibleContext, SessionHasWorkspaceContext.toNegated()),
		missingTarget: { kind: 'skip' },
		openTarget: true,
		allowTargetInteraction: true,
		advanceWhen: SessionHasWorkspaceContext,
	};
}
