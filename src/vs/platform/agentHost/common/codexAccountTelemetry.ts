/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Bounded account context captured at Codex turn start, independent of the turn's model provider. */
export interface ICodexAccountTelemetry {
	readonly chatgptAccountState: 'signedIn' | 'notSignedIn' | 'unknown';
	readonly chatgptPlanTier?: 'free' | 'go' | 'plus' | 'pro' | 'business' | 'enterprise' | 'edu' | 'unknown';
	readonly chatgptWeeklyQuotaState: 'available' | 'unavailable' | 'missing' | 'nonWeekly' | 'stale' | 'expired' | 'invalid';
	readonly chatgptWeeklyUsedPercentBucket?: number;
}

export type CodexAccountTelemetryClassification = {
	chatgptAccountState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Cached ChatGPT account state at Codex turn start: signedIn, notSignedIn, or unknown. Describes the account, not the provider funding the turn.' };
	chatgptPlanTier?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Public ChatGPT plan family at Codex turn start: free, go, plus, pro, business, enterprise, edu, or unknown. Backend variants are coarsened; omitted unless the cached account is signed in with ChatGPT.' };
	chatgptWeeklyQuotaState?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Validity of the cached Codex ChatGPT weekly snapshot at turn start: available, unavailable, missing, nonWeekly, stale, expired, or invalid.' };
	chatgptWeeklyUsedPercentBucket?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cached ChatGPT weekly-limit percentage at Codex turn start, rounded down to a 10-point bucket from 0 through 100. Only for signed-in ChatGPT accounts with valid exact-weekly snapshots at most five minutes old and not past a known reset; otherwise omitted.' };
};
