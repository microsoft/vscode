/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../base/common/platform.js';

export const enum TerminalSandboxWriteAllowListOperation {
	Node = 'node',
}

const terminalSandboxWriteAllowListKeywordMap: ReadonlyMap<string, TerminalSandboxWriteAllowListOperation> = new Map([
	['node', TerminalSandboxWriteAllowListOperation.Node],
	['npm', TerminalSandboxWriteAllowListOperation.Node],
	['npx', TerminalSandboxWriteAllowListOperation.Node],
	['pnpm', TerminalSandboxWriteAllowListOperation.Node],
	['yarn', TerminalSandboxWriteAllowListOperation.Node],
	['corepack', TerminalSandboxWriteAllowListOperation.Node],
	['bun', TerminalSandboxWriteAllowListOperation.Node],
	['deno', TerminalSandboxWriteAllowListOperation.Node],
	['nvm', TerminalSandboxWriteAllowListOperation.Node],
	['volta', TerminalSandboxWriteAllowListOperation.Node],
	['fnm', TerminalSandboxWriteAllowListOperation.Node],
	['asdf', TerminalSandboxWriteAllowListOperation.Node],
	['mise', TerminalSandboxWriteAllowListOperation.Node],
]);

/**
 * Paths that common developer tools typically need to write when the user's home
 * directory is broadly denied. This list intentionally starts small and only
 * grants write access to tool-managed directories that are needed by commands.
 */
function getTerminalSandboxWriteAllowListForOperation(operation: TerminalSandboxWriteAllowListOperation, os: OperatingSystem): readonly string[] {
	switch (operation) {
		case TerminalSandboxWriteAllowListOperation.Node:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.volta/',
					];
			}
	}
}

export function getTerminalSandboxWriteAllowListForCommands(os: OperatingSystem, commandKeywords: readonly string[]): readonly string[] {
	if (commandKeywords.length === 0) {
		return [];
	}

	const operations = new Set<TerminalSandboxWriteAllowListOperation>();
	for (const keyword of commandKeywords) {
		const operation = terminalSandboxWriteAllowListKeywordMap.get(keyword.toLowerCase());
		if (operation) {
			operations.add(operation);
		}
	}

	if (operations.size === 0) {
		return [];
	}

	const paths = [...operations].flatMap(operation => getTerminalSandboxWriteAllowListForOperation(operation, os));
	return [...new Set(paths)];
}
