/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PastePayload } from '../../../../../../editor/browser/editorBrowser.js';
import { CursorsController } from '../../../../../../editor/common/cursor/cursor.js';
import { Handler, ITriggerEditorOperationEvent } from '../../../../../../editor/common/editorCommon.js';
import { NotebookMultiCursorController } from '../../../browser/contrib/multicursor/notebookMulticursor.js';
import { ICellViewModel } from '../../../browser/notebookBrowser.js';

interface TestNotebookMultiCursorController {
	handleEditorOperationEvent(event: ITriggerEditorOperationEvent): void;
}

suite('NotebookMultiCursorController', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards block paste to mirrored cells', () => {
		const anchorCell = new class extends mock<ICellViewModel>() {
			override readonly handle = 1;
			override readonly uri = URI.parse('test:///notebook/cell1');
		};
		const mirroredCell = new class extends mock<ICellViewModel>() {
			override readonly handle = 2;
			override readonly uri = URI.parse('test:///notebook/cell2');
		};
		const mirroredController: CursorsController = Object.create(CursorsController.prototype);
		let mirroredIsBlock: boolean | undefined;
		mirroredController.paste = (_eventsCollector, _text, _pasteOnNewLine, _multicursorText, _source, isBlock) => {
			mirroredIsBlock = isBlock;
		};

		const cursorsControllers = new ResourceMap<CursorsController>();
		cursorsControllers.set(mirroredCell.uri, mirroredController);
		const controller: TestNotebookMultiCursorController = Object.assign(
			Object.create(NotebookMultiCursorController.prototype),
			{
				anchorCell: [anchorCell, Object.create(null)],
				trackedCells: [{ cellViewModel: anchorCell }, { cellViewModel: mirroredCell }],
				cursorsControllers,
			}
		);

		const event: ITriggerEditorOperationEvent = {
			handlerId: Handler.Paste,
			payload: {
				text: 'A\nBC\nD',
				pasteOnNewLine: false,
				multicursorText: ['A', 'BC', 'D'],
				mode: null,
				isBlock: true,
			} satisfies PastePayload,
			source: 'keyboard',
		};
		controller.handleEditorOperationEvent(event);

		assert.strictEqual(mirroredIsBlock, true);
	});
});
