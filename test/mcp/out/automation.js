"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServer = getServer;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const scenario_1 = require("../../scenario");
const index_js_1 = require("./automationTools/index.js");
const zod_1 = require("zod");
const evidenceTools_js_1 = require("./evidenceTools.js");
async function getServer(appService) {
    const server = new mcp_js_1.McpServer({
        name: 'VS Code Automation Server',
        version: '1.0.0',
        title: 'An MCP Server that can interact with a local build of VS Code. Used for verifying UI behavior.'
    }, { capabilities: { logging: {} } });
    const evidenceService = new scenario_1.EvidenceService(appService);
    server.tool('vscode_automation_start', 'Start VS Code Build. If workspacePath is not provided, VS Code will open with the last used workspace or an empty window.', {
        recordVideo: zod_1.z.boolean().optional().describe('Whether to record a video of the session'),
        workspacePath: zod_1.z.string().optional().describe('Optional path to a workspace or folder to open. If not provided, opens the last used workspace.')
    }, async ({ recordVideo, workspacePath }) => {
        const app = await appService.getOrCreateApplication({ recordVideo, workspacePath });
        await app.startTracing();
        return {
            content: [{
                    type: 'text',
                    text: app ? `VS Code started successfully${workspacePath ? ` with workspace: ${workspacePath}` : ''}` : `Failed to start VS Code`
                }]
        };
    });
    (0, evidenceTools_js_1.applyEvidenceStartTool)(server, evidenceService);
    (0, evidenceTools_js_1.applyEvidenceTools)(server, evidenceService);
    // Apply all VS Code automation tools using the modular structure
    const registeredTools = (0, index_js_1.applyAllTools)(server, appService);
    const app = appService.application;
    if (app) {
        registeredTools.forEach(t => t.enable());
    }
    else {
        registeredTools.forEach(t => t.disable());
    }
    appService.onApplicationChange(app => {
        if (app) {
            registeredTools.forEach(t => t.enable());
        }
        else {
            registeredTools.forEach(t => t.disable());
        }
    });
    return server.server;
}
//# sourceMappingURL=automation.js.map