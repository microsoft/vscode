/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { IObservable, observableFromEvent } from '../../base/common/observable.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../platform/agentHost/common/agentService.js';
import type { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { SessionTypeAuthRequirement } from '../services/sessions/common/session.js';
import type { ISessionsManagementService } from '../services/sessions/common/sessionsManagement.js';

/**
 * Predicates behind the Agents window's conditional authentication — when the
 * window may open for a user who is signed out of GitHub.
 *
 * Two gates, at different altitudes, are easy to confuse:
 *
 * - The **window gate** is the last-resort, window-level block that forces
 *   sign-in before *any* of the sessions UI is shown (backed by
 *   `SessionsWelcomeVisibleContext`). Historically unconditional; it now lifts as
 *   soon as some session type can work without GitHub. Note the *editor* window
 *   is untouched by all of this — its chat-setup modal already offers a "Don't
 *   sign in" escape hatch, and it is that missing escape hatch in the Agents
 *   window (a non-dismissible modal) that this machinery restores conditionally.
 * - The **per-type gate** is the on-demand sign-in surfaced when the user selects
 *   a specific session type that needs GitHub. It already existed
 *   (`getSessionTypeAvailability()` → `SignInRequired`) and still carries most of
 *   the work: once the window is open, each type answers for itself.
 *
 * "Requires GitHub auth" is a property of a session type *at a moment in time*,
 * not a fixed trait — Claude and Codex both move as their own credentials come
 * and go. It is resolved by each provider into
 * {@link SessionTypeAuthRequirement} and read here provider-agnostically.
 */

/**
 * Whether the `chat.agentHost.allowSignedOutWhenUsable` experimentation opt-in
 * is enabled. When off (the default), the conditional-auth feature is dark and
 * every caller behaves as it did before.
 */
export function isAllowSignedOutWhenUsableEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
}

/**
 * How the conditional-auth UI should treat the current default-account snapshot.
 * The crucial distinction is {@link Unresolved}: on startup
 * {@link IDefaultAccountService.currentDefaultAccount} reads `null` for everyone
 * until the first async resolution completes — and that resolution fires no
 * change event. Treating that transient `null` as {@link SignedOut} flashes a
 * sign-in modal / nudge at a signed-in user during the gap, one that nothing then
 * retires. So consumers must ignore the account while {@link Unresolved}.
 */
export const enum ConditionalAuthState {
	/** Not resolved yet — treat as unknown; act on neither the signed-in nor signed-out branch. */
	Unresolved,
	/** Resolved: a GitHub account is signed in. */
	SignedIn,
	/** Resolved: no GitHub account is signed in. */
	SignedOut,
}

/**
 * Collapse "has the account resolved yet?" and "is one signed in?" into the
 * single state the conditional-auth consumers branch on, so neither re-derives it
 * (and neither can independently regress the unresolved-vs-signed-out
 * distinction). `signedIn` must be read from the account snapshot only; this
 * helper decides whether that snapshot can be trusted yet.
 */
export function conditionalAuthState(accountResolved: boolean, signedIn: boolean): ConditionalAuthState {
	if (!accountResolved) {
		return ConditionalAuthState.Unresolved;
	}
	return signedIn ? ConditionalAuthState.SignedIn : ConditionalAuthState.SignedOut;
}

/**
 * Whether a signed-out user can work without GitHub right now: the opt-in is on
 * and some registered session type reports that it runs without a GitHub
 * account (e.g. an agent-host agent that discovered an existing native
 * configuration).
 *
 * The per-type fact is resolved by each provider into
 * {@link ISessionType.authRequirement}, so this stays provider-agnostic. A type
 * that cannot run at all ({@link SessionTypeAuthRequirement.Unusable}) does not
 * count, so a broken agent never holds the window open.
 * The opt-in is re-checked here as well as on the agent host so the setting
 * remains an authoritative kill switch even if a host is still running in a
 * mode it resolved before the setting changed.
 *
 * TODO: this deliberately does NOT reuse `getSessionTypeAvailability`, which the
 * per-type pickers use to answer a related question. Two reasons: that helper
 * lives in `vs/workbench/contrib` and is unreachable from this layer, and its
 * model check cannot detect a credential-less native agent (the Claude SDK's
 * `supportedModels()` is a static catalog). The cost is two predicates that can
 * drift — they already differ over `chatEntitlementService.anonymous`, which the
 * pickers honour and this gate ignores. That divergence is pre-existing (with
 * the opt-in off this collapses to today's always-force-sign-in) but should be
 * converged: have providers resolve availability the same way the pickers do, so
 * both read one derivation.
 */
export function observeUsableWithoutGitHub(
	sessionsManagementService: ISessionsManagementService,
	configurationService: IConfigurationService,
): IObservable<boolean> {
	return observableFromEvent(
		Event.any(
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId)),
			sessionsManagementService.onDidChangeSessionTypes,
		),
		() => isAllowSignedOutWhenUsableEnabled(configurationService)
			&& sessionsManagementService.getAllProviderSessionTypes().some(type => type.sessionType.authRequirement === SessionTypeAuthRequirement.None));
}

/**
 * Inputs to the "discovered your existing <agent> configuration" nudge for a
 * single agent-host session type.
 */
export interface IDiscoveredConfigNudgeContext {
	/** Whether a GitHub account is currently signed in. */
	readonly signedIn: boolean;
	/** The `chat.agentHost.allowSignedOutWhenUsable` experimentation opt-in. */
	readonly allowSignedOutWhenUsable: boolean;
	/**
	 * Whether the agent's session type is usable without GitHub right now — i.e.
	 * its agent discovered an existing native configuration and is running in
	 * native mode rather than the Copilot proxy.
	 */
	readonly usableWithoutGitHub: boolean;
	/**
	 * Whether the user has permanently silenced this nudge via its "Don't Show
	 * Again" affordance. Once muted, the nudge never shows again regardless of
	 * the other inputs.
	 */
	readonly muted: boolean;
}

/**
 * Decides whether to surface the discovered-config nudge for one agent-host
 * session type: shown only to a signed-out user who has opted in, when that
 * type is usable without GitHub right now — the agent found an existing native
 * config, so we let them in and explain how to switch to a Copilot subscription
 * instead. Signed-in users never see it; with the opt-in off, or once the user
 * has muted it, it is always false.
 */
export function shouldShowDiscoveredConfigNudge(context: IDiscoveredConfigNudgeContext): boolean {
	return !context.signedIn && context.allowSignedOutWhenUsable && context.usableWithoutGitHub && !context.muted;
}
