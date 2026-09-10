/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';

type CodexSubscriptionProvider = 'openai' | 'copilot';

type CodexProviderSwitchEvent = {
	fromProvider: CodexSubscriptionProvider;
	toProvider: CodexSubscriptionProvider;
	isDesktopThread: boolean;
};

type CodexProviderSwitchClassification = {
	fromProvider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous configured subscription provider: openai or copilot.' };
	toProvider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The subscription provider used by the accepted turn: openai or copilot.' };
	isDesktopThread: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether existing native metadata identifies the thread as originating in Codex Desktop, not which client last used it.' };
	owner: 'Giuspepe';
	comment: 'Counts accepted Codex turns following an OpenAI/Copilot provider switch observed by Agent Host. Does not observe switches performed exclusively in other clients.';
};

export function reportCodexProviderSwitch(telemetryService: ITelemetryService, fromModelProvider: string | undefined, toModelProvider: string | undefined, isDesktopThread: boolean): void {
	const fromProvider = toSubscriptionProvider(fromModelProvider);
	const toProvider = toSubscriptionProvider(toModelProvider);
	if (!fromProvider || !toProvider || fromProvider === toProvider) {
		return;
	}

	telemetryService.publicLog2<CodexProviderSwitchEvent, CodexProviderSwitchClassification>('agentHost.codexProviderSwitch', {
		fromProvider,
		toProvider,
		isDesktopThread,
	});
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
