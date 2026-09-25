/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownInlineCode, escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import type { CopilotSlashCommandOutput, CopilotSlashCommandResult, ICopilotSlashCommandHandler, RuntimeSlashCommandInfo } from './copilotSlashCommand.js';

export function getCopilotCustomizationCommandHandler(command: RuntimeSlashCommandInfo): ICopilotSlashCommandHandler | undefined {
	if (command.kind !== 'builtin' || !['mcp', 'plugin', 'skills'].includes(command.name)) {
		return undefined;
	}
	return {
		getOutput: (input, result) => {
			switch (command.name) {
				case 'mcp':
					return formatCopilotMcpOutput(input, result);
				case 'plugin':
					return formatCopilotPluginOutput(input, result);
				case 'skills':
					return formatCopilotSkillsOutput(input, result);
			}
			return undefined;
		},
		getErrorOutput: (input, error) => formatCopilotCustomizationError(command.name, input, error),
	};
}

function isPlainTextResult(result: CopilotSlashCommandResult): result is Extract<CopilotSlashCommandResult, { kind: 'text' }> {
	return result.kind === 'text' && result.markdown !== true;
}

function escapeCustomizationMarkdownText(value: string): string {
	return escapeMarkdownSyntaxTokens(value).replace(/[<>]/g, '\\$&');
}

function formatCopilotCustomizationError(command: string, input: string, error: Error): CopilotSlashCommandOutput | undefined {
	const args = input.trim().split(/\s+/);
	if (command === 'skills' && args.length === 1 && args[0].toLowerCase() === 'info'
		&& error.message === 'Usage: /skills info <skill-name>\nExample: /skills info my-skill') {
		return {
			kind: 'text',
			text: [
				localize('copilotSkills.infoUsage', "Usage: {0}", appendEscapedMarkdownInlineCode('/skills info <skill-name>')),
				'',
				localize('copilotSkills.infoExample', "Example: {0}", appendEscapedMarkdownInlineCode('/skills info my-skill')),
			].join('\n'),
			markdown: true,
		};
	}

	const mcpUsage = /^Usage: \/mcp (?<subcommand>enable|disable) <server-name>$/.exec(error.message);
	if (command === 'mcp' && args.length === 1 && mcpUsage?.groups?.subcommand === args[0].toLowerCase()) {
		return {
			kind: 'text',
			text: localize('copilotMcp.serverNameUsage', "Usage: {0}", appendEscapedMarkdownInlineCode(`/mcp ${mcpUsage.groups.subcommand} <server-name>`)),
			markdown: true,
		};
	}

	return undefined;
}

function formatCopilotSkillsOutput(input: string, result: CopilotSlashCommandResult): CopilotSlashCommandOutput | undefined {
	const subcommand = input.trim().toLowerCase();
	if ((subcommand !== '' && subcommand !== 'list') || !isPlainTextResult(result)) {
		return undefined;
	}

	const lines = result.text.trimEnd().split(/\r?\n/);
	if (lines[0] !== 'Available Skills' || lines[1] !== '') {
		return undefined;
	}

	const countMatch = /^Found (?<count>\d+) skills?\.$/.exec(lines.at(-1) ?? '');
	if (!countMatch?.groups?.count) {
		return undefined;
	}

	const output = [`# ${localize('copilotSkills.availableSkills', "Available skills")}`, ''];
	let index = 2;
	while (index < lines.length - 1) {
		const source = /^(?<source>.+):$/.exec(lines[index])?.groups?.source;
		if (!source) {
			return undefined;
		}
		output.push(`## ${escapeCustomizationMarkdownText(source)}`, '');
		index++;

		let foundSkill = false;
		while (index < lines.length - 1 && lines[index] !== '') {
			const skillMatch = /^  - (?<name>.+?)(?<disabled> \(disabled\))?$/.exec(lines[index]);
			const description = lines[index + 1];
			if (!skillMatch?.groups?.name || description === undefined || !description.startsWith('    ')) {
				return undefined;
			}
			const disabled = skillMatch.groups.disabled
				? ` (${localize('copilotSkills.disabled', "disabled")})`
				: '';
			const summary = description.slice(4);
			output.push(`- ${appendEscapedMarkdownInlineCode(skillMatch.groups.name)}${disabled}${summary ? ` — ${escapeCustomizationMarkdownText(summary)}` : ''}`);
			foundSkill = true;
			index += 2;
		}
		if (!foundSkill || lines[index] !== '') {
			return undefined;
		}
		output.push('');
		index++;
	}

	const count = Number(countMatch.groups.count);
	output.push(count === 1
		? localize('copilotSkills.oneSkillFound', "1 skill found.")
		: localize('copilotSkills.skillsFound', "{0} skills found.", count));
	return { kind: 'text', text: output.join('\n'), markdown: true };
}

function formatCopilotMcpOutput(input: string, result: CopilotSlashCommandResult): CopilotSlashCommandOutput | undefined {
	const subcommand = input.trim().split(/\s+/, 1)[0].toLowerCase();
	if (!['', 'list', 'show'].includes(subcommand) || !isPlainTextResult(result)) {
		return undefined;
	}

	const lines = result.text.trimEnd().split(/\r?\n/);
	if (lines.length < 5 || lines[0] !== 'MCP Servers' || lines[1] !== '' || lines[3] !== '') {
		return undefined;
	}
	const servers = lines.slice(4);
	if (servers.some(line => !line.startsWith('- ') || line.length === 2)) {
		return undefined;
	}

	return {
		kind: 'text',
		text: [
			`# ${localize('copilotMcp.servers', "MCP servers")}`,
			'',
			escapeCustomizationMarkdownText(lines[2]),
			'',
			...servers.map(line => `- ${escapeCustomizationMarkdownText(line.slice(2))}`),
		].join('\n'),
		markdown: true,
	};
}

function formatCopilotPluginOutput(input: string, result: CopilotSlashCommandResult): CopilotSlashCommandOutput | undefined {
	const subcommand = input.trim().toLowerCase();
	if (!['', 'list', 'ls'].includes(subcommand) || !isPlainTextResult(result)) {
		return undefined;
	}

	const lines = result.text.trimEnd().split(/\r?\n/);
	if (lines.length < 3 || lines[0] !== 'Installed Plugins:' || lines[1] !== '') {
		return undefined;
	}

	const output = [`# ${localize('copilotPlugins.installed', "Installed plugins")}`, ''];
	for (const line of lines.slice(2)) {
		const match = /^  • (?<plugin>.+?)(?<disabled> \(disabled\))?$/.exec(line);
		if (!match?.groups?.plugin) {
			return undefined;
		}
		let plugin = match.groups.plugin;
		const versionMatch = / v(?<version>\S+)$/.exec(plugin);
		const version = versionMatch?.groups?.version;
		if (versionMatch) {
			plugin = plugin.slice(0, versionMatch.index);
		}
		const disabled = match.groups.disabled
			? ` (${localize('copilotPlugins.disabled', "disabled")})`
			: '';
		output.push(`- ${appendEscapedMarkdownInlineCode(plugin)}${version ? ` — v${escapeCustomizationMarkdownText(version)}` : ''}${disabled}`);
	}
	return { kind: 'text', text: output.join('\n'), markdown: true };
}
