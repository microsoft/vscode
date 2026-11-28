/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IDiffComputationResult } from '../../../../../editor/common/diff/legacyLinesDiffComputer.js';
import { IDiffEditorModel } from '../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { onDidDiffComputationTimeOut } from '../../browser/diffComputationTimeout.js';

suite('onDidDiffComputationTimeOut', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Which diffs timed out is remembered for the window, so every run uses new resources.
	const runId = generateUuid();

	function createDiff(name: string): IDiffEditorModel {
		const createTextModel = (side: string) => new class extends mock<ITextModel>() {
			override readonly uri = URI.parse(`test://${runId}/${side}/${name}`);
		}();
		return { original: createTextModel('original'), modified: createTextModel('modified') };
	}

	function createDiffEditor(name: string, callbacks: string[]) {
		const onDidUpdateDiff = store.add(new Emitter<void>());
		let shown: { readonly diff: IDiffEditorModel; readonly quitEarly: boolean } | undefined;
		const diffEditor = new class extends mock<IDiffEditor>() {
			override readonly onDidUpdateDiff = onDidUpdateDiff.event;
			override getModel(): IDiffEditorModel | null {
				return shown?.diff ?? null;
			}
			override getDiffComputationResult(): IDiffComputationResult | null {
				return shown ? { quitEarly: shown.quitEarly, identical: false, changes: [], changes2: [] } : null;
			}
		}();
		store.add(onDidDiffComputationTimeOut(diffEditor, () => callbacks.push(`${name}: ${basename(shown!.diff.modified.uri)}`)));
		return {
			/** Shows a computed diff, as when the diff is (re)computed or when the diff editor is given another diff. */
			showDiff(diff: IDiffEditorModel, quitEarly: boolean): void {
				shown = { diff, quitEarly };
				onDidUpdateDiff.fire();
			},
		};
	}

	test('calls back once per diff, across diff editors', () => {
		const callbacks: string[] = [];
		const largeDiff = createDiff('large.json');
		const otherLargeDiff = createDiff('otherLarge.json');
		const smallDiff = createDiff('small.ts');
		const diffEditor1 = createDiffEditor('diffEditor1', callbacks);
		const diffEditor2 = createDiffEditor('diffEditor2', callbacks);

		diffEditor1.showDiff(largeDiff, true);
		diffEditor1.showDiff(largeDiff, true); // recomputed after an edit
		diffEditor2.showDiff(smallDiff, false);
		diffEditor2.showDiff(largeDiff, true); // a multi diff editor reuses the diff editor for the large diff while scrolling
		diffEditor2.showDiff(otherLargeDiff, true);

		assert.deepStrictEqual(callbacks, [
			'diffEditor1: large.json',
			'diffEditor2: otherLarge.json',
		]);
	});
});
