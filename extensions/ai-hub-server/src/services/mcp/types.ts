/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface McpTool {
	name: string;
	description: string;
	inputSchema?: any;
	autoApprove?: boolean;
}

export interface McpResource {
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
}

export interface McpServer {
	name: string;
	config: string;
	status: 'connecting' | 'connected' | 'error' | 'disconnected';
	disabled: boolean;
	error?: string;
	tools?: McpTool[];
	resources?: McpResource[];
}

export interface McpConnection {
	server: McpServer;
	client: Client;
	transport: Transport;
}

export interface ServerConfig {
	type: 'stdio' | 'sse';
	disabled?: boolean;
	command?: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
}

export interface McpSettings {
	mcpServers: Record<string, ServerConfig>;
}
