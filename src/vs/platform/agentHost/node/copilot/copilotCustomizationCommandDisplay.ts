/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownCodeBlockFence, appendEscapedMarkdownInlineCode, escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import type { CopilotSession } from '@github/copilot-sdk';
import { localize } from '../../../../nls.js';
import type { CopilotSlashCommandOutput, CopilotSlashCommandResult, ICopilotSlashCommandHandler, RuntimeSlashCommandInfo } from './copilotSlashCommand.js';

type CopilotPluginsApi = CopilotSession['rpc']['plugins'];

export type ICopilotPluginCommandApi = Pick<CopilotPluginsApi, 'list' | 'install' | 'uninstall' | 'update' | 'enable' | 'disable' | 'reload'> & {
	readonly marketplaces: Pick<CopilotPluginsApi['marketplaces'], 'add' | 'remove' | 'list' | 'browse' | 'refresh'>;
};

export function getCopilotCustomizationCommandHandler(command: RuntimeSlashCommandInfo, plugins?: ICopilotPluginCommandApi): ICopilotSlashCommandHandler | undefined {
	if (command.kind !== 'builtin' || !['mcp', 'plugin', 'skills'].includes(command.name)) {
		return undefined;
	}
	return {
		invoke: command.name === 'plugin' && plugins ? input => invokeCopilotPluginCommand(input, plugins) : undefined,
		getProgressMessage: command.name === 'plugin' && plugins ? getCopilotPluginProgressMessage : undefined,
		showProgressImmediately: command.name === 'plugin' && plugins ? input => splitCommand(input).command === 'install' : undefined,
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

function getCopilotPluginProgressMessage(input: string): string | undefined {
	const { command, rest } = splitCommand(input);
	switch (command) {
		case 'install':
			return localize('copilotPlugin.installing', "Installing plugin…");
		case 'uninstall':
		case 'remove':
		case 'rm':
			return localize('copilotPlugin.uninstalling', "Uninstalling plugin…");
		case 'update':
			return localize('copilotPlugin.updating', "Updating plugin…");
		case 'enable':
			return localize('copilotPlugin.enabling', "Enabling plugin…");
		case 'disable':
			return localize('copilotPlugin.disabling', "Disabling plugin…");
		case 'marketplace': {
			const marketplaceCommand = splitCommand(rest).command;
			switch (marketplaceCommand) {
				case 'add':
					return localize('copilotPlugin.marketplaceAdding', "Adding plugin marketplace…");
				case 'remove':
					return localize('copilotPlugin.marketplaceRemoving', "Removing plugin marketplace…");
				case 'update':
				case 'refresh':
					return localize('copilotPlugin.marketplaceUpdating', "Updating plugin marketplaces…");
			}
		}
	}
	return undefined;
}

export async function invokeCopilotPluginCommand(input: string, plugins: ICopilotPluginCommandApi): Promise<CopilotSlashCommandResult | undefined> {
	const { command, rest } = splitCommand(input);
	switch (command) {
		case '':
		case 'list':
		case 'ls':
			return undefined;
		case 'install': {
			if (!rest) {
				return pluginUsage(localize('copilotPlugin.installUsage', "Usage: /plugin install <source>"));
			}
			const result = await plugins.install({ source: rest });
			await plugins.reload();
			const details = [
				localize('copilotPlugin.installed', "Installed plugin {0}.", pluginDisplayName(result.plugin.name, result.plugin.marketplace)),
				result.plugin.version ? localize('copilotPlugin.installedVersion', "Version: {0}", result.plugin.version) : undefined,
				result.skillsInstalled === 1
					? localize('copilotPlugin.installedOneSkill', "Installed 1 skill.")
					: localize('copilotPlugin.installedSkills', "Installed {0} skills.", result.skillsInstalled),
				result.deprecationWarning,
				result.postInstallMessage,
			].filter((line): line is string => !!line);
			return pluginResult(details.join('\n'));
		}
		case 'uninstall':
		case 'remove':
		case 'rm':
			if (!rest) {
				return pluginUsage(localize('copilotPlugin.uninstallUsage', "Usage: /plugin uninstall <plugin>"));
			}
			await plugins.uninstall({ name: rest });
			await plugins.reload();
			return pluginResult(localize('copilotPlugin.uninstalled', "Uninstalled plugin {0}.", rest));
		case 'update': {
			if (!rest) {
				return pluginUsage(localize('copilotPlugin.updateUsage', "Usage: /plugin update <plugin>"));
			}
			const result = await plugins.update({ name: rest });
			await plugins.reload();
			const version = result.newVersion
				? localize('copilotPlugin.updatedVersion', " Updated version: {0}.", result.newVersion)
				: '';
			return pluginResult(localize('copilotPlugin.updated', "Updated plugin {0}.{1}", rest, version));
		}
		case 'enable':
		case 'disable': {
			if (!rest) {
				return pluginUsage(localize('copilotPlugin.enablementUsage', "Usage: /plugin {0} <plugin>", command));
			}
			const plugin = await findPlugin(rest, plugins);
			if (typeof plugin === 'string') {
				return pluginUsage(plugin);
			}
			if (!plugin.marketplace) {
				return pluginUsage(localize('copilotPlugin.directEnablementUnsupported', "Plugin {0} is installed directly and cannot be enabled or disabled. Uninstall it instead.", rest));
			}
			const enabled = command === 'enable';
			if (plugin.enabled === enabled) {
				return pluginUsage(enabled
					? localize('copilotPlugin.alreadyEnabled', "Plugin {0} is already enabled.", rest)
					: localize('copilotPlugin.alreadyDisabled', "Plugin {0} is already disabled.", rest));
			}
			if (command === 'enable') {
				await plugins.enable({ names: [rest] });
			} else {
				await plugins.disable({ names: [rest] });
			}
			await plugins.reload();
			return pluginResult(command === 'enable'
				? localize('copilotPlugin.enabled', "Enabled plugin {0}.", rest)
				: localize('copilotPlugin.disabled', "Disabled plugin {0}.", rest));
		}
		case 'marketplace':
			return invokeCopilotPluginMarketplaceCommand(rest, plugins);
		default:
			return pluginUsage(pluginHelp());
	}
}

async function invokeCopilotPluginMarketplaceCommand(input: string, plugins: ICopilotPluginCommandApi): Promise<CopilotSlashCommandResult> {
	const { command, rest } = splitCommand(input);
	switch (command) {
		case 'add': {
			if (!rest) {
				return pluginUsage(localize('copilotPlugin.marketplaceAddUsage', "Usage: /plugin marketplace add <source>"));
			}
			const result = await plugins.marketplaces.add({ source: rest });
			return pluginResult(localize('copilotPlugin.marketplaceAdded', "Added plugin marketplace {0}.", result.name));
		}
		case 'remove': {
			const args = rest.split(/\s+/).filter(Boolean);
			const force = args.includes('--force');
			const name = args.find(arg => arg !== '--force');
			if (!name || args.some(arg => arg !== '--force' && arg !== name)) {
				return pluginUsage(localize('copilotPlugin.marketplaceRemoveUsage', "Usage: /plugin marketplace remove <name> [--force]"));
			}
			const result = await plugins.marketplaces.remove({ name, force });
			if (!result.removed) {
				return pluginResult([
					localize('copilotPlugin.marketplaceNotRemoved', "Marketplace {0} was not removed because it has installed plugins.", name),
					...(result.dependentPlugins ?? []).map(plugin => `- ${plugin}`),
					localize('copilotPlugin.marketplaceRemoveForce', "Run /plugin marketplace remove {0} --force to uninstall them and remove the marketplace.", name),
				].join('\n'), false);
			}
			if (force) {
				await plugins.reload();
			}
			return pluginResult(localize('copilotPlugin.marketplaceRemoved', "Removed plugin marketplace {0}.", name));
		}
		case 'list': {
			const result = await plugins.marketplaces.list();
			if (!result.marketplaces.length) {
				return pluginResult(localize('copilotPlugin.noMarketplaces', "No plugin marketplaces are registered."), false);
			}
			const defaultMarketplaces = result.marketplaces.filter(marketplace => marketplace.isDefault);
			const registeredMarketplaces = result.marketplaces.filter(marketplace => !marketplace.isDefault);
			const lines = [`# ${localize('copilotPlugin.marketplaces', "Plugin marketplaces")}`];
			appendMarketplaceGroup(lines, localize('copilotPlugin.includedMarketplaces', "Included with GitHub Copilot"), defaultMarketplaces);
			appendMarketplaceGroup(lines, localize('copilotPlugin.registeredMarketplaces', "Registered marketplaces"), registeredMarketplaces);
			return { kind: 'text', text: lines.join('\n'), markdown: true };
		}
		case 'browse': {
			if (!rest || /\s/.test(rest)) {
				return pluginUsage(localize('copilotPlugin.marketplaceBrowseUsage', "Usage: /plugin marketplace browse <name>"));
			}
			const result = await plugins.marketplaces.browse({ name: rest });
			if (!result.plugins.length) {
				return pluginResult(localize('copilotPlugin.marketplaceEmpty', "Marketplace {0} contains no plugins.", rest), false);
			}
			return pluginResult([
				localize('copilotPlugin.marketplacePlugins', "Plugins in {0}:", rest),
				...result.plugins.map(plugin => `- ${plugin.name}:${plugin.description ? ` ${plugin.description}` : ''}`),
			].join('\n'), false);
		}
		case 'update':
		case 'refresh': {
			if (rest && /\s/.test(rest)) {
				return pluginUsage(localize('copilotPlugin.marketplaceUpdateUsage', "Usage: /plugin marketplace update [name]"));
			}
			const result = await plugins.marketplaces.refresh(rest ? { name: rest } : undefined);
			const failures = result.results.filter(entry => !entry.success);
			const lines = result.results.map(entry => entry.success
				? localize('copilotPlugin.marketplaceUpdatedEntry', "Updated {0}.", entry.name)
				: localize('copilotPlugin.marketplaceUpdateFailedEntry', "Failed to update {0}: {1}", entry.name, entry.error ?? localize('copilotPlugin.unknownError', "Unknown error")));
			return pluginResult([
				failures.length
					? localize('copilotPlugin.marketplaceUpdateFailures', "Marketplace update completed with errors.")
					: localize('copilotPlugin.marketplaceUpdated', "Updated plugin marketplaces."),
				...lines,
			].join('\n'), false);
		}
		default:
			return pluginUsage(pluginHelp());
	}
}

function splitCommand(input: string): { command: string; rest: string } {
	const trimmed = input.trim();
	const separator = trimmed.search(/\s/);
	if (separator === -1) {
		return { command: trimmed.toLowerCase(), rest: '' };
	}
	return {
		command: trimmed.slice(0, separator).toLowerCase(),
		rest: trimmed.slice(separator).trim(),
	};
}

async function findPlugin(target: string, plugins: ICopilotPluginCommandApi): Promise<Awaited<ReturnType<ICopilotPluginCommandApi['list']>>['plugins'][number] | string> {
	const matches = (await plugins.list()).plugins.filter(plugin => pluginDisplayName(plugin.name, plugin.marketplace) === target || plugin.name === target);
	if (!matches.length) {
		return localize('copilotPlugin.notFound', "Plugin {0} is not installed.", target);
	}
	if (matches.length > 1) {
		return localize('copilotPlugin.ambiguous', "Multiple plugins are named {0}. Use the full plugin@marketplace name.", target);
	}
	return matches[0];
}

function pluginResult(text: string, runtimeSettingsChanged = true): CopilotSlashCommandResult {
	return { kind: 'text', text, ...(runtimeSettingsChanged ? { runtimeSettingsChanged: true } : {}) };
}

function pluginUsage(text: string): CopilotSlashCommandResult {
	return { kind: 'text', text };
}

function pluginDisplayName(name: string, marketplace: string): string {
	return marketplace ? `${name}@${marketplace}` : name;
}

function appendMarketplaceGroup(
	lines: string[],
	title: string,
	marketplaces: Awaited<ReturnType<ICopilotPluginCommandApi['marketplaces']['list']>>['marketplaces'],
): void {
	if (!marketplaces.length) {
		return;
	}
	lines.push('', `## ${title}`);
	for (const marketplace of marketplaces) {
		const statuses = [
			marketplace.managed ? localize('copilotPlugin.managed', "managed") : undefined,
			marketplace.available === false ? localize('copilotPlugin.unavailable', "unavailable") : undefined,
		].filter((status): status is string => !!status);
		const status = statuses.length ? ` *(${statuses.join(', ')})*` : '';
		lines.push(`- ${appendEscapedMarkdownInlineCode(marketplace.name)} — ${escapeCustomizationMarkdownText(marketplace.source)}${status}`);
	}
}

function pluginHelp(): string {
	return [
		localize('copilotPlugin.usage', "Plugin command usage:"),
		'/plugin list',
		'/plugin install <source>',
		'/plugin uninstall <plugin>',
		'/plugin update <plugin>',
		'/plugin enable <plugin>',
		'/plugin disable <plugin>',
		'/plugin marketplace add <source>',
		'/plugin marketplace remove <name> [--force]',
		'/plugin marketplace list',
		'/plugin marketplace browse <name>',
		'/plugin marketplace update [name]',
	].join('\n');
}

function isPlainTextResult(result: CopilotSlashCommandResult): result is Extract<CopilotSlashCommandResult, { kind: 'text' }> {
	return result.kind === 'text' && result.markdown !== true;
}

function escapeCustomizationMarkdownText(value: string): string {
	return escapeMarkdownSyntaxTokens(value.replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
}

function formatCopilotCustomizationError(command: string, input: string, error: Error): CopilotSlashCommandOutput | undefined {
	const args = input.trim().split(/\s+/);
	const pluginApiError = command === 'plugin' ? extractPluginApiError(error.message) : undefined;
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

	const marketplaceNotFound = /^Marketplace "(?<name>[^"\r\n]+)" not found$/.exec(pluginApiError ?? error.message);
	if (command === 'plugin' && marketplaceNotFound?.groups?.name) {
		return {
			kind: 'text',
			text: [
				localize('copilotPlugin.marketplaceNotFound', "Marketplace {0} was not found.", appendEscapedMarkdownInlineCode(marketplaceNotFound.groups.name)),
				'',
				localize('copilotPlugin.marketplaceListGuidance', "Run {0} to see the available marketplaces.", appendEscapedMarkdownInlineCode('/plugin marketplace list')),
			].join('\n'),
			markdown: true,
		};
	}

	const missingPluginManifest = /^No plugin\.json found in repository\. Tried: (?<paths>.+)$/.exec(pluginApiError ?? error.message);
	if (command === 'plugin' && args[0]?.toLowerCase() === 'install' && args[1] && missingPluginManifest?.groups?.paths) {
		const paths = missingPluginManifest.groups.paths.split(',').map(path => path.trim()).filter(Boolean);
		return {
			kind: 'text',
			text: [
				localize('copilotPlugin.installManifestMissing', "Could not install a plugin from {0}.", appendEscapedMarkdownInlineCode(args.slice(1).join(' '))),
				'',
				localize('copilotPlugin.installManifestMissingDetail', "No {0} manifest was found in the repository.", appendEscapedMarkdownInlineCode('plugin.json')),
				'',
				localize('copilotPlugin.installManifestLocations', "Expected one of:"),
				...paths.map(path => `- ${appendEscapedMarkdownInlineCode(path)}`),
			].join('\n'),
			markdown: true,
		};
	}

	if (pluginApiError) {
		return {
			kind: 'text',
			text: [
				`## ${localize('copilotPlugin.commandFailed', "Plugin command failed")}`,
				'',
				escapeCustomizationMarkdownText(pluginApiError),
			].join('\n'),
			markdown: true,
		};
	}

	return undefined;
}

function extractPluginApiError(message: string): string | undefined {
	return /^(?:\(sendFailed\) )?Request session\.plugins(?:\.[\w]+)+ failed with message: (?<message>[\s\S]+)$/.exec(message)?.groups?.message;
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
	const servers: { line: string; details: string[] }[] = [];
	let currentServer: { line: string; details: string[] } | undefined;
	for (const line of lines.slice(4)) {
		if (line.startsWith('- ') && line.length > 2) {
			currentServer = { line: line.slice(2), details: [] };
			servers.push(currentServer);
		} else if (currentServer && /\([^)]+\): error:/.test(currentServer.line) && line && !line.startsWith('- ')) {
			currentServer.details.push(line);
		} else {
			return undefined;
		}
	}
	const formattedServerGroups = servers.map(server => formatCopilotMcpServer(server.line, server.details));
	if (formattedServerGroups.some(server => server === undefined)) {
		return undefined;
	}
	const formattedServers = formattedServerGroups.flatMap(server => server ?? []);

	return {
		kind: 'text',
		text: [
			`# ${localize('copilotMcp.servers', "MCP servers")}`,
			'',
			escapeCustomizationMarkdownText(lines[2]),
			'',
			...formattedServers,
		].join('\n'),
		markdown: true,
	};
}

