/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { packErrorForTelemetry } from '../../telemetry/common/errorTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

export type AgentHostProcessErrorData = {
	kind: 'unexpectedExit' | 'startFailed';
	code?: number;
	restartCount: number;
	willRestart: boolean;
};

type AgentHostProcessErrorEvent = AgentHostProcessErrorData & {
	isError: true;
	callstack?: string;
	msg?: string;
};

type AgentHostProcessErrorClassification = {
	kind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of agent host process failure.' };
	code?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The agent host process exit code, when available.' };
	restartCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The number of agent host restart attempts before this failure.' };
	willRestart: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether VS Code will attempt to restart the agent host after this failure.' };
	isError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this is an error event.' };
	callstack?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The callstack of an agent host process start failure.' };
	msg?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The message of an agent host process start failure.' };
	owner: 'bryanchen-d';
	comment: 'Tracks agent host process failures that cannot be reported reliably from inside the agent host process.';
};

export function reportAgentHostProcessError(telemetryService: ITelemetryService, data: AgentHostProcessErrorData, error?: unknown): void {
	const errorData = error === undefined ? undefined : packErrorForTelemetry(error);
	telemetryService.publicLogError2<AgentHostProcessErrorEvent, AgentHostProcessErrorClassification>('agentHost.processError', {
		...data,
		isError: true,
		...(errorData ? { callstack: errorData.callstack, msg: errorData.msg } : {}),
	});
}
