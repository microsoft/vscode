/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

export type AgentsChatPartAction = 'open' | 'close' | 'restore';

type AgentsChatPartEvent = {
	action: AgentsChatPartAction;
	tabCount: number;
};

type AgentsChatPartClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What happened: the chat part opened, closed or restored after a reload.' };
	tabCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many chat tabs the chat part has after the action.' };
	owner: 'sandy081';
	comment: 'Tracks how the chat part beside the editor area of an editor window with the Sessions view is used.';
};

export function logAgentsChatPartAction(telemetryService: ITelemetryService, action: AgentsChatPartAction, tabCount: number): void {
	telemetryService.publicLog2<AgentsChatPartEvent, AgentsChatPartClassification>('agentsView.chatPart', { action, tabCount });
}
