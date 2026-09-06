/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatMode, getModeNameForTelemetry } from './chatModes.js';
import { isInClaudeAgentsFolder } from './promptSyntax/config/promptFileLocations.js';

type ChatModeChangeClassification = {
	owner: 'digitarald';
	comment: 'Reporting when agent is switched between different modes';
	fromMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous agent name' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new agent name' };
	requestCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of requests in the current chat session'; isMeasurement: true };
	storage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Source of the target mode (builtin, local, user, extension)' };
	extensionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extension ID if the target mode is from an extension' };
	toolsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of custom tools in the target mode'; isMeasurement: true };
	handoffsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of handoffs in the target mode'; isMeasurement: true };
	isClaudeAgent?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the target mode is a Claude agent file from .claude/agents/' };
};

type ChatModeChangeEvent = {
	fromMode: string;
	mode: string;
	requestCount: number;
	storage: string;
	extensionId?: string;
	toolsCount: number;
	handoffsCount: number;
	isClaudeAgent?: boolean;
};

export function reportChatModeChange(telemetryService: ITelemetryService, currentMode: IChatMode, targetMode: IChatMode, requestCount: number): void {
	if (currentMode.id === targetMode.id) {
		return;
	}

	const storage = targetMode.source?.storage ?? 'builtin';
	const extensionId = targetMode.source?.storage === 'extension' ? targetMode.source.extensionId.value : undefined;
	const modeUri = targetMode.uri?.get();

	telemetryService.publicLog2<ChatModeChangeEvent, ChatModeChangeClassification>('chat.modeChange', {
		fromMode: getModeNameForTelemetry(currentMode),
		mode: getModeNameForTelemetry(targetMode),
		requestCount,
		storage,
		extensionId,
		toolsCount: targetMode.customTools?.get()?.length ?? 0,
		handoffsCount: targetMode.handOffs?.get()?.length ?? 0,
		isClaudeAgent: modeUri ? isInClaudeAgentsFolder(modeUri) : undefined,
	});
}
