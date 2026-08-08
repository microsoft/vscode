/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../files/common/files.js';
import { parseHooksJson, readJsonFile } from '../../../../../agentPlugins/common/pluginParsers.js';
import { type HookCustomization } from '../../../../common/state/protocol/channels-session/state.js';

/**
 * The JSON files a Claude session reads hook declarations from, in
 * precedence order (project before user). Mirrors the SDK's
 * `settingSources: ['user', 'project', 'local']` scopes (the `managed`
 * scope is intentionally excluded). `settings.local.json` is the
 * gitignored project-local override; the SDK loads it alongside
 * `settings.json`.
 */
function claudeHookFiles(workingDirectory: URI | undefined, userHome: URI): URI[] {
	const files: URI[] = [];
	if (workingDirectory) {
		files.push(URI.joinPath(workingDirectory, '.claude', 'settings.json'));
		files.push(URI.joinPath(workingDirectory, '.claude', 'settings.local.json'));
	}
	files.push(URI.joinPath(userHome, '.claude', 'settings.json'));
	return files;
}

/**
 * Scans a Claude session's `settings.json` / `settings.local.json` files
 * (project + user scope) for a `hooks` block and surfaces each declaring
 * file as a single {@link HookCustomization} pointing at the real settings
 * file (so the workbench can open it for editing).
 *
 * Hooks already *fire* at runtime — the SDK loads them via `settingSources`
 * — so this is discovery only. There is no SDK enumeration API for hooks,
 * so the result is never filtered against the live session (unlike
 * agents / skills / MCP servers); it mirrors the rules tier.
 *
 * Parsing (including the `disableAllHooks` short-circuit and the canonical
 * event-name mapping) is delegated to the shared {@link parseHooksJson};
 * a scope that declares no recognized hooks contributes no entry.
 */
export async function scanClaudeHooks(
	workingDirectory: URI | undefined,
	userHome: URI,
	fileService: IFileService,
): Promise<readonly HookCustomization[]> {
	const result: HookCustomization[] = [];
	const seen = new ResourceSet();
	for (const uri of claudeHookFiles(workingDirectory, userHome)) {
		if (seen.has(uri)) {
			// The same settings file can be reached from two scopes (e.g. the
			// user opened their home directory as the workspace) — surface it
			// once. Mirrors the dedupe in `scanClaudeMcpServers`.
			continue;
		}
		seen.add(uri);
		const raw = await readJsonFile(uri, fileService);
		if (raw === undefined) {
			continue;
		}
		// All groups parsed from one file share a single file-level
		// `customization`, so the first group carries the entry we surface.
		const groups = parseHooksJson(uri, raw, workingDirectory, userHome);
		if (groups.length > 0) {
			result.push(groups[0].customization);
		}
	}
	return result;
}
