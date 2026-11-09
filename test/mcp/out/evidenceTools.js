"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyEvidenceStartTool = applyEvidenceStartTool;
exports.applyEvidenceTools = applyEvidenceTools;
const zod_1 = require("zod");
const jsonValueSchema = zod_1.z.lazy(() => zod_1.z.union([
    zod_1.z.string(),
    zod_1.z.number(),
    zod_1.z.boolean(),
    zod_1.z.null(),
    zod_1.z.array(jsonValueSchema),
    zod_1.z.record(zod_1.z.string(), jsonValueSchema)
]));
function isHttpUrl(value) {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    }
    catch {
        return false;
    }
}
function applyEvidenceStartTool(server, evidenceService) {
    return server.tool('vscode_automation_evidence_start', 'Start VS Code with video and trace recording for a UI validation scenario', {
        scenarioId: zod_1.z.string().describe('Stable scenario identifier'),
        title: zod_1.z.string().describe('Human-readable scenario title'),
        source: zod_1.z.string().url().refine(isHttpUrl, 'Source must use HTTP or HTTPS').optional().describe('Source test-plan issue URL'),
        scenarioPath: zod_1.z.string().optional().describe('Path to the Markdown scenario definition'),
        workspacePath: zod_1.z.string().optional().describe('Workspace or folder to open'),
        userSettings: zod_1.z.record(zod_1.z.string(), jsonValueSchema).optional().describe('User settings to seed before VS Code starts'),
        extraArgs: zod_1.z.array(zod_1.z.string()).optional().describe('Additional VS Code command-line arguments')
    }, async ({ scenarioId, title, source, scenarioPath, workspacePath, userSettings, extraArgs }) => {
        const runPath = await evidenceService.start(scenarioId, title, source, scenarioPath, workspacePath, userSettings, extraArgs);
        return {
            content: [{ type: 'text', text: `Evidence capture started: ${runPath}` }]
        };
    });
}
function applyEvidenceTools(server, evidenceService) {
    return [
        server.tool('vscode_automation_evidence_step', 'Mark a scenario step in the video and save a screenshot of the current VS Code window', {
            id: zod_1.z.string().describe('Stable step identifier from the scenario'),
            title: zod_1.z.string().describe('Human-readable step title'),
            status: zod_1.z.enum(['started', 'passed', 'failed', 'skipped']).describe('Step lifecycle status'),
            details: zod_1.z.string().optional().describe('Validation result or failure details')
        }, async ({ id, title, status, details }) => {
            const result = await evidenceService.step(id, title, status, details);
            return {
                content: [
                    { type: 'text', text: `Evidence saved: ${result.screenshotPath}` },
                    { type: 'image', data: result.screenshot.toString('base64'), mimeType: 'image/png' }
                ]
            };
        }),
        server.tool('vscode_automation_evidence_finish', 'Finish a UI validation scenario, stop VS Code, and write the evidence report', {
            outcome: zod_1.z.enum(['passed', 'failed', 'aborted']).describe('Overall scenario outcome'),
            notes: zod_1.z.string().optional().describe('Run summary or blocking condition')
        }, async ({ outcome, notes }) => {
            const reportPath = await evidenceService.finish(outcome, notes);
            return {
                content: [{ type: 'text', text: `Evidence report written: ${reportPath}` }]
            };
        })
    ];
}
//# sourceMappingURL=evidenceTools.js.map