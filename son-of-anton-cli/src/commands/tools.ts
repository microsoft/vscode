/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'commander';
import { BUILTIN_TOOLS } from 'son-of-anton-core/dist/tools/builtin';

export function toolsCommand(): Command {
	const cmd = new Command('tools');
	cmd.description('Inspect available tools.');

	cmd.command('list')
		.description('List available built-in and MCP tools.')
		.action(async () => {
			process.stdout.write('Built-in tools:\n');
			for (const tool of BUILTIN_TOOLS) {
				process.stdout.write(`  - ${tool.definition.name} — ${tool.definition.description}\n`);
			}
			process.stdout.write('\nMCP tools: (run `sota mcp add` to configure servers)\n');
		});

	return cmd;
}
