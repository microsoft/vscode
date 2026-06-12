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
 * Why a session type cannot currently be selected, or
 * {@link SessionTypeAvailability.Available} when it can.
 */
export enum SessionTypeAvailability {
	/** Selectable — has an Auto fallback or at least one targeted/BYOK model. */
	Available,
	/** Unusable, but the user can resolve it by upgrading (Copilot Free / Student). */
	UpgradeRequired,
	/** Unusable with no upgrade path — no models target it and the user is already on a paid plan. */
	NoModels,
}

/**
 * Whether the given session type can currently produce a request, and if not,
 * why. A session type is usable when it can fall back to the synthetic "Auto"
 * model ({@link IChatSessionsService.supportsAutoModelForSessionType}) or has at
 * least one model targeting it (e.g. a user-configured BYOK model). When it is
 * not usable, Copilot Free / Student (EDU) users see an Upgrade affordance
 * ({@link SessionTypeAvailability.UpgradeRequired}); users already on a paid
 * plan simply have no models ({@link SessionTypeAvailability.NoModels}) and are
 * shown an explanation with no upgrade button. Unavailable types are greyed out
 * in the picker either way.
 *
 * Shared by the chat input session-type picker and the Agents window harness
 * picker so both surfaces apply the same rule.
 */
export function getSessionTypeAvailability(
	chatSessionsService: IChatSessionsService,
	chatEntitlementService: IChatEntitlementService,
	languageModelsService: ILanguageModelsService,
	type: string,
): SessionTypeAvailability {
	if (chatSessionsService.supportsAutoModelForSessionType(type) || hasModelsTargetingSessionType(languageModelsService, type)) {
		return SessionTypeAvailability.Available;
	}
	// Not usable: Copilot Free / Student users can resolve it by upgrading;
	// users already on a paid plan simply have no models for it (e.g. a BYOK
	// agent with nothing configured).
	const entitlement = chatEntitlementService.entitlement;
	const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
	return canUpgrade ? SessionTypeAvailability.UpgradeRequired : SessionTypeAvailability.NoModels;
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
 * The inline description shown for an unavailable session type, or `undefined`
 * when it is available. Free / Student users get an actionable "[Upgrade]"
 * link; paid users with no models get a plain "No models available" note.
 */
export function getSessionTypeUnavailableDescription(availability: SessionTypeAvailability): IMarkdownString | undefined {
	switch (availability) {
		case SessionTypeAvailability.UpgradeRequired:
			return new MarkdownString(
				localize('chat.sessionType.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan)"),
				{ isTrusted: { enabledCommands: ['workbench.action.chat.upgradePlan'] } }
			);
		case SessionTypeAvailability.NoModels:
			return new MarkdownString(localize('chat.sessionType.noModels', "No models available"));
		default:
			return undefined;
	}
}

/**
 * The hover shown for an unavailable session type, or `undefined` when it is
 * available. Free / Student users are prompted to upgrade; paid users with no
 * models get an explanation with no upgrade link.
 */
export function getSessionTypeUnavailableHover(availability: SessionTypeAvailability): IMarkdownString | undefined {
	switch (availability) {
		case SessionTypeAvailability.UpgradeRequired: {
			const hover = new MarkdownString('', { isTrusted: { enabledCommands: ['workbench.action.chat.upgradePlan'] }, supportThemeIcons: true });
			hover.appendMarkdown(localize('chat.sessionType.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan) to use this agent."));
			return hover;
		}
		case SessionTypeAvailability.NoModels:
			return new MarkdownString(localize('chat.sessionType.noModelsHover', "No models are available for this agent."));
		default:
			return undefined;
	}
}

/**
 * Plain-text description for surfaces that cannot render markdown (e.g. the
 * mobile picker sheet), or `undefined` when the session type is available.
 */
export function getSessionTypeUnavailableLabel(availability: SessionTypeAvailability): string | undefined {
	switch (availability) {
		case SessionTypeAvailability.UpgradeRequired:
			return localize('chat.sessionType.upgradeMobile', "Requires GitHub Copilot Pro");
		case SessionTypeAvailability.NoModels:
			return localize('chat.sessionType.noModels', "No models available");
		default:
			return undefined;
	}
}
