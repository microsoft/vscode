/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vocabulary for the `forceRemoteSettingsRefresh` fail-closed startup gate.
 *
 * When an administrator makes that control effective, a *freshly fetched* managed-settings response
 * is required before Copilot agent functionality may be enabled. Cached policy — including a cached
 * "confirmed no policy" — deliberately cannot satisfy the requirement, so this vocabulary is kept
 * separate from the ordinary managed-settings cache in `copilotManagedSettings.ts`.
 *
 * This module is intentionally pure: it declares the state machine shared by the fetch path, the
 * policy gate and the diagnostics report so those consumers cannot drift apart. It performs no I/O
 * and holds no mutable state; the authoritative fetch state lives with the default-account provider.
 */

import type { ManagedSettingsChannel } from './copilotManagedSettings.js';

/** Lifecycle of the fail-closed freshness requirement. */
export const enum ManagedSettingsFreshnessState {
	/**
	 * The control is not effective, so ordinary fail-open delivery applies. This is the default and
	 * must remain behaviourally identical to having no freshness gate at all.
	 */
	NotRequired = 'notRequired',

	/**
	 * The control is effective and applicability is known, but no fresh response has been received
	 * yet. Gates like {@link Blocked}; the two differ only in remediation UX. Every `Pending` must
	 * reach {@link Satisfied} or {@link Blocked} within a bounded time so it cannot gate forever.
	 */
	Pending = 'pending',

	/**
	 * A fresh, successful server response was received for the current scope in this process.
	 *
	 * A freshly served "no policy configured" (HTTP 404) is a success: it confirms current server
	 * state. Only a *cached* confirmed-no-policy is disallowed, so treating a fresh 404 as a failure
	 * would permanently gate every organization that has no managed-settings file.
	 */
	Satisfied = 'satisfied',

	/**
	 * The control is effective but freshness could not be established. Every inability to refresh
	 * resolves here, so no failure mode silently degrades to fail-open.
	 */
	Blocked = 'blocked',
}

/**
 * Why freshness could not be established. Categories are distinguished only where a consumer must
 * behave differently — remediation UX and diagnostics — not for reporting granularity alone.
 */
export const enum ManagedSettingsFreshnessFailure {
	/** No managed-settings endpoint is configured, so no fetch can be attempted. */
	NoUrl = 'noUrl',

	/**
	 * No authenticated session is available, so no fetch can be attempted. Reached without issuing a
	 * request; the remediation is signing in, which is why authentication flows stay exempt from the
	 * gate. Without that exemption this state would be an unrecoverable lockout.
	 */
	NoToken = 'noToken',

	/** The request failed to produce a response: offline, DNS/TLS failure, or timeout. */
	Network = 'network',

	/**
	 * A shared rate-limit backoff is active, so the request was short-circuited before reaching the
	 * network. Distinct from {@link Network} because an immediate retry would add pressure while the
	 * service is throttling requests.
	 */
	RateLimited = 'rateLimited',

	/** The server returned a non-success status that is neither a 404 nor the update-required code. */
	HttpError = 'httpError',

	/**
	 * The response body could not be parsed as JSON.
	 *
	 * Scope note: this covers parse failure only. Deeper schema validation is deliberately *not*
	 * performed here — the Copilot runtime owns the managed-settings schema, and re-implementing that
	 * validation in VS Code would duplicate a runtime security decision.
	 */
	Malformed = 'malformed',

	/**
	 * The client is too old to enforce the effective managed settings (HTTP 466). Already fail-closed
	 * via the compatibility-error path; represented here so diagnostics report one freshness story.
	 */
	UpdateRequired = 'updateRequired',
}

/**
 * The scope a {@link ManagedSettingsFreshnessState.Satisfied} result belongs to.
 *
 * Managed settings are fetched per account against a specific endpoint, while native MDM is
 * machine-scoped. Satisfaction must therefore never be a process-wide flag: a response fetched for
 * one account or GitHub Enterprise host says nothing about another, and an unkeyed result would let
 * an account switch or sign-out silently inherit someone else's satisfied gate.
 */
