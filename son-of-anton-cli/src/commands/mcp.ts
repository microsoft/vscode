/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'commander';
import { buildCliHost } from '../cliHost';

interface McpServerEntry {
	readonly name: string;
	readonly command: string;
	readonly args: ReadonlyArray<string>;
	readonly cwd?: string;
}

const MCP_SERVERS_KEY = 'mcp.servers';

export function mcpCommand(): Command {
	const cmd = new Command('mcp');
	cmd.description('Manage MCP servers.');

	cmd.command('add <name> <command> [args...]')
		.option('-c, --cwd <path>', 'Working directory for the server')
		.description('Add an MCP server.')
		.action(async (name: string, command: string, args: string[], opts: { cwd?: string }) => {
			const host = buildCliHost();
			const existing = host.config.get<ReadonlyArray<McpServerEntry>>(MCP_SERVERS_KEY, []) ?? [];
			const newServer: McpServerEntry = { name, command, args, cwd: opts.cwd };
			const filtered = existing.filter(s => s.name !== name);
			const updated = [...filtered, newServer];
			await host.config.update?.(MCP_SERVERS_KEY, updated);
			process.stdout.write(`Added MCP server '${name}' (${command} ${args.join(' ')}).\n`);
		});

	cmd.command('remove <name>')
		.description('Remove an MCP server.')
		.action(async (name: string) => {
			const host = buildCliHost();
			const existing = host.config.get<ReadonlyArray<McpServerEntry>>(MCP_SERVERS_KEY, []) ?? [];
			const filtered = existing.filter(s => s.name !== name);
			await host.config.update?.(MCP_SERVERS_KEY, filtered);
			process.stdout.write(`Removed MCP server '${name}'.\n`);
		});

	cmd.command('list')
		.description('List configured MCP servers.')
		.action(async () => {
			const host = buildCliHost();
			const servers = host.config.get<ReadonlyArray<McpServerEntry>>(MCP_SERVERS_KEY, []) ?? [];
			if (servers.length === 0) {
				process.stdout.write('No MCP servers configured.\n');
				return;
			}
			for (const s of servers) {
				const argString = s.args && s.args.length > 0 ? ' ' + s.args.join(' ') : '';
				process.stdout.write(`  ${s.name}: ${s.command}${argString}\n`);
			}
		});

	return cmd;
}
