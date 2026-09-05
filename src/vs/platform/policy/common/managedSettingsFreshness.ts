/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ManagedSettingsChannel } from './copilotManagedSettings.js';

/** Lifecycle of the `forceRemoteSettingsRefresh` fail-closed gate. */
export const enum ManagedSettingsFreshnessState {
	/** The control is not effective. */
	NotRequired = 'notRequired',
	/** A fresh response is required and the request has not completed. */
	Pending = 'pending',
	/** A fresh response, including a fresh 404, was received for the current scope. */
	Satisfied = 'satisfied',
	/** The required refresh failed. */
	Blocked = 'blocked',
}

/** Failure categories that require distinct remediation or diagnostics. */
export const enum ManagedSettingsFreshnessFailure {
	NoUrl = 'noUrl',
	NoToken = 'noToken',
	Network = 'network',
	RateLimited = 'rateLimited',
	HttpError = 'httpError',
	/** JSON parsing failed; runtime-owned schema validation is not duplicated here. */
	Malformed = 'malformed',
	UpdateRequired = 'updateRequired',
}

/** Account, provider, and endpoint for which freshness was attempted or satisfied. */
export interface IManagedSettingsFreshnessScope {
	readonly accountId: string;
	readonly authenticationProviderId: string;
	readonly endpointOrigin: string;
}

interface IManagedSettingsFreshnessEffective {
	readonly source: ManagedSettingsChannel;
	readonly scope?: IManagedSettingsFreshnessScope;
	readonly lastAttemptAt?: number;
}

type ManagedSettingsFreshnessBlocked = IManagedSettingsFreshnessEffective
	& { readonly state: ManagedSettingsFreshnessState.Blocked }
	& (
		| { readonly failure: ManagedSettingsFreshnessFailure.HttpError; readonly httpStatus: number }
		| { readonly failure: Exclude<ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessFailure.HttpError> }
	);

/** Observable freshness state shared by fetching, gating, and diagnostics. */
export type IManagedSettingsFreshness =
	| { readonly state: ManagedSettingsFreshnessState.NotRequired }
	| (IManagedSettingsFreshnessEffective & { readonly state: ManagedSettingsFreshnessState.Pending })
	| (IManagedSettingsFreshnessEffective & {
		readonly state: ManagedSettingsFreshnessState.Satisfied;
		readonly scope: IManagedSettingsFreshnessScope;
		readonly satisfiedAt: number;
	})
	| ManagedSettingsFreshnessBlocked;

export const MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED: IManagedSettingsFreshness = { state: ManagedSettingsFreshnessState.NotRequired };

/** Whether AI functionality must be withheld until freshness is established. */
export function isManagedSettingsFreshnessBlocking(freshness: IManagedSettingsFreshness): boolean {
	return freshness.state === ManagedSettingsFreshnessState.Pending
		|| freshness.state === ManagedSettingsFreshnessState.Blocked;
}

function isSameScope(a: IManagedSettingsFreshnessScope, b: IManagedSettingsFreshnessScope): boolean {
	return a.accountId === b.accountId
		&& a.authenticationProviderId === b.authenticationProviderId
		&& a.endpointOrigin === b.endpointOrigin;
}

/** Whether the satisfied result belongs to `scope`. */
export function isManagedSettingsFreshnessSatisfiedFor(freshness: IManagedSettingsFreshness, scope: IManagedSettingsFreshnessScope): boolean {
	return freshness.state === ManagedSettingsFreshnessState.Satisfied
		&& isSameScope(freshness.scope, scope);
}