export interface IManagedSettingsFreshnessScope {
	/** Account the managed-settings response was fetched for. */
	readonly accountId: string;
	/** Authentication provider that supplied the session. */
	readonly authenticationProviderId: string;
	/** Origin of the managed-settings endpoint, distinguishing github.com from a GHE host. */
	readonly endpointOrigin: string;
}

/** Common shape of the states reached only once the control is known to be effective. */
interface IManagedSettingsFreshnessEffective {
	/**
	 * Channel that made the control effective, so diagnostics can name the delivery channel
	 * responsible for a closed gate. Never `'none'`: these states are reached only when a channel
	 * supplies the control.
	 */
	readonly source: ManagedSettingsChannel;
	/** When a refresh was last attempted, for diagnostics. */
	readonly lastAttemptAt?: number;
}

/**
 * A failed refresh, carrying exactly the detail its category defines: a status code for an HTTP
 * error and a backoff deadline for rate limiting, neither of which is meaningful for the others.
 */
type ManagedSettingsFreshnessBlocked = IManagedSettingsFreshnessEffective
	& { readonly state: ManagedSettingsFreshnessState.Blocked }
	& (
		| { readonly failure: ManagedSettingsFreshnessFailure.HttpError; readonly httpStatus: number }
		| { readonly failure: Exclude<ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessFailure.HttpError> }
	);

/**
 * Observable freshness state, including what diagnostics must report.
 *
 * Modelled as a discriminated union so the state machine's invariants are enforced by the compiler
 * rather than by convention: the fetch path cannot report a block without a cause, or a satisfied
 * result without the scope that makes it non-transferable.
 */
export type IManagedSettingsFreshness =
	| { readonly state: ManagedSettingsFreshnessState.NotRequired }
	| (IManagedSettingsFreshnessEffective & { readonly state: ManagedSettingsFreshnessState.Pending })
	| (IManagedSettingsFreshnessEffective & {
		readonly state: ManagedSettingsFreshnessState.Satisfied;
		readonly scope: IManagedSettingsFreshnessScope;
		readonly satisfiedAt: number;
	})
	| ManagedSettingsFreshnessBlocked;

/** The initial state: no freshness requirement observed. */
export const MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED: IManagedSettingsFreshness = { state: ManagedSettingsFreshnessState.NotRequired };

/**
 * Whether Copilot agent functionality must be withheld.
 *
 * Both {@link ManagedSettingsFreshnessState.Pending} and {@link ManagedSettingsFreshnessState.Blocked}
 * gate: the contract is to withhold agent functionality *until* a fresh response arrives, so an
 * unresolved refresh must never be treated as permission to proceed.
 */
export function isManagedSettingsFreshnessBlocking(freshness: IManagedSettingsFreshness): boolean {
	return freshness.state === ManagedSettingsFreshnessState.Pending
		|| freshness.state === ManagedSettingsFreshnessState.Blocked;
}

function isSameScope(a: IManagedSettingsFreshnessScope, b: IManagedSettingsFreshnessScope): boolean {
	return a.accountId === b.accountId
		&& a.authenticationProviderId === b.authenticationProviderId
		&& a.endpointOrigin === b.endpointOrigin;
}

/**
 * Whether an existing freshness result still satisfies the gate for `scope`.
 *
 * Satisfaction is not transferable: a result for a different account, provider or endpoint must be
 * re-established rather than inherited, which is what makes sign-out and account switching close the
 * gate again instead of silently reusing the previous account's success.
 */
export function isManagedSettingsFreshnessSatisfiedFor(freshness: IManagedSettingsFreshness, scope: IManagedSettingsFreshnessScope): boolean {
	return freshness.state === ManagedSettingsFreshnessState.Satisfied
		&& isSameScope(freshness.scope, scope);
}
