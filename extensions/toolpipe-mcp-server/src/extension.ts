/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * ToolPipe MCP Server Extension
 * 
 * Provides integration with ToolPipe MCP Server, which offers 120+ developer utilities:
 * - Code tools: Review, minification, formatting (JS/TS/Python/SQL/CSS/HTML)
 * - Data tools: JSON/CSV/XML/YAML conversion, Base64, UUID generation
 * - Security: Hash generation, JWT decode, SSL checking, security headers
 * - API tools: HTTP client, OpenAPI spec generation, webhook testing
 * - DevOps: Docker Compose generation, GitHub Actions workflows, Nginx configs
 */

// Store for MCP Server definitions
const mcpDefinitions = new Map<string, vscode.lm.McpServerDefinition>();

export async function activate(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('toolpipeMcpServer');
	const enabled = config.get('enabled', true);

	if (!enabled) {
		console.log('ToolPipe MCP Server extension disabled in settings');
		return;
	}

	// Register MCP Server Definition Provider
	const provider = {
		provideMcpServerDefinitions: async (): Promise<vscode.lm.McpServerDefinition[]> => {
			return getMcpServerDefinitions();
		}
	};

	context.subscriptions.push(
		vscode.lm.registerMcpServerDefinitionProvider('toolpipe', provider)
	);

	console.log('ToolPipe MCP Server extension activated');
}

/**
 * Generates MCP Server definitions based on current configuration
 */
function getMcpServerDefinitions(): vscode.lm.McpServerDefinition[] {
	const config = vscode.workspace.getConfiguration('toolpipeMcpServer');
	const mode = config.get<string>('mode', 'remote');

	const definitions: vscode.lm.McpServerDefinition[] = [];

	if (mode === 'remote') {
		const remoteUrl = config.get<string>('remoteUrl', 'https://troops-submission-what-stays.trycloudflare.com/mcp');
		definitions.push({
			name: 'toolpipe',
			displayName: 'ToolPipe Developer Tools',
			description: 'Access 120+ developer utilities for code, data, security, API, and DevOps tasks',
			type: 'http',
			url: remoteUrl,
			capabilities: {
				tools: {},
				resources: {}
			}
		} as any);
	} else if (mode === 'local') {
		const command = config.get<string>('localCommand', 'npx');
		const args = config.get<string[]>('localArgs', ['@cosai-labs/toolpipe-mcp-server']);
		
		definitions.push({
			name: 'toolpipe',
			displayName: 'ToolPipe Developer Tools (Local)',
			description: 'Access 120+ developer utilities via locally-hosted ToolPipe server',
			type: 'stdio',
			command,
			args,
			capabilities: {
				tools: {},
				resources: {}
			}
		} as any);
	}

	return definitions;
}

/**
 * Prompts user to configure ToolPipe if not already configured
 */
async function promptConfigureToolPipe(): Promise<void> {
	const config = vscode.workspace.getConfiguration('toolpipeMcpServer');
	
	if (config.get('configured')) {
		return;
	}

	const choice = await vscode.window.showQuickPick(
		[
			{
				label: 'Use Remote Server (Cloud-hosted)',
				description: 'Connect to ToolPipe cloud server (no setup required)',
				value: 'remote'
			},
			{
				label: 'Use Local Server (npm-based)',
				description: 'Run ToolPipe locally: npx @cosai-labs/toolpipe-mcp-server',
				value: 'local'
			},
			{
				label: 'Skip Configuration',
				description: 'Configure later',
				value: 'skip'
			}
		],
		{ placeHolder: 'Choose ToolPipe server mode' }
	);

	if (!choice) {
		return;
	}

	if (choice.value === 'skip') {
		return;
	}

	// Update configuration
	await config.update('mode', choice.value, vscode.ConfigurationTarget.Global);
	await config.update('configured', true, vscode.ConfigurationTarget.Global);

	vscode.window.showInformationMessage(
		`ToolPipe MCP Server configured to use ${choice.value} mode. Settings can be changed in preferences.`
	);
}

export function deactivate() {
	// Cleanup
}
