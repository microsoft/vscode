/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IDiffEditor } from '../../../../editor/browser/editorBrowser.js';

/**
 * The diffs, by original and modified resource, for which {@link onDidDiffComputationTimeOut} called back in this window.
 */
const timedOutDiffs = new Set<string>();

/**
 * Calls `callback` when the diff computation of `diffEditor` stops early because it takes longer than
 * `diffEditor.maxComputationTime`, but only once per diff (original and modified resource) in this window,
 * across all diff editors.
 *
 * The same diff times out again whenever its documents change, and diff editors that are given a diff
 * that was already computed report its result again, e.g. the diff editors that a multi diff editor
 * reuses for other files while scrolling.
 */
export function onDidDiffComputationTimeOut(diffEditor: IDiffEditor, callback: () => void): IDisposable {
	return diffEditor.onDidUpdateDiff(() => {
		const model = diffEditor.getModel();
		if (!model || !diffEditor.getDiffComputationResult()?.quitEarly) {
			return;
		}
		const key = JSON.stringify([model.original.uri.toString(), model.modified.uri.toString()]);
		if (!timedOutDiffs.has(key)) {
			timedOutDiffs.add(key);
			callback();
		}
	});
}
