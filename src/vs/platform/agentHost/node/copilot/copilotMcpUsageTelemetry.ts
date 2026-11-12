/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import type { ToolCallResult } from '../../common/state/sessionState.js';
import { deriveToolInvokedResult } from '../agentHostToolCallTracker.js';
import type { IAgentHostEventClassification } from '../agentHostTelemetryReporter.js';
import type { CopilotSessionFailureCorrelation } from './copilotFailureTelemetry.js';

interface IMcpUsageContext extends CopilotSessionFailureCorrelation {
	turnId: string;
	routingEnabled: boolean;
	toolSearchActive: boolean;
	configuredServerCount: number;
}

type McpUsageContextClassification = IAgentHostEventClassification & {
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing owning agent session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing chat telemetry identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Host turn identifier for joining start and completion.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing SDK session identifier.' };
	routingEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Routing setting captured by the running Copilot session, not a later configuration value or experiment assignment.' };
	toolSearchActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether tool search was active when the turn started.' };
	configuredServerCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Configured non-launch-disabled MCP servers and discovered Connectors at turn start, computed identically in both arms. Not a count of connected servers or user intent.' };
};

type McpUsageStartedClassification = McpUsageContextClassification & {
	owner: 'connor4312';
	comment: 'Arm-independent denominator for Copilot MCP routing comparisons, including turns with no MCP activity. Routing state describes effective behavior, not random assignment.';
};

type McpUsageCounts = {
	mcpToolCalls: number;
	mcpToolSuccesses: number;
	mcpToolErrors: number;
	mcpToolCancellations: number;
	routingToolCalls: number;
	routingToolSuccesses: number;
	routingToolErrors: number;
	routingToolCancellations: number;
	searches: number;
	searchesReturningRoutingTools: number;
};

type McpUsageCompletedEvent = IMcpUsageContext & McpUsageCounts & {
	result: 'success' | 'cancelled' | 'failed' | 'interrupted';
	serversUsed: number;
};

type McpUsageCompletedClassification = McpUsageContextClassification & {
	owner: 'aeschli';
	comment: 'Observed MCP activity within one live Copilot root turn, including child activity observed during that turn. Routing proxies never count as real MCP use; unfinished calls remain in starts but not outcomes. No server names, URLs, tool names, prompts or credentials are emitted.';
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Turn outcome, or interrupted if its tracker was disposed without a terminal outcome. Process crashes can leave starts without completions.' };
	mcpToolCalls: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Distinct real MCP tool calls started during the turn, excluding routing proxies.' };
	mcpToolSuccesses: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Real MCP calls observed completing successfully.' };
	mcpToolErrors: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Real MCP calls observed completing with an error.' };
	mcpToolCancellations: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Real MCP calls completed with a rejected, denied or cancelled error code, not necessarily authentication cancellation.' };
	routingToolCalls: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Distinct routing proxy calls started during the turn.' };
	routingToolSuccesses: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Routing proxy calls completed successfully, not evidence that a real MCP tool was used.' };
	routingToolErrors: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Routing proxy calls completed with an error.' };
	routingToolCancellations: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Routing proxy calls completed with a rejected, denied or cancelled error code.' };
	searches: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Observed successful host-overridden tool searches, including empty results.' };
	searchesReturningRoutingTools: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Successful host-overridden searches returning at least one registered routing proxy.' };
	serversUsed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Distinct servers with at least one successful real MCP call during this turn. Server identities remain in memory only.' };
};

/** Owns one turn's bounded-lifetime counters; a proxy connection is never counted as real MCP use. */
export class CopilotMcpUsageTelemetry extends Disposable {
	private readonly _calls = new Map<string, { serverName: string; routing: boolean; completed: boolean }>();
	private readonly _usedServers = new Set<string>();
	private readonly _counts: McpUsageCounts = {
		mcpToolCalls: 0, mcpToolSuccesses: 0, mcpToolErrors: 0, mcpToolCancellations: 0,
		routingToolCalls: 0, routingToolSuccesses: 0, routingToolErrors: 0, routingToolCancellations: 0,
		searches: 0, searchesReturningRoutingTools: 0,
	};
	private _completed = false;

	constructor(private readonly _context: IMcpUsageContext, private readonly _telemetryService: ITelemetryService) {
		super();
		this._telemetryService.publicLog2<IMcpUsageContext, McpUsageStartedClassification>('agentHost.mcpUsageStarted', { ...this._context });
	}

	recordToolStart(toolCallId: string, serverName: string, routing: boolean): void {
		if (this._completed || this._calls.has(toolCallId)) {
			return;
		}
		this._calls.set(toolCallId, { serverName, routing, completed: false });
		this._counts[routing ? 'routingToolCalls' : 'mcpToolCalls']++;
	}

	recordToolComplete(toolCallId: string, result: ToolCallResult): void {
		const call = this._calls.get(toolCallId);
		if (this._completed || !call || call.completed) {
			return;
		}
		call.completed = true;
		const outcome = deriveToolInvokedResult(result);
		if (outcome === 'success') {
			this._counts[call.routing ? 'routingToolSuccesses' : 'mcpToolSuccesses']++;
			if (!call.routing) {
				this._usedServers.add(call.serverName);
			}
		} else if (outcome === 'userCancelled') {
			this._counts[call.routing ? 'routingToolCancellations' : 'mcpToolCancellations']++;
		} else {
			this._counts[call.routing ? 'routingToolErrors' : 'mcpToolErrors']++;
		}
	}

	recordSearch(returnedRoutingTool: boolean): void {
		if (!this._completed) {
			this._counts.searches++;
			if (returnedRoutingTool) {
				this._counts.searchesReturningRoutingTools++;
			}
		}
	}

	complete(result: McpUsageCompletedEvent['result']): void {
		if (this._completed) {
			return;
		}
		this._completed = true;
		this._telemetryService.publicLog2<McpUsageCompletedEvent, McpUsageCompletedClassification>('agentHost.mcpUsageCompleted', {
			...this._context,
			...this._counts,
			result,
			serversUsed: this._usedServers.size,
		});
		this._calls.clear();
		this._usedServers.clear();
	}

	override dispose(): void {
		this.complete('interrupted');
		super.dispose();
	}
}

type McpAuthenticationEvent = CopilotSessionFailureCorrelation & {
	routingEnabled: boolean;
	requestId: string;
	hasToolCall: boolean;
	result: 'tokenProvided' | 'runtimeRefresh' | 'cancelled' | 'unhandled' | 'failed';
	durationMs: number;
};

type McpAuthenticationClassification = IAgentHostEventClassification & {
	owner: 'connor4312';
	comment: 'Settled Copilot MCP authentication callbacks, including background requests in both routing arms. Token delivery is not verified sign-in; cancellation may come from turn/session teardown rather than an explicit user action.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing owning agent session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing chat telemetry identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Host turn when the callback began, absent for background authentication.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing SDK session identifier.' };
	routingEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Routing setting captured by the running session.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque SDK authentication request identifier.' };
	hasToolCall: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the callback began with a related active MCP or routing tool call.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Token provided to the runtime, runtime refresh requested, callback cancelled, unhandled (including disabled servers), or failed. Neither token delivery nor refresh is server acceptance.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed time of the authentication callback in milliseconds.' };
};

export function reportCopilotMcpAuthentication(telemetryService: ITelemetryService, event: McpAuthenticationEvent): void {
	telemetryService.publicLog2<McpAuthenticationEvent, McpAuthenticationClassification>('agentHost.mcpAuthentication', event);
}
