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

export async function activate(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('toolpipeMcpServer');
	const enabled = config.get('enabled', true);

	if (!enabled) {
		console.log('ToolPipe MCP Server extension disabled in settings');
		return;
	}

	// Register MCP Server Definition Provider
	const provider = {
		provideMcpServerDefinitions: async (): Promise<vscode.McpServerDefinition[]> => {
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
function getMcpServerDefinitions(): vscode.McpServerDefinition[] {
	const config = vscode.workspace.getConfiguration('toolpipeMcpServer');
	const mode = config.get<string>('mode', 'remote');

	const definitions: vscode.McpServerDefinition[] = [];

	if (mode === 'remote') {
		const remoteUrl = config.get<string>('remoteUrl', '');
		if (remoteUrl) {
			definitions.push(
				new vscode.McpHttpServerDefinition(
					'ToolPipe Developer Tools',
					vscode.Uri.parse(remoteUrl)
				)
			);
		}
	} else if (mode === 'local') {
		const command = config.get<string>('localCommand', 'npx');
		const args = config.get<string[]>('localArgs', ['@cosai-labs/toolpipe-mcp-server']);

		definitions.push(
			new vscode.McpStdioServerDefinition(
				'ToolPipe Developer Tools (Local)',
				command,
				args
			)
		);
	}

	return definitions;
}

export function deactivate() {
	// Cleanup
}
