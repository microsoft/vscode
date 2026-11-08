/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';

export type AgentHostAuthTrigger = 'hostChallenge' | 'sessionCreation';
type AuthSessionMatch = 'exact' | 'superset' | 'none' | 'unavailable';

type AuthRecoveryEvent = {
	trigger: AgentHostAuthTrigger;
	action: 'noSession' | 'defer' | 'forwardCurrent' | 'forwardAlternative' | 'prompt';
	initialSessionMatch: AuthSessionMatch;
	quarantinePresent: boolean;
	windowAgeMs: number;
};

type AuthRecoveryClassification = {
	owner: 'TylerLeonhardt';
	comment: 'Records Agent Host credential recovery decisions, not whether the remote service accepted a credential.';
	trigger: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether authentication was requested by a host challenge or session creation.' };
	action: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The recovery action. Prompt means setup was requested, not that a distinct dialog was displayed.' };
	initialSessionMatch: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How the initial session lookup matched the required scopes, or why no session resolved.' };
	quarantinePresent: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether a rejected session was cached when this lookup began.' };
	windowAgeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since the current renderer time origin, to distinguish startup from later recovery.' };
};

export type AgentHostAuthSignInData = {
	trigger: AgentHostAuthTrigger;
	result: 'cancelled' | 'failed' | 'noSessionResolved' | 'tokenForwarded' | 'deduplicated' | 'superseded';
	credentialChanged: boolean | undefined;
	sessionMatch: AuthSessionMatch | undefined;
};

type AuthSignInResultEvent = AgentHostAuthSignInData & { durationMs: number };

type AuthSignInResultClassification = {
	owner: 'TylerLeonhardt';
	comment: 'Records the result of interactive Agent Host sign-in without treating token forwarding as verified authentication.';
	trigger: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether sign-in followed a host challenge or session creation.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether sign-in was cancelled, failed, superseded, lacked a session, or forwarded or deduplicated a token.' };
	credentialChanged: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the selected credential differs from the challenged credential. Omitted when there was no prior credential or no selected session.' };
	sessionMatch: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How the post-sign-in lookup matched the required scopes. Omitted when lookup was not reached.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the interactive sign-in operation in milliseconds.' };
};

export function reportAgentHostAuthRecovery(telemetryService: ITelemetryService, data: Omit<AuthRecoveryEvent, 'windowAgeMs'>): void {
	telemetryService.publicLog2<AuthRecoveryEvent, AuthRecoveryClassification>('agentHost.authRecovery', {
		trigger: data.trigger,
		action: data.action,
		initialSessionMatch: data.initialSessionMatch,
		quarantinePresent: data.quarantinePresent,
		windowAgeMs: Math.round(performance.now()),
	});
}

export function reportAgentHostAuthSignInResult(telemetryService: ITelemetryService, data: AgentHostAuthSignInData, durationMs: number): void {
	telemetryService.publicLog2<AuthSignInResultEvent, AuthSignInResultClassification>('agentHost.authSignInResult', {
		trigger: data.trigger,
		result: data.result,
		credentialChanged: data.credentialChanged,
		sessionMatch: data.sessionMatch,
		durationMs: Math.round(durationMs),
	});
}
