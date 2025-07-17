/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

class ExampleMcpServer {
	constructor() {
		this.server = new Server(
			{
				name: 'example-server',
				version: '1.0.0',
			},
			{
				capabilities: {
					tools: {},
					resources: {},
				},
			}
		);

		this.setupHandlers();
	}

	setupHandlers() {
		// Handle tools/list request
		this.server.setRequestHandler('tools/list', async () => {
			return {
				tools: [
					{
						name: 'get_time',
						description: 'Get the current time',
						inputSchema: {
							type: 'object',
							properties: {},
							required: []
						}
					},
					{
						name: 'calculate',
						description: 'Perform basic mathematical calculations',
						inputSchema: {
							type: 'object',
							properties: {
								expression: {
									type: 'string',
									description: 'Mathematical expression to evaluate (e.g., "2 + 2")'
								}
							},
							required: ['expression']
						}
					},
					{
						name: 'say_hello',
						description: 'Say hello to a person',
						inputSchema: {
							type: 'object',
							properties: {
								name: {
									type: 'string',
									description: 'Name of the person to greet'
								}
							},
							required: ['name']
						}
					}
				]
			};
		});

		// Handle tools/call request
		this.server.setRequestHandler('tools/call', async (request) => {
			const { name, arguments: args } = request.params;

			switch (name) {
				case 'get_time':
					return {
						content: [
							{
								type: 'text',
								text: `Current time: ${new Date().toLocaleString()}`
							}
						]
					};

				case 'calculate':
					try {
						// Simple math evaluation (be careful with eval in production!)
						const result = this.safeEval(args.expression);
						return {
							content: [
								{
									type: 'text',
									text: `Result: ${result}`
								}
							]
						};
					} catch (error) {
						return {
							content: [
								{
									type: 'text',
									text: `Error: ${error.message}`
								}
							]
						};
					}

				case 'say_hello':
					return {
						content: [
							{
								type: 'text',
								text: `Hello, ${args.name}! Nice to meet you!`
							}
						]
					};

				default:
					throw new Error(`Unknown tool: ${name}`);
			}
		});

		// Handle resources/list request
		this.server.setRequestHandler('resources/list', async () => {
			return {
				resources: [
					{
						uri: 'info://server',
						name: 'Server Information',
						description: 'Basic information about this MCP server',
						mimeType: 'text/plain'
					}
				]
			};
		});

		// Handle resources/read request
		this.server.setRequestHandler('resources/read', async (request) => {
			const { uri } = request.params;

			switch (uri) {
				case 'info://server':
					return {
						contents: [
							{
								uri: 'info://server',
								mimeType: 'text/plain',
								text: 'This is an example MCP server for testing purposes. It provides basic tools for time, calculation, and greetings.'
							}
						]
					};

				default:
					throw new Error(`Unknown resource: ${uri}`);
			}
		});
	}

	// Simple safe evaluation for basic math
	safeEval(expression) {
		// Remove any non-math characters for safety
		const cleanExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');

		// Only allow basic math operations
		if (!/^[0-9+\-*/().\s]+$/.test(cleanExpression)) {
			throw new Error('Invalid mathematical expression');
		}

		try {
			return Function(`"use strict"; return (${cleanExpression})`)();
		} catch (error) {
			throw new Error('Invalid mathematical expression');
		}
	}

	async run() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error('Example MCP Server running on stdio');
	}
}

// Run the server
const server = new ExampleMcpServer();
server.run().catch(console.error);
