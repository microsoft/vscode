/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { parseAgentHostAutomationResult, type IAgentHostAutomationResult } from '../../common/meta/agentHostAutomationsMeta.js';
import type { IServerToolExecutionContext, IServerToolGroup } from './agentServerToolHost.js';

export const reportAutomationResultToolName = 'report_automation_result';

export interface IAutomationResultToolAccessor {
	canReportResult(session: string): boolean;
	reportResult(context: IServerToolExecutionContext, report: IAgentHostAutomationResult): Promise<void>;
}

export function createAutomationResultServerToolGroup(accessor?: IAutomationResultToolAccessor): IServerToolGroup {
	return {
		definitions: [{
			name: reportAutomationResultToolName,
			title: 'Report Automation Result',
			description: 'Record the final task outcome and a summary of at most 10 words for the current automation run. Call before finishing the automation, including when there was nothing to do or a person needs to investigate. This reports the task result; it does not end the run or send a notification. Do not infer success from the absence of an execution error. A repeat call before the run ends replaces the report.',
			inputSchema: {
				type: 'object',
				properties: {
					outcome: { type: 'string', enum: ['success', 'noOp', 'needsAttention'], description: 'success: accomplished the task; noOp: nothing needed doing; needsAttention: a person must investigate or act.' },
					summary: { type: 'string', minLength: 1, description: 'Plain-text explanation of what happened in at most 10 words (separated by whitespace), including what needs attention when applicable.' },
				},
				required: ['outcome', 'summary'],
			},
			annotations: { readOnlyHint: false },
			topLevelChatOnly: true,
		}],
		isEnabled: (_name, session) => !!accessor && (session === undefined || accessor.canReportResult(session)),
		isEnabledForSession: (_name, session) => accessor?.canReportResult(session) === true,
		getDisplay: () => ({
			displayName: localize('reportAutomationResult', "Report Automation Result"),
			invocationMessage: localize('reportingAutomationResult', "Recording automation result"),
			pastTenseMessage: localize('reportedAutomationResult', "Recorded automation result"),
		}),
		async execute(_stateManager, context, _name, args) {
			const report = parseAgentHostAutomationResult(args);
			if (!report || Object.keys(args as object).some(key => key !== 'outcome' && key !== 'summary')) {
				throw new Error('Expected an automation outcome and a non-empty plain-text summary.');
			}
			if (report.summary.split(/\s+/).length > 10) {
				throw new Error('The automation result summary must contain at most 10 words. Shorten it and try again.');
			}
			if (!accessor) {
				throw new Error('Automation result reporting is unavailable.');
			}
			await accessor.reportResult(context, report);
			return 'Automation result recorded. The run finishes when the turn ends.';
		},
	};
}
