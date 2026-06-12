/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { hasModelsTargetingSession } from '../widget/input/chatModelSelectionLogic.js';

/**
 * Whether the given session type is locked behind a plan upgrade for the
 * current user's entitlement. A session type is locked when, for a Copilot
 * Free or Copilot Student (EDU) user, it cannot produce a request: it does not
 * support the synthetic "Auto" model fallback
 * ({@link IChatSessionsService.supportsAutoModelForSessionType}) and the user
 * has no (BYOK) model targeting it. This covers the cloud agent (no Auto, no
 * model pool) and the Claude agent (no Auto, no Claude models for Free /
 * Student users). Locked types are shown greyed out with an Upgrade prompt
 * instead of being selectable.
 *
 * Shared by the chat input session-type picker and the Agents window harness
 * picker so both surfaces apply the same eligibility rule.
 */
export function isSessionTypeLockedForEntitlement(
	chatSessionsService: IChatSessionsService,
	chatEntitlementService: IChatEntitlementService,
	languageModelsService: ILanguageModelsService,
	type: string,
): boolean {
	const entitlement = chatEntitlementService.entitlement;
	if (entitlement !== ChatEntitlement.Free && entitlement !== ChatEntitlement.EDU) {
		return false;
	}
	// Session types that can fall back to the synthetic "Auto" model can
	// always produce a request, so they are never locked.
	if (chatSessionsService.supportsAutoModelForSessionType(type)) {
		return false;
	}
	// No Auto fallback: usable only if the user has a (BYOK) model targeting
	// this session type. Otherwise it is locked behind a plan upgrade.
	return !hasModelsTargetingSessionType(languageModelsService, type);
}

/**
 * Whether any currently registered language model targets the given session
 * type (e.g. a user-configured BYOK model). General-pool models are ignored
 * since a session type that requires its own models cannot use them.
 */
function hasModelsTargetingSessionType(languageModelsService: ILanguageModelsService, type: string): boolean {
	const models = languageModelsService.getLanguageModelIds()
		.map((id): ILanguageModelChatMetadataAndIdentifier | undefined => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { identifier: id, metadata } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m);
	return hasModelsTargetingSession(models, type);
}

/**
 * The inline "[Upgrade]" link shown as the description of a locked session
 * type. Trusts only the upgrade command.
 */
export function getSessionTypeUpgradeDescription(): IMarkdownString {
	return new MarkdownString(
		localize('chat.sessionType.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan)"),
		{ isTrusted: { enabledCommands: ['workbench.action.chat.upgradePlan'] } }
	);
}

/**
 * The hover for a locked session type, prompting an upgrade.
 */
export function getSessionTypeUpgradeHover(): MarkdownString {
	const hover = new MarkdownString('', { isTrusted: { enabledCommands: ['workbench.action.chat.upgradePlan'] }, supportThemeIcons: true });
	hover.appendMarkdown(localize('chat.sessionType.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan) to use this agent."));
	return hover;
}