function formatCopilotMcpServer(line: string, details: readonly string[]): string[] | undefined {
	const errorMatch = /^(?<name>.+) \((?<status>[^)]+)\): error: (?<error>.+)$/.exec(line);
	if (!errorMatch?.groups) {
		return details.length === 0 ? [`- ${escapeCustomizationMarkdownText(line)}`] : undefined;
	}

	const stderrSeparator = '; last stderr: ';
	const separatorIndex = errorMatch.groups.error.indexOf(stderrSeparator);
	const error = separatorIndex === -1 ? errorMatch.groups.error : errorMatch.groups.error.slice(0, separatorIndex);
	const lastStderr = separatorIndex === -1 ? undefined : errorMatch.groups.error.slice(separatorIndex + stderrSeparator.length);
	const diagnostic = [`${localize('copilotMcp.error', "Error")}: ${error}`];

	if (details.length > 0) {
		diagnostic.push('', details[0], ...details.slice(1));
	} else if (lastStderr) {
		diagnostic.push('', `${localize('copilotMcp.lastStderr', "Last stderr")}: ${lastStderr}`);
	}

	return [
		`- ${escapeCustomizationMarkdownText(errorMatch.groups.name)} — **${escapeCustomizationMarkdownText(errorMatch.groups.status)}**`,
		...appendEscapedMarkdownCodeBlockFence(diagnostic.join('\n'), 'text').split('\n').map(line => `  ${line}`),
	];
}

