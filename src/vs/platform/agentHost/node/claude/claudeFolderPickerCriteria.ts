/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCancelablePromise, firstParallel } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { parseHooksJson, readJsonFile } from '../../../agentPlugins/common/pluginParsers.js';

/**
 * Whether a Claude working directory carries configuration that pins it as the
 * multi-root primary — used only to decide the Folder picker, never to surface
 * customizations.
 *
 * A directory qualifies when it declares MCP servers or hooks:
 * - `<dir>/.mcp.json` exists (a dedicated MCP manifest — presence is enough); or
 * - `<dir>/.claude/settings.json` or `settings.local.json` declares a **non-empty**
 *   `hooks` block. These are general settings files, so their mere presence is not
 *   enough; the JSON is parsed with the same {@link parseHooksJson} rules Claude
 *   discovery uses (honoring `disableAllHooks`), and the directory qualifies only
 *   when at least one real hook group results.
 *
 * The probes run in parallel and the first that qualifies wins, cancelling the
 * rest; a cancelled {@link token} aborts them all. Missing or unreadable files
 * count as "not qualifying".
 */
export async function claudeDirectoryQualifiesForPrimary(fileService: IFileService, workingDirectory: URI, userHome: URI, token: CancellationToken = CancellationToken.None): Promise<boolean> {
	const probes: Array<() => Promise<boolean>> = [
		() => fileService.exists(joinPath(workingDirectory, '.mcp.json')),
		...['settings.json', 'settings.local.json'].map(fileName => {
			const uri = joinPath(workingDirectory, '.claude', fileName);
			return async (): Promise<boolean> => {
				const json = await readJsonFile(uri, fileService);
				return json !== undefined && parseHooksJson(uri, json, workingDirectory, userHome).length > 0;
			};
		}),
	];
	const running = probes.map(probe => createCancelablePromise(() => probe()));
	const abort = token.onCancellationRequested(() => running.forEach(probe => probe.cancel()));
	try {
		return (await firstParallel(running, qualifies => qualifies, false)) ?? false;
	} finally {
		abort.dispose();
	}
}
