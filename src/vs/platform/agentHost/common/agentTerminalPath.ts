/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from '../../../base/common/path.js';

/**
 * Absolute directories that extensions of one client opted into agent terminal
 * `PATH` (see the `terminalAgentEnvironment` API proposal), in the order
 * terminals apply them.
 */
export interface IAgentTerminalPath {
	readonly prepend: readonly string[];
	readonly append: readonly string[];
}

export const emptyAgentTerminalPath: IAgentTerminalPath = { prepend: [], append: [] };

/** Notification a local client sends to contribute its {@link IAgentTerminalPath}. */
export const SetClientAgentTerminalPathMethod = 'setClientAgentTerminalPath';

/**
 * Validates an untrusted contribution, keeping only absolute single-line
 * directories so they are safe to embed in shell scripts.
 */
export function readAgentTerminalPath(value: unknown): IAgentTerminalPath {
	const read = (entries: unknown) => Array.isArray(entries)
		? entries.filter((entry): entry is string => typeof entry === 'string' && isAbsolute(entry) && !/[\0-\x1f]/.test(entry))
		: [];
	const raw = typeof value === 'object' && value !== null ? value as Partial<Record<keyof IAgentTerminalPath, unknown>> : {};
	return { prepend: read(raw.prepend), append: read(raw.append) };
}

/** Combines contributions in order, keeping the first occurrence of each directory. */
export function combineAgentTerminalPaths(paths: Iterable<IAgentTerminalPath>): IAgentTerminalPath {
	const prepend = new Set<string>();
	const append = new Set<string>();
	for (const path of paths) {
		path.prepend.forEach(directory => prepend.add(directory));
		path.append.forEach(directory => append.add(directory));
	}
	return { prepend: [...prepend], append: [...append].filter(directory => !prepend.has(directory)) };
}
