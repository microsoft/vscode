/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DragAndDropController } from '../../browser/dnd.js';
import { MouseTargetType, IPartialEditorMouseEvent } from '../../../../browser/editorBrowser.js';
import { Position } from '../../../../common/core/position.js';
import { Selection } from '../../../../common/core/selection.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { EditorPagePosition } from '../../../../browser/editorDom.js';

suite('DragAndDropController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('cross-surface drops are rejected', () => {
		withTestCodeEditor('', {}, (editor) => {
			const controller = editor.registerAndInstantiateContribution(DragAndDropController.ID, DragAndDropController);
			
			editor.setSelection(new Selection(1, 1, 1, 1));
			(controller as any)._dragSelection = new Selection(1, 1, 1, 1);

			let executeCommandCalled = false;
			let setSelectionsCalled = false;
			editor.executeCommand = () => { executeCommandCalled = true; };
			editor.setSelections = () => { setSelectionsCalled = true; };

			const mockEditorPos = new EditorPagePosition(100, 100, 200, 200);

			// Test 1: Drop over an unrelated surface (e.g. Explorer)
			// coordinates: (50, 150) -> outside left of editor
			let dropEventExplorer = <IPartialEditorMouseEvent><any>{
				event: { editorPos: mockEditorPos, posx: 50, posy: 150 },
				target: { type: MouseTargetType.OUTSIDE_EDITOR, position: new Position(1, 1) }
			};

			(editor as any)._onMouseDrop.fire(dropEventExplorer);
			assert.strictEqual(executeCommandCalled, false);
			assert.strictEqual(setSelectionsCalled, false);
			
			// Reset for next test
			(controller as any)._dragSelection = new Selection(1, 1, 1, 1);
			executeCommandCalled = false;
			setSelectionsCalled = false;

			// Test 2: Intended editor-local outside drop (e.g. padding/gutter)
			// coordinates: (110, 150) -> inside editor rect
			let dropEventPadding = <IPartialEditorMouseEvent><any>{
				event: { editorPos: mockEditorPos, posx: 110, posy: 150 },
				target: { type: MouseTargetType.OUTSIDE_EDITOR, position: new Position(1, 5) }
			};

			(editor as any)._onMouseDrop.fire(dropEventPadding);
			// Since we mock executeCommand and it drops at (1, 5) which is not in selection (1, 1), it should execute command
			assert.strictEqual(executeCommandCalled, true);
		});
	});
});
