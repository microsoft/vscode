/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
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
 * least one model targeting it (e.g. a user-configured BYOK model). A type that
 * does not require its own models ({@link IChatSessionsService.requiresCustomModelsForSessionType})
 * — e.g. the cloud delegation agent, which runs remotely without a local model —
 * also stays usable on a paid plan even with neither an Auto fallback nor a
 * targeted model. When a type is not usable, Copilot Free / Student (EDU) users
 * see an Upgrade affordance ({@link SessionTypeAvailability.UpgradeRequired});
 * paid users whose type genuinely requires its own models but has none simply
 * have no models ({@link SessionTypeAvailability.NoModels}) and are shown an
 * explanation with no upgrade button. Unavailable types are greyed out in the
 * picker either way.
 *
 * While the type's contribution isn't registered yet (e.g. during a window
 * reload before the extension host re-registers), this returns
 * {@link SessionTypeAvailability.Available} so a harness is never locked
 * prematurely; the model picker is the backstop and shows "No models available"
 * for an active session in that window.
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
	// The "no Auto" signal comes from the type's contribution, which loads
	// asynchronously. While it's missing — e.g. during a window reload before the
	// extension host re-registers contributions — we can't conclude the type
	// requires explicit models, so stay selectable (the model picker is the
	// backstop and shows "No models available" for an active session). This also
	// keeps harnesses that do support Auto, like the Copilot CLI, from flashing a
	// locked state before their contribution loads.
	if (!chatSessionsService.getChatSessionContribution(type)) {
		return SessionTypeAvailability.Available;
	}
	// No Auto fallback and no targeted models. Copilot Free / Student users must
	// upgrade to unlock such a type (e.g. the cloud delegation agent is a paid
	// feature), so they always get the Upgrade affordance.
	const entitlement = chatEntitlementService.entitlement;
	const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
	if (canUpgrade) {
		return SessionTypeAvailability.UpgradeRequired;
	}
	// On a paid plan only types that genuinely need their own models are unusable
	// here. A type that does not require custom models (e.g. the cloud delegation
	// agent, which runs remotely without a local model) stays selectable.
	return chatSessionsService.requiresCustomModelsForSessionType(type)
		? SessionTypeAvailability.NoModels
		: SessionTypeAvailability.Available;
}

/**
 * Whether any currently registered language model targets the given session
 * type (e.g. a user-configured BYOK model). General-pool models are ignored
 * since a session type that requires its own models cannot use them.
 */
function hasModelsTargetingSessionType(languageModelsService: ILanguageModelsService, type: string): boolean {
	return languageModelsService.getLanguageModelIds().some(id => {
		const metadata = languageModelsService.lookupLanguageModel(id);
		return !!metadata && hasModelsTargetingSession([{ identifier: id, metadata }], type);
	});
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
