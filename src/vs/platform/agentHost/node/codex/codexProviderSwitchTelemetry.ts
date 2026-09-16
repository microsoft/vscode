/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import type { ICodexAccountRateLimitInfo } from '../../common/codexAccount.js';

const MAX_RATE_LIMIT_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const WEEKLY_RATE_LIMIT_WINDOW_MINS = 7 * 24 * 60;

type CodexSubscriptionProvider = 'openai' | 'copilot';

type CodexRateLimitSnapshot = {
	readonly rateLimit: ICodexAccountRateLimitInfo | undefined;
	readonly observedAt: number | undefined;
};

type CodexProviderSwitchEvent = {
	fromProvider: CodexSubscriptionProvider;
	toProvider: CodexSubscriptionProvider;
	isDesktopThread: boolean;
	chatgptWeeklyUsedPercentBucket?: number;
};

type CodexProviderSwitchClassification = {
	fromProvider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous configured subscription provider: openai or copilot.' };
	toProvider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The subscription provider used by the accepted turn: openai or copilot.' };
	isDesktopThread: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether existing native metadata identifies the thread as originating in Codex Desktop, not which client last used it.' };
	chatgptWeeklyUsedPercentBucket?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Latest cached ChatGPT weekly-limit percentage before the turn, rounded down to a 10-percentage-point bucket (0 through 100). Only for the signed-in ChatGPT account and weekly snapshots at most five minutes old and not past a known reset. Omitted when unavailable. Correlates subscription handoffs with quota pressure.' };
	owner: 'Giuspepe';
	comment: 'Counts accepted Codex turns following an OpenAI/Copilot provider switch observed by Agent Host. Does not observe switches performed exclusively in other clients.';
};

export function reportCodexProviderSwitch(telemetryService: ITelemetryService, fromModelProvider: string | undefined, toModelProvider: string | undefined, isDesktopThread: boolean, chatgptRateLimitSnapshot?: CodexRateLimitSnapshot): void {
	const fromProvider = toSubscriptionProvider(fromModelProvider);
	const toProvider = toSubscriptionProvider(toModelProvider);
	if (!fromProvider || !toProvider || fromProvider === toProvider) {
		return;
	}

	const chatgptWeeklyUsedPercentBucket = weeklyUsedPercentBucket(chatgptRateLimitSnapshot);
	telemetryService.publicLog2<CodexProviderSwitchEvent, CodexProviderSwitchClassification>('agentHost.codexProviderSwitch', {
		fromProvider,
		toProvider,
		isDesktopThread,
		...(chatgptWeeklyUsedPercentBucket !== undefined ? { chatgptWeeklyUsedPercentBucket } : {}),
	});
}

function weeklyUsedPercentBucket(snapshot: CodexRateLimitSnapshot | undefined): number | undefined {
	const rateLimit = snapshot?.rateLimit;
	const observedAt = snapshot?.observedAt;
	const now = Date.now();
	if (!rateLimit || observedAt === undefined || !Number.isFinite(observedAt)
		|| observedAt > now || now - observedAt > MAX_RATE_LIMIT_SNAPSHOT_AGE_MS
		|| rateLimit.windowDurationMins !== WEEKLY_RATE_LIMIT_WINDOW_MINS
		|| !Number.isFinite(rateLimit.usedPercent) || rateLimit.usedPercent < 0 || rateLimit.usedPercent > 100
		|| (rateLimit.resetsAt !== undefined && (!Number.isFinite(rateLimit.resetsAt) || rateLimit.resetsAt * 1000 <= now))) {
		return undefined;
	}
	return Math.floor(rateLimit.usedPercent / 10) * 10;
}

function toSubscriptionProvider(modelProvider: string | undefined): CodexSubscriptionProvider | undefined {
	switch (modelProvider) {
		case 'openai':
			return 'openai';
		case 'vscode-proxy':
			return 'copilot';
		default:
			return undefined;
	}
}
