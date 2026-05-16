/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import type { MessageAttachment } from '../common/state/protocol/state.js';

export type AgentHostUserMessageSentSource = 'direct' | 'queued';

export interface IAgentHostUserMessageSentEvent {
	provider: string;
	source: AgentHostUserMessageSentSource;
	hasAttachments: boolean;
	attachmentCount: number;
}

export type IAgentHostUserMessageSentClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user message was sent directly or from the queued-message flow.' };
	hasAttachments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user message included attachments.' };
	attachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of attachments included with the user message.' };
	owner: 'roblourens';
	comment: 'Tracks user messages sent from the agent host process to an agent provider.';
};

export class AgentHostTelemetryReporter {

	constructor(private readonly _telemetryService: ITelemetryService) { }

	userMessageSent(provider: string, source: AgentHostUserMessageSentSource, attachments: readonly MessageAttachment[] | undefined): void {
		const attachmentCount = attachments?.length ?? 0;
		this._telemetryService.publicLog2<IAgentHostUserMessageSentEvent, IAgentHostUserMessageSentClassification>('agentHostUserMessageSent', {
			provider,
			source,
			hasAttachments: attachmentCount > 0,
			attachmentCount,
		});
	}
}
