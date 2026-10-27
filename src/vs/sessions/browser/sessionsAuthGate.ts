/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from '../../base/common/platform.js';
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
 *   on desktop when at least one registered session type does not
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
 * therefore use the live requirements to determine whether a provider can run signed out.
 */

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

export function resolveSignedOutWindowGate(authRequirements: readonly SessionTypeAuthRequirement[], canInitializeWithoutGitHub = false): SignedOutWindowGate {
	if (canInitializeWithoutGitHub) {
		return authRequirements.length === 0 ? SignedOutWindowGate.Unresolved : SignedOutWindowGate.Proceed;
	}
	if (isWeb) {
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
export function shouldShowGitHubWorkspaceGroupSignIn(signedIn: boolean): boolean {
	return !signedIn && !isWeb;
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
