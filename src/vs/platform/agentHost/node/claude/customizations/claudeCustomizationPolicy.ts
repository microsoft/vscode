/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';

/**
 * First-seen-per-key wins across `groups` (ordered highest precedence first).
 * `onShadowed` is invoked for each later item dropped because its key was
 * already claimed, receiving the dropped item and the winning item.
 */
export function selectFirstClaudeCustomizationByKey<T>(groups: readonly (readonly T[])[], keyOf: (item: T) => string, onShadowed?: (shadowed: T, winner: T) => void): readonly T[] {
	const selected = new Map<string, T>();
	for (const group of groups) {
		for (const item of group) {
			const key = keyOf(item);
			if (!selected.has(key)) {
				selected.set(key, item);
				continue;
			}
			const winner = selected.get(key);
			if (winner !== undefined) {
				onShadowed?.(item, winner);
			}
		}
	}
	return [...selected.values()];
}

export function selectEnabledClaudePluginIds(groups: readonly ReadonlyMap<string, boolean>[]): readonly string[] {
	const selected = new Map<string, boolean>();
	for (const group of groups) {
		for (const [id, enabled] of group) {
			if (!selected.has(id)) {
				selected.set(id, enabled);
			}
		}
	}
	return [...selected].filter(([, enabled]) => enabled).map(([id]) => id);
}

export function findMostSpecificClaudeWorkspaceRoot(resource: URI, workingDirectories: readonly URI[]): URI | undefined {
	let result: URI | undefined;
	for (const directory of workingDirectories) {
		if (resource.scheme === directory.scheme && isEqualOrParent(resource, directory) && (!result || directory.path.length > result.path.length)) {
			result = directory;
		}
	}
	return result;
}
