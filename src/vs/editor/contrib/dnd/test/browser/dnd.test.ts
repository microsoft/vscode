import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DragAndDropController } from '../../browser/dnd.js';
import { MouseTargetType } from '../../../browser/editorBrowser.js';
import { IPartialEditorMouseEvent } from '../../../browser/controller/mouseTarget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { withTestCodeEditor } from '../../../test/browser/testCodeEditor.js';
import { EditorPagePosition } from '../../../browser/editorDom.js';

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

			(controller as any)._onEditorMouseDrop(dropEventExplorer);
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

			(controller as any)._onEditorMouseDrop(dropEventPadding);
			// Since we mock executeCommand and it drops at (1, 5) which is not in selection (1, 1), it should execute command
			assert.strictEqual(executeCommandCalled, true);
		});
	});
});
