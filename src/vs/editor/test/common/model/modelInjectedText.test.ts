/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Range } from '../../../common/core/range.js';
import { InternalModelContentChangeEvent, ModelInjectedTextChangedEvent, ModelRawChange, RawContentChangedType } from '../../../common/textModelEvents.js';
import { IViewModel } from '../../../common/viewModel.js';
import { createTextModel } from '../testTextModel.js';

suite('Editor Model - Injected Text Events', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Basic', () => {
		const thisModel = store.add(createTextModel('First Line\nSecond Line'));

		const recordedChanges = new Array<unknown>();

		const spyViewModel = new class extends mock<IViewModel>() {
			override onDidChangeContentOrInjectedText(e: InternalModelContentChangeEvent | ModelInjectedTextChangedEvent) {
				const changes = (e instanceof InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes);
				for (const change of changes) {
					recordedChanges.push(mapChange(change));
				}
			}
			override emitContentChangeEvent(_e: InternalModelContentChangeEvent | ModelInjectedTextChangedEvent): void { }
		};
		thisModel.registerViewModel(spyViewModel);

		// Initial decoration
		let decorations = thisModel.deltaDecorations([], [{
			options: {
				after: { content: 'injected1' },
				description: 'test1',
				showIfCollapsed: true
			},
			range: new Range(1, 1, 1, 1),
		}]);
		assert.deepStrictEqual(recordedChanges.splice(0), [
			{
				kind: 'lineChanged',
				lineNumber: 1,
				lineNumberPostEdit: 1,
			}
		]);

		// Decoration change
		decorations = thisModel.deltaDecorations(decorations, [{
			options: {
				after: { content: 'injected1' },
				description: 'test1',
				showIfCollapsed: true
			},
			range: new Range(2, 1, 2, 1),
		}, {
			options: {
				after: { content: 'injected2' },
				description: 'test2',
				showIfCollapsed: true
			},
			range: new Range(2, 2, 2, 2),
		}]);
		assert.deepStrictEqual(recordedChanges.splice(0), [
			{
				kind: 'lineChanged',
				lineNumber: 1,
				lineNumberPostEdit: 1,
			},
			{
				kind: 'lineChanged',
				lineNumber: 2,
				lineNumberPostEdit: 2,
			}
		]);

		// Simple Insert
		thisModel.applyEdits([EditOperation.replace(new Range(2, 2, 2, 2), 'Hello')]);
		assert.deepStrictEqual(recordedChanges.splice(0), [
			{
				kind: 'lineChanged',
				lineNumber: 2,
				lineNumberPostEdit: 2,
			}
		]);

		// Multi-Line Insert
		thisModel.pushEditOperations(null, [EditOperation.replace(new Range(2, 2, 2, 2), '\n\n\n')], null);
		assert.deepStrictEqual(thisModel.getAllDecorations(undefined).map(d => ({ description: d.options.description, range: d.range.toString() })), [{
			'description': 'test1',
			'range': '[2,1 -> 2,1]'
		},
		{
			'description': 'test2',
			'range': '[2,2 -> 5,6]'
		}]);
		assert.deepStrictEqual(recordedChanges.splice(0), [
			{
				kind: 'lineChanged',
				lineNumber: 2,
				lineNumberPostEdit: 2,
			},
			{
				kind: 'linesInserted',
				fromLineNumber: 3,
				count: 3,
			}
		]);


		// Multi-Line Replace
		thisModel.pushEditOperations(null, [EditOperation.replace(new Range(3, 1, 5, 1), '\n\n\n\n\n\n\n\n\n\n\n\n\n')], null);
		assert.deepStrictEqual(recordedChanges.splice(0), [
			{
				kind: 'lineChanged',
				lineNumber: 5,
				lineNumberPostEdit: 5,
			},
			{
				kind: 'lineChanged',
				lineNumber: 4,
				lineNumberPostEdit: 4,
			},
			{
				kind: 'lineChanged',
				lineNumber: 3,
				lineNumberPostEdit: 3,
			},
			{
				kind: 'linesInserted',
				fromLineNumber: 6,
				count: 11,
			}
		]);

		// Multi-Line Replace undo
		assert.strictEqual(thisModel.undo(), undefined);
		assert.deepStrictEqual(recordedChanges.splice(0), [
			{
				kind: 'lineChanged',
				lineNumber: 2,
				lineNumberPostEdit: 2,
			},
			{
				kind: 'linesDeleted',
			}
		]);

		thisModel.unregisterViewModel(spyViewModel);
	});
});

function mapChange(change: ModelRawChange): unknown {
	if (change.changeType === RawContentChangedType.LineChanged) {
		return {
			kind: 'lineChanged',
			lineNumber: change.lineNumber,
			lineNumberPostEdit: change.lineNumberPostEdit,
		};
	} else if (change.changeType === RawContentChangedType.LinesInserted) {
		return {
			kind: 'linesInserted',
			fromLineNumber: change.fromLineNumber,
			count: change.count,
		};
	} else if (change.changeType === RawContentChangedType.LinesDeleted) {
		return {
			kind: 'linesDeleted',
		};
	} else if (change.changeType === RawContentChangedType.EOLChanged) {
		return {
			kind: 'eolChanged'
		};
	} else if (change.changeType === RawContentChangedType.Flush) {
		return {
			kind: 'flush'
		};
	}
	return { kind: 'unknown' };
}
