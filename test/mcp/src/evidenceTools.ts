/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EvidenceService, JSONValue } from '../../scenario';

const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() => z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(jsonValueSchema),
	z.record(z.string(), jsonValueSchema)
]));

function isHttpUrl(value: string): boolean {
	try {
		return ['http:', 'https:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}

export function applyEvidenceStartTool(server: McpServer, evidenceService: EvidenceService): RegisteredTool {
	return server.tool(
		'vscode_automation_evidence_start',
		'Start VS Code with video and trace recording for a UI validation scenario',
		{
			scenarioId: z.string().describe('Stable scenario identifier'),
			title: z.string().describe('Human-readable scenario title'),
			source: z.string().url().refine(isHttpUrl, 'Source must use HTTP or HTTPS').optional().describe('Source test-plan issue URL'),
			scenarioPath: z.string().optional().describe('Path to the Markdown scenario definition'),
			workspacePath: z.string().optional().describe('Workspace or folder to open'),
			userSettings: z.record(z.string(), jsonValueSchema).optional().describe('User settings to seed before VS Code starts'),
			extraArgs: z.array(z.string()).optional().describe('Additional VS Code command-line arguments')
		},
		async ({ scenarioId, title, source, scenarioPath, workspacePath, userSettings, extraArgs }) => {
			const runPath = await evidenceService.start(scenarioId, title, source, scenarioPath, workspacePath, userSettings, extraArgs);
			return {
				content: [{ type: 'text' as const, text: `Evidence capture started: ${runPath}` }]
			};
		}
	);
}

export function applyEvidenceTools(server: McpServer, evidenceService: EvidenceService): RegisteredTool[] {
	return [
		server.tool(
			'vscode_automation_evidence_step',
			'Mark a scenario step in the video and save a screenshot of the current VS Code window',
			{
				id: z.string().describe('Stable step identifier from the scenario'),
				title: z.string().describe('Human-readable step title'),
				status: z.enum(['started', 'passed', 'failed', 'skipped']).describe('Step lifecycle status'),
				details: z.string().optional().describe('Validation result or failure details')
			},
			async ({ id, title, status, details }) => {
				const result = await evidenceService.step(id, title, status, details);
				return {
					content: [
						{ type: 'text' as const, text: `Evidence saved: ${result.screenshotPath}` },
						{ type: 'image' as const, data: result.screenshot.toString('base64'), mimeType: 'image/png' }
					]
				};
			}
		),
		server.tool(
			'vscode_automation_evidence_finish',
			'Finish a UI validation scenario, stop VS Code, and write the evidence report',
			{
				outcome: z.enum(['passed', 'failed', 'aborted']).describe('Overall scenario outcome'),
				notes: z.string().optional().describe('Run summary or blocking condition')
			},
			async ({ outcome, notes }) => {
				const reportPath = await evidenceService.finish(outcome, notes);
				return {
					content: [{ type: 'text' as const, text: `Evidence report written: ${reportPath}` }]
				};
			}
		)
	];
}
