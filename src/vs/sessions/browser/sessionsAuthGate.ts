/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { IObservable, observableFromEvent } from '../../base/common/observable.js';
import { isWeb } from '../../base/common/platform.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../platform/agentHost/common/agentService.js';
import type { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { SessionTypeAuthRequirement } from '../services/sessions/common/session.js';

/**
 * Predicates behind the Agents window's conditional authentication — when the
 * window may open for a user who is signed out of GitHub.
 *
 * Two gates, at different altitudes, are easy to confuse:
 *
 * - The **window gate** is the last-resort, window-level block that forces
 *   sign-in before *any* of the sessions UI is shown (backed by
 *   `SessionsWelcomeVisibleContext`). Historically unconditional; it now lifts
 *   when the opt-in is enabled and at least one registered session type does not
 *   require GitHub. Note the *editor* window is untouched by all of this — its
 *   chat-setup modal already offers a "Don't sign in" escape hatch, and it is
 *   that missing escape hatch in the Agents window (a non-dismissible modal) that
 *   this machinery restores conditionally.
 * - The **per-type gate** is the on-demand sign-in surfaced when the user selects
 *   a specific session type that needs GitHub. It already existed
 *   (`getSessionTypeAvailability()` → `SignInRequired`) and carries the actual
 *   work: once the window is open, each type answers for itself.
 *
 * Session types update as native credentials come and go. The window gate must
 * therefore use the live requirements rather than treating the experimentation
 * opt-in itself as proof that a provider can run signed out.
 */

/**
 * Whether the `chat.agentHost.allowSignedOutWhenUsable` experimentation opt-in
 * is enabled in a desktop window. Web always requires sign-in.
 */
export function isAllowSignedOutWhenUsableEnabled(configurationService: IConfigurationService): boolean {
	return !isWeb && configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
}

/**
 * The **window gate**: whether the Agents window must force GitHub sign-in before
 * showing any of the sessions UI. It remains unresolved until providers publish
 * at least one session type.
 */
export const enum SignedOutWindowGate {
	/** Providers have not advertised any session types yet. */
	Unresolved,
	/** At least one type can operate without GitHub sign-in. */
	Proceed,
	/** Every advertised type requires GitHub sign-in. */
	ForceGitHubSignIn,
}

export function resolveSignedOutWindowGate(allowSignedOutWhenUsable: boolean, authRequirements: readonly SessionTypeAuthRequirement[]): SignedOutWindowGate {
	if (!allowSignedOutWhenUsable) {
		return SignedOutWindowGate.ForceGitHubSignIn;
	}
	if (authRequirements.length === 0) {
		return SignedOutWindowGate.Unresolved;
	}
	return authRequirements.some(requirement => requirement !== SessionTypeAuthRequirement.GitHub)
		? SignedOutWindowGate.Proceed
		: SignedOutWindowGate.ForceGitHubSignIn;
}

/** Whether the GitHub workspace group should offer sign-in. */
export function shouldShowGitHubWorkspaceGroupSignIn(signedIn: boolean, allowSignedOutWhenUsable: boolean): boolean {
	return !signedIn && allowSignedOutWhenUsable;
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
 * Observe the setting that permits the Agents window to proceed without forcing
 * GitHub sign-in when a session type can operate that way.
 */
export function observeAllowSignedOutWhenUsable(configurationService: IConfigurationService): IObservable<boolean> {
	return observableFromEvent(
		Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId)),
		() => isAllowSignedOutWhenUsableEnabled(configurationService));
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
	 * Whether the user has already dismissed this nudge, which silences it for
	 * good. Once muted, the nudge never shows again regardless of the other
	 * inputs.
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
