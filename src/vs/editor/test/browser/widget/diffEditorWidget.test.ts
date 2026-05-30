/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DiffEditorViewModel, UnchangedRegion } from '../../../browser/widget/diffEditor/diffEditorViewModel.js';
import { DiffEditorOptions } from '../../../browser/widget/diffEditor/diffEditorOptions.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { Range } from '../../../common/core/range.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from '../../../common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../common/diff/linesDiffComputers.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';
import { ITextModel } from '../../../common/model.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { createModelServices, instantiateTextModel } from '../../common/testTextModel.js';

suite('DiffEditorWidget2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('UnchangedRegion', () => {
		function serialize(regions: UnchangedRegion[]): unknown {
			return regions.map(r => `${r.originalUnchangedRange} - ${r.modifiedUnchangedRange}`);
		}

		test('Everything changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(1, 10), new LineRange(1, 10), [])],
				10,
				10,
				3,
				3,
			)), []);
		});

		test('Nothing changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[],
				10,
				10,
				3,
				3,
			)), [
				'[1,11) - [1,11)'
			]);
		});

		test('Change in the middle', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(50, 60), new LineRange(50, 60), [])],
				100,
				100,
				3,
				3,
			)), ([
				'[1,47) - [1,47)',
				'[63,101) - [63,101)'
			]));
		});

		test('Change at the end', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(99, 100), new LineRange(100, 100), [])],
				100,
				100,
				3,
				3,
			)), (['[1,96) - [1,96)']));
		});
	});

	suite('DiffEditorViewModel', () => {
		test('applies concurrent modified edits before normalizing inner changes', async () => {
			const disposables = new DisposableStore();
			try {
				const instantiationService = createModelServices(disposables);
				const original = disposables.add(instantiateTextModel(instantiationService, 'keep1\nkeep2\nkeep3\norig4'));
				const modified = disposables.add(instantiateTextModel(instantiationService, 'keep1\nkeep2\nkeep3\nmod4'));
				const diffProviderFactoryService = new ConcurrentEditDiffProviderFactoryService(() => {
					modified.applyEdits([{ range: new Range(1, 1, 2, 1), text: '' }]);
				});
				const options = new DiffEditorOptions({}, new TestAccessibilityService());
				const viewModel = disposables.add(new DiffEditorViewModel({ original, modified }, options, diffProviderFactoryService));

				await viewModel.waitForDiff();

				const diff = viewModel.diff.get();
				assert.ok(diff);

				for (const mapping of diff.mappings) {
					assert.ok(mapping.lineRangeMapping.original.endLineNumberExclusive <= original.getLineCount() + 1);
					assert.ok(mapping.lineRangeMapping.modified.endLineNumberExclusive <= modified.getLineCount() + 1);
					for (const innerChange of mapping.lineRangeMapping.innerChanges ?? []) {
						assert.doesNotThrow(() => modified.getLineMaxColumn(innerChange.modifiedRange.endLineNumber));
					}
				}
			} finally {
				disposables.dispose();
			}
		});
	});
});

class ConcurrentEditDiffProviderFactoryService implements IDiffProviderFactoryService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly editDuringResolve: () => void) { }

	createDiffProvider(): IDocumentDiffProvider {
		return new ConcurrentEditDiffProvider(this.editDuringResolve);
	}
}

class ConcurrentEditDiffProvider implements IDocumentDiffProvider {
	private didInjectEdit = false;
	readonly onDidChange = Event.None;

	constructor(private readonly editDuringResolve: () => void) { }

	computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff> {
		const originalLines = original.getLinesContent();
		const modifiedLines = modified.getLinesContent();
		const result = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, options);

		return new Promise<IDocumentDiff>(resolve => {
			queueMicrotask(() => {
				resolve({
					changes: result.changes,
					quitEarly: result.hitTimeout,
					identical: original.getValue() === modified.getValue(),
					moves: result.moves,
				});
				if (!this.didInjectEdit) {
					this.didInjectEdit = true;
					this.editDuringResolve();
				}
			});
		});
	}
}