function formatCopilotPluginOutput(input: string, result: CopilotSlashCommandResult): CopilotSlashCommandOutput | undefined {
	const subcommand = input.trim().toLowerCase();
	if (!isPlainTextResult(result)) {
		return undefined;
	}

	const lines = result.text.trimEnd().split(/\r?\n/);
	const namedDescriptionList = formatNamedDescriptionList(lines);
	if (namedDescriptionList) {
		return namedDescriptionList;
	}
	if (!['', 'list', 'ls'].includes(subcommand)) {
		return undefined;
	}
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

function formatNamedDescriptionList(lines: readonly string[]): CopilotSlashCommandOutput | undefined {
	const title = /^(?<title>.+):$/.exec(lines[0])?.groups?.title;
	if (!title || lines.length < 2) {
		return undefined;
	}

	const output = [`# ${escapeCustomizationMarkdownText(title)}`, ''];
	for (const line of lines.slice(1)) {
		const item = /^- (?<name>[^:]+):(?<description>.*)$/.exec(line)?.groups;
		if (!item?.name) {
			return undefined;
		}
		const description = item.description.trim();
		output.push(`- ${appendEscapedMarkdownInlineCode(item.name.trim())}${description ? ` — ${escapeCustomizationMarkdownText(description)}` : ''}`);
	}
	return { kind: 'text', text: output.join('\n'), markdown: true };
}
