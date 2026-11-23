/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { untildify } from '../../../../../base/common/labels.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { dirname, extUriBiasedIgnorePathCase, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { hasReadableCustomizationContent } from '../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { AICustomizationSource, AICustomizationSources } from '../../common/aiCustomizationWorkspaceService.js';
import { IAgentPlugin } from '../../common/plugins/agentPluginService.js';
import { getLocalFormatHookEvents } from '../../common/promptSyntax/hookCompatibility.js';
import { extractHookCommandsFromItem } from '../../common/promptSyntax/hookSchema.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

interface ILocalFormatHookMarkable {
	readonly uri: URI;
	readonly promptType: PromptsType;
	readonly source: AICustomizationSource;
	readonly pluginUri?: URI;
	readonly organizationControl?: unknown;
	readonly status?: 'loading' | 'loaded' | 'degraded' | 'error';
	readonly statusMessage?: string;
	readonly localFormatHook?: boolean;
}

/**
 * Reads hook files and returns the event names in each that use the deprecated Local hook format.
 * Unreadable or invalid files have none.
 */
export async function readLocalFormatHookEvents(uris: readonly URI[], fileService: IFileService): Promise<ResourceMap<readonly string[]>> {
	const result = new ResourceMap<readonly string[]>();
	await Promise.all(uris.map(async uri => {
		if (result.has(uri)) {
			return;
		}
		result.set(uri, []);
		if (!hasReadableCustomizationContent(uri)) {
			return;
		}
		try {
			const content = await fileService.readFile(uri);
			result.set(uri, getLocalFormatHookEvents(uri, parseJSONC(content.value.toString())));
		} catch {
			// Unreadable or invalid files are not marked.
		}
	}));
	return result;
}

/**
 * Returns the existing files named in a hook file's commands, such as `scripts/guard.sh` in
 * `bash scripts/guard.sh`, so they can be backed up with the hook file. Commands are read from
 * every event in the file, including events VS Code does not run. Only files inside
 * `workspaceRootUri` (the workspace folder that contains the hook file) or next to the hook file
 * are included. Files that a script loads itself are not found.
 */
export async function resolveHookCommandFiles(hookFileUri: URI, workspaceRootUri: URI | undefined, userHome: string, fileService: IFileService): Promise<URI[]> {
	let json: unknown;
	try {
		json = parseJSONC((await fileService.readFile(hookFileUri)).value.toString());
	} catch {
		return [];
	}
	const allowedRoots = [dirname(hookFileUri), ...(workspaceRootUri ? [workspaceRootUri] : [])];
	const found = new ResourceMap<URI>();
	const events = json && typeof json === 'object' ? (json as Record<string, unknown>).hooks : undefined;
	if (!events || typeof events !== 'object' || Array.isArray(events)) {
		return [];
	}
	for (const items of Object.values(events)) {
		const hooks = Array.isArray(items) ? items.flatMap(item => extractHookCommandsFromItem(item, workspaceRootUri, userHome)) : [];
		for (const hook of hooks) {
			const baseUri = hook.cwd ?? workspaceRootUri ?? dirname(hookFileUri);
			for (const command of [hook.command, hook.windows, hook.linux, hook.osx]) {
				for (const token of command ? getCommandPathTokens(command, userHome) : []) {
					const uri = isAbsolute(token) ? URI.file(token).with({ scheme: baseUri.scheme, authority: baseUri.authority }) : joinPath(baseUri, token.replace(/\\/g, '/'));
					if (!found.has(uri) && allowedRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(uri, root)) && await isRegularFile(uri, fileService)) {
						found.set(uri, uri);
					}
				}
			}
		}
	}
	return [...found.values()];
}

function getCommandPathTokens(command: string, userHome: string): string[] {
	return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [])
		.map(token => untildify(token.replace(/^["']|["']$/g, '').replace(/^\$\{?HOME\}?(?=[\\/])/, '~'), userHome))
		.filter(token => /[\\/]|\.[A-Za-z0-9]+$/.test(token) && !token.startsWith('-') && !token.includes('$'));
}

async function isRegularFile(uri: URI, fileService: IFileService): Promise<boolean> {
	try {
		const stat = await fileService.stat(uri);
		return stat.isFile && !stat.isSymbolicLink;
	} catch {
		return false;
	}
}

/** Explains that a user's own hook file is in the deprecated Local hook format and how to migrate it. */
export function getLocalFormatHookMessage(): string {
	return localize('localFormatHook', "This hook file uses the deprecated Local hook format and may not work in Copilot sessions. Migrate it with the agent from Migrations in a local Copilot session.");
}

/**
 * Marks hooks from files that use the deprecated Local hook format as needing attention.
 *
 * - The user's own hook files point to Migrate with Agent in a local Copilot session.
 * - Hooks from Copilot-format plugins point to the plugin's publisher.
 * - Claude, Open Plugin and Agent Plugin format plugins use capitalised event names by design and are never marked.
 * - Administrator, built-in and unidentified plugin hooks are not marked.
 * - Hooks that already report a problem keep it.
 */
export async function markLocalFormatHookItems<T extends ILocalFormatHookMarkable>(items: readonly T[], plugins: readonly IAgentPlugin[], fileService: IFileService): Promise<T[]> {
	const candidates = items.filter(item => item.promptType === PromptsType.hook && item.status !== 'error' && item.status !== 'degraded');
	if (candidates.length === 0) {
		return [...items];
	}

	const pluginByItem = new Map<T, IAgentPlugin | undefined>();
	const toRead: URI[] = [];
	for (const item of candidates) {
		// Administrator and built-in hooks are not the user's to migrate.
		if (item.organizationControl !== undefined || item.source === AICustomizationSources.builtin) {
			continue;
		}
		const plugin = plugins.find(p => (item.pluginUri && extUriBiasedIgnorePathCase.isEqualOrParent(item.pluginUri, p.uri)) || extUriBiasedIgnorePathCase.isEqualOrParent(item.uri, p.uri));
		// A plugin hook whose plugin format is unknown is left alone rather than wrongly marked.
		if (plugin ? plugin.format !== PluginFormat.Copilot : (!!item.pluginUri || item.source === AICustomizationSources.plugin)) {
			continue;
		}
		pluginByItem.set(item, plugin);
		toRead.push(item.uri);
	}

	const eventsByUri = await readLocalFormatHookEvents(toRead, fileService);
	return items.map(item => {
		if (!pluginByItem.has(item) || !eventsByUri.get(item.uri)?.length) {
			return item;
		}
		const plugin = pluginByItem.get(item);
		return {
			...item,
			status: 'degraded',
			localFormatHook: true,
			statusMessage: plugin
				? localize('localFormatPluginHook', "The hooks in the {0} plugin use the deprecated Local hook format and may not work in Copilot sessions. Contact the plugin's publisher.", plugin.label)
				: getLocalFormatHookMessage(),
		};
	});
}
