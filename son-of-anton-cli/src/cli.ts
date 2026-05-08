#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Option } from 'commander';
import { runAcpServer } from './acp/server';
import { runChat } from './commands/chat';
import { configCommand } from './commands/config';
import { mcpCommand } from './commands/mcp';
import { runPlan } from './commands/plan';
import { runResume } from './commands/resume';
import { runSpecialist } from './commands/run';
import { toolsCommand } from './commands/tools';

const program = new Command();
program
	.name('sota')
	.description('Son of Anton CLI — same brain as the IDE, different body.')
	.version('0.1.0');

const outputOption = (): Option =>
	new Option('--output <mode>', 'Output mode: text or json')
		.choices(['text', 'json'])
		.default('text');

program
	.command('chat')
	.description('Start an interactive chat session.')
	.option('--specialist <id>', 'Pin a specialist (e.g. anton-code)', 'anton')
	.option('--model <id>', 'Pin a model (e.g. sonnet)', 'sonnet')
	.option('--no-tui', 'Disable the Ink TUI and use a plain readline REPL')
	.addOption(outputOption())
	.action(runChat);

program
	.command('run <handle> <prompt>')
	.description('Invoke a specialist for one prompt.')
	.option('--model <id>', 'Override the default model')
	.option('--quiet', 'Suppress everything except the final assistant text on stdout')
	.option('--max-turns <n>', 'Bound the agent loop (advisory until orchestrator runs are exposed via run)')
	.addOption(outputOption())
	.action(runSpecialist);

program
	.command('plan <prompt>')
	.description('Have the orchestrator draft a plan (no execution).')
	.addOption(outputOption())
	.action(runPlan);

program
	.command('resume [id]')
	.description('List saved conversations, or resume one by id.')
	.addOption(outputOption())
	.action(runResume);

program
	.command('acp')
	.description('Run as an Agent Client Protocol (ACP) stdio JSON-RPC server.')
	.action(async () => {
		await runAcpServer();
	});

program.addCommand(toolsCommand());
program.addCommand(mcpCommand());
program.addCommand(configCommand());

program.parseAsync(process.argv).catch(err => {
	process.stderr.write('error: ' + (err instanceof Error ? err.message : String(err)) + '\n');
	process.exit(1);
});
