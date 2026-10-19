/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import type { IAgentHostEventClassification, IAgentHostEventTelemetry } from '../agentHostTelemetryReporter.js';

export type CopilotSessionRefreshReason = 'workingDirectoryChanged' | 'primaryDirectoryChanged' | 'hydraFusionModelChanged' | 'telemetryRevoked' | 'additionalDirectoriesChanged' | 'clientPluginsChanged' | 'rootMcpServersChanged' | 'clientToolsChanged' | 'disabledRootMcpServersChanged' | 'mcpLaunchConfigurationRefresh' | 'controlPlaneResync' | 'ownerChanged';
export type CopilotRuntimeMutation = 'sandboxUpdate' | 'mcpEnable' | 'mcpDisable' | 'agentSelect' | 'userRequested' | 'extensionsReload' | 'customizationsChanged';
type CopilotRuntimeRestartPhase = 'turnPrepare' | 'inTurn' | 'idle';

type CopilotRuntimeRestartEvent = IAgentHostEventTelemetry & {
	kind: 'sdkSession' | 'mcpServer';
	cause: CopilotSessionRefreshReason | CopilotRuntimeMutation | 'runtime';
	firstTurn: boolean;
	phase: CopilotRuntimeRestartPhase;
	agentSessionId: string;
	chatSessionId: string;
	turnId: string | undefined;
	sdkSessionId: string;
};

type CopilotRuntimeRestartClassification = IAgentHostEventClassification & {
	owner: 'connor4312';
	comment: 'Tracks host SDK session relaunches and observed MCP server restarts, with bounded mutation attribution.';
	kind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether an SDK session or an MCP server restarted.' };
	cause: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded configuration refresh reason or most recent host mutation since this server started; runtime when none occurred.' };
	firstTurn: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the chat has no completed turn at the restart.' };
	phase: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the restart occurred during turn preparation, after SDK turn start, or while idle.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host chat identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The active host turn identifier, when available.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK session identifier.' };
};

export async function reportCopilotRuntimeRestart(telemetryService: ITelemetryService, event: CopilotRuntimeRestartEvent, completedTurnHistory?: Promise<boolean>): Promise<void> {
	if (event.firstTurn && completedTurnHistory) {
		try {
			event = { ...event, firstTurn: !await completedTurnHistory };
		} catch {
			// Retain observed completion state if persisted history is unavailable.
		}
	}
	telemetryService.publicLog2<CopilotRuntimeRestartEvent, CopilotRuntimeRestartClassification>('agentHost.copilot.runtimeRestart', event);
}
