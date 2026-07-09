/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IPostToolUseHookResult, IPreToolUseHookResult } from '../../../platform/chat/common/chatHookService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';

export class ChatHookTelemetry {
	constructor(
		private readonly _telemetryService: ITelemetryService,
	) { }

	logConfiguredHooks(hooks: vscode.ChatRequestHooks): void {
		const hookTypeCounts: Record<string, number> = {};
		let totalHookCount = 0;
		for (const hookType of Object.keys(hooks)) {
			const commands = hooks[hookType];
			if (commands && commands.length > 0) {
				hookTypeCounts[hookType] = commands.length;
				totalHookCount += commands.length;
			}
		}

		if (totalHookCount === 0) {
			return;
		}

		/* __GDPR__
			"hooks.configured" : {
				"owner": "roblourens",
				"comment": "Reports which hook types are configured for a chat request",
				"hookTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "JSON map of hook type names to their command counts" },
				"totalHookCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of hook commands configured across all types" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('hooks.configured', {
			hookTypes: JSON.stringify(hookTypeCounts),
		}, {
			totalHookCount,
		});
	}

	logHookExecuted(hookType: string, hookCount: number, durationMs: number, hasError: boolean, hasCaughtException: boolean): void {
		/* __GDPR__
			"hooks.executed" : {
				"owner": "roblourens",
				"comment": "Reports the execution of hooks including duration and outcome",
				"hookType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of hook that was executed (e.g., PreToolUse, PostToolUse, Stop)" },
				"hookCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of hook commands executed for this hook type" },
				"hasError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether any hook command returned an error exit code" },
				"hasCaughtException": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether an unexpected exception was caught during hook execution" },
				"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Total duration of all hook executions in milliseconds" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('hooks.executed', {
			hookType,
			hasError: String(hasError),
			hasCaughtException: String(hasCaughtException),
		}, {
			hookCount,
			durationMs,
		});
	}

	logPreToolUseResult(result: IPreToolUseHookResult): void {
		/* __GDPR__
			"hooks.preToolUse.result" : {
				"owner": "roblourens",
				"comment": "Reports the collapsed result of PreToolUse hooks including whether the tool was blocked",
				"permissionDecision": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The most restrictive permission decision: allow, deny, or ask" },
				"hasUpdatedInput": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a hook modified the tool input" },
				"hasAdditionalContext": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether hooks provided additional context" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('hooks.preToolUse.result', {
			permissionDecision: result.permissionDecision,
			hasUpdatedInput: result.updatedInput ? 'true' : undefined,
			hasAdditionalContext: result.additionalContext ? 'true' : undefined,
		});
	}

	logPostToolUseResult(result: IPostToolUseHookResult): void {
		/* __GDPR__
			"hooks.postToolUse.result" : {
				"owner": "roblourens",
				"comment": "Reports the collapsed result of PostToolUse hooks including whether the tool result was blocked",
				"didBlock": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether any hook blocked the tool result" },
				"hasAdditionalContext": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether hooks provided additional context" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('hooks.postToolUse.result', {
			didBlock: result.decision === 'block' ? 'true' : undefined,
			hasAdditionalContext: result.additionalContext ? 'true' : undefined,
		});
	}
}
