/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const copilotSpec: Fig.Spec = {
	name: 'copilot',
	description: 'GitHub Copilot CLI - An AI-powered coding assistant',
	options: [
		{
			name: '--add-dir',
			description: 'Add a directory to the allowed list for file access (can be used multiple times)',
			args: {
				name: 'directory',
				template: 'folders'
			},
			isRepeatable: true
		},
		{
			name: '--additional-mcp-config',
			description: 'Additional MCP servers configuration as JSON string or file path (prefix with @)',
			args: {
				name: 'json',
				description: 'JSON string or file path (prefix with @)'
			},
			isRepeatable: true
		},
		{
			name: '--allow-all-paths',
			description: 'Disable file path verification and allow access to any path'
		},
		{
			name: '--allow-all-tools',
			description: 'Allow all tools to run automatically without confirmation; required for non-interactive mode'
		},
		{
			name: '--allow-tool',
			description: 'Allow specific tools',
			args: {
				name: 'tools',
				isVariadic: true,
				isOptional: true
			}
		},
		{
			name: '--banner',
			description: 'Show the startup banner'
		},
		{
			name: '--continue',
			description: 'Resume the most recent session'
		},
		{
			name: '--deny-tool',
			description: 'Deny specific tools, takes precedence over --allow-tool or --allow-all-tools',
			args: {
				name: 'tools',
				isVariadic: true,
				isOptional: true
			}
		},
		{
			name: '--disable-builtin-mcps',
			description: 'Disable all built-in MCP servers (currently: github-mcp-server)'
		},
		{
			name: '--disable-mcp-server',
			description: 'Disable a specific MCP server (can be used multiple times)',
			args: {
				name: 'server-name'
			},
			isRepeatable: true
		},
		{
			name: '--disable-parallel-tools-execution',
			description: 'Disable parallel execution of tools (LLM can still make parallel tool calls, but they will be executed sequentially)'
		},
		{
			name: '--disallow-temp-dir',
			description: 'Prevent automatic access to the system temporary directory'
		},
		{
			name: ['-h', '--help'],
			description: 'Display help for command'
		},
		{
			name: '--log-dir',
			description: 'Set log file directory (default: ~/.copilot/logs/)',
			args: {
				name: 'directory',
				template: 'folders'
			}
		},
		{
			name: '--log-level',
			description: 'Set the log level',
			args: {
				name: 'level',
				suggestions: ['none', 'error', 'warning', 'info', 'debug', 'all', 'default']
			}
		},
		{
			name: '--model',
			description: 'Set the AI model to use',
			args: {
				name: 'model',
				suggestions: ['claude-sonnet-4.5', 'claude-sonnet-4', 'claude-haiku-4.5', 'gpt-5']
			}
		},
		{
			name: '--no-color',
			description: 'Disable all color output'
		},
		{
			name: '--no-custom-instructions',
			description: 'Disable loading of custom instructions from AGENTS.md and related files'
		},
		{
			name: ['-p', '--prompt'],
			description: 'Execute a prompt directly without interactive mode',
			args: {
				name: 'text',
				description: 'The prompt text to execute'
			}
		},
		{
			name: '--resume',
			description: 'Resume from a previous session (optionally specify session ID)',
			args: {
				name: 'sessionId',
				isOptional: true
			}
		},
		{
			name: '--screen-reader',
			description: 'Enable screen reader optimizations'
		},
		{
			name: '--stream',
			description: 'Enable or disable streaming mode',
			args: {
				name: 'mode',
				suggestions: ['on', 'off']
			}
		},
		{
			name: ['-v', '--version'],
			description: 'Show version information'
		}
	],
	subcommands: [
		{
			name: 'help',
			description: 'Display help information',
			args: {
				name: 'topic',
				isOptional: true,
				suggestions: ['config', 'commands', 'environment', 'logging', 'permissions']
			}
		}
	]
};

export default copilotSpec;
