/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';

/**
 * Why a session type cannot currently be selected, or
 * {@link SessionTypeAvailability.Available} when it can.
 */
export enum SessionTypeAvailability {
	/** Selectable — has an Auto fallback or at least one targeted/BYOK model. */
	Available,
	/** Unusable until the user signs in (the type needs a Copilot account and has no visible Agent Host BYOK model). */
	SignInRequired,
	/** Unusable, but the user can resolve it by upgrading (Copilot Free / Student). */
	UpgradeRequired,
	/** Unusable with no upgrade path — no models target it and the user is already on a paid plan. */
	NoModels,
}

/**
 * The picker's view of {@link getSessionTypeAvailability}, which keeps a harness
 * selectable in the two cases where the raw answer would grey out something the
 * user can still act on.
 *
 * `hasSetupBanner` is the second: a harness whose SDK setup banner is on offer
 * has no models *yet*, and the banner saying how to fix that renders inside a
 * session of that very type. Not a static allow-list of session types — a
 * signed-in user whose Claude harness has no models gets no banner and stays
 * greyed out, which is the honest answer for them.
 */
export function getSessionTypePickerAvailability(type: string, availability: SessionTypeAvailability, allowSignedOutWhenUsable: boolean, hasSetupBanner: boolean): SessionTypeAvailability {
	if (!allowSignedOutWhenUsable) {
		return availability;
	}
	if (type === SessionType.AgentHostCopilot && availability === SessionTypeAvailability.SignInRequired) {
		return SessionTypeAvailability.Available;
	}
	if (hasSetupBanner && availability === SessionTypeAvailability.NoModels) {
		return SessionTypeAvailability.Available;
	}
	return availability;
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
 * explanation with no upgrade button. A signed-out user gets a Sign-in
 * affordance ({@link SessionTypeAvailability.SignInRequired}) for Copilot-backed
 * types ({@link IChatSessionsService.requiresCopilotSignInForSessionType}), unless
 * anonymous access is enabled or a visible Agent Host BYOK model targets the type.
 * Types that don't depend on Copilot stay usable while signed out. Unavailable
 * types are greyed out in the picker either way.
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
	allowSignedOutWhenUsable = false,
): SessionTypeAvailability {
	// Contribution loads asynchronously; while missing (e.g. during a reload) we
	// can't judge the type, so stay selectable to avoid locking it prematurely.
	if (!chatSessionsService.getChatSessionContribution(type)) {
		return SessionTypeAvailability.Available;
	}
	const entitlement = chatEntitlementService.entitlement;
	const hasTargetedModels = hasAnyModelTargetingSessionType(languageModelsService, type);
	const hasVisibleByokModels = allowSignedOutWhenUsable && chatEntitlementService.clientByokEnabled && hasVisibleByokModelsTargetingSessionType(languageModelsService, type);
	// A visible Agent Host BYOK model can run without a Copilot account.
	if (entitlement === ChatEntitlement.Unknown && !chatEntitlementService.anonymous && chatSessionsService.requiresCopilotSignInForSessionType(type) && !hasVisibleByokModels) {
		return SessionTypeAvailability.SignInRequired;
	}
	// Signed in: a model targeting the type (e.g. BYOK) or an "Auto" fallback
	// (e.g. the Copilot CLI harness) makes it usable.
	if (hasTargetedModels || chatSessionsService.supportsAutoModelForSessionType(type)) {
		return SessionTypeAvailability.Available;
	}
	// No Auto fallback and no targeted models: Free / Student users must upgrade
	// to unlock the type (e.g. the cloud delegation agent is a paid feature).
	const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
	if (canUpgrade) {
		return SessionTypeAvailability.UpgradeRequired;
	}
	// On a paid plan only types that genuinely need their own models are unusable.
	// A type not requiring custom models (e.g. the remote cloud agent) stays usable.
	return chatSessionsService.requiresCustomModelsForSessionType(type)
		? SessionTypeAvailability.NoModels
		: SessionTypeAvailability.Available;
}

/**
 * Whether any currently registered language model targets the given session
 * type (e.g. a user-configured BYOK model). General-pool models are ignored
 * since a session type that requires its own models cannot use them.
 */
export function hasAnyModelTargetingSessionType(languageModelsService: ILanguageModelsService, type: string): boolean {
	return languageModelsService.getLanguageModelIds().some(id => {
		const metadata = languageModelsService.lookupLanguageModel(id);
		return metadata?.targetChatSessionType === type;
	});
}

export function hasVisibleByokModelsTargetingSessionType(languageModelsService: ILanguageModelsService, type: string): boolean {
	return languageModelsService.getLanguageModelIds().some(id => {
		const metadata = languageModelsService.lookupLanguageModel(id);
		const byokIdentifier = metadata?.byokModelIdentifier;
		const byokSource = byokIdentifier ? languageModelsService.lookupLanguageModel(byokIdentifier) : undefined;
		return metadata?.targetChatSessionType === type
			&& byokIdentifier !== undefined
			&& byokSource?.isBYOK === true
			&& !languageModelsService.isModelHidden(id)
			&& !languageModelsService.isModelHidden(byokIdentifier);
	});
}

/**
 * The inline description shown for an unavailable session type, or `undefined`
 * when it is available. Free / Student users get an actionable "[Upgrade]"
 * link; paid users with no models get a plain "No models available" note.
 */
export function getSessionTypeUnavailableDescription(availability: SessionTypeAvailability): IMarkdownString | undefined {
	switch (availability) {
		case SessionTypeAvailability.SignInRequired:
			return new MarkdownString(
				localize('chat.sessionType.signInLink', "[Sign in](command:workbench.action.chat.triggerSetup)"),
				{ isTrusted: { enabledCommands: ['workbench.action.chat.triggerSetup'] } }
			);
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
		case SessionTypeAvailability.SignInRequired: {
			const hover = new MarkdownString('', { isTrusted: { enabledCommands: ['workbench.action.chat.triggerSetup'] }, supportThemeIcons: true });
			hover.appendMarkdown(localize('chat.sessionType.signInHover', "[Sign in to GitHub Copilot](command:workbench.action.chat.triggerSetup) to use this agent."));
			return hover;
		}
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
		case SessionTypeAvailability.SignInRequired:
			return localize('chat.sessionType.signInMobile', "Requires sign in");
		case SessionTypeAvailability.UpgradeRequired:
			return localize('chat.sessionType.upgradeMobile', "Requires GitHub Copilot Pro");
		case SessionTypeAvailability.NoModels:
			return localize('chat.sessionType.noModels', "No models available");
		default:
			return undefined;
	}
}
