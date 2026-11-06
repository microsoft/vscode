/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionFolderPickerDecision } from '../../common/state/sessionState.js';

/**
 * Shared multi-root Folder-picker decision, expressed over a per-provider
 * "does this working directory carry configuration that pins it as the primary"
 * predicate. Each provider (Copilot hooks, Claude MCP/hooks, Codex hooks)
 * supplies its own {@link hasSelectionCriteria}; the count of qualifying
 * directories drives a single, uniform rule:
 *
 * - **0 qualifying** → hide the picker and keep whatever folder is selected
 *   (`{ hidden: true }`, no primary): with nothing to pin, any folder is fine.
 * - **exactly 1** → hide the picker and pin that folder (`{ hidden: true,
 *   primary }`).
 * - **2 or more** → show the picker (`{ hidden: false }`) so the user resolves
 *   which folder's configuration should lead.
 *
 * Returns `undefined` for a single working directory (the picker never applies),
 * so callers can seed "no decision" for non-multi-root sessions.
 *
 * The predicate is run for every working directory in parallel; the provider is
 * responsible for how it treats missing/unreadable directories.
 */
export async function computeFolderPickerDecisionForRoots(
	workingDirectories: readonly URI[],
	hasSelectionCriteria: (workingDirectory: URI, token: CancellationToken) => Promise<boolean>,
	token: CancellationToken = CancellationToken.None,
): Promise<ISessionFolderPickerDecision | undefined> {
	if (workingDirectories.length <= 1) {
		return undefined;
	}
	const results = await Promise.all(workingDirectories.map(directory => hasSelectionCriteria(directory, token)));
	const qualifying = workingDirectories.filter((_, index) => results[index]);
	if (qualifying.length >= 2) {
		return { hidden: false };
	}
	if (qualifying.length === 1) {
		return { hidden: true, primary: qualifying[0].toString() };
	}
	return { hidden: true };
}
