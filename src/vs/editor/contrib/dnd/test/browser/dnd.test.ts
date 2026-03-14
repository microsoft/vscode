/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DragAndDropController } from '../../browser/dnd.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { Selection } from '../../../../common/core/selection.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { Event } from '../../../../../base/common/event.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';

class TestContextMenuService implements IContextMenuService {
	_serviceBrand: undefined;
	readonly onDidShowContextMenu = Event.None;
	readonly onDidHideContextMenu = Event.None;
	
	public lastDelegate: IContextMenuDelegate | undefined;
	
	showContextMenu(delegate: IContextMenuDelegate): void {
		this.lastDelegate = delegate;
	}
}

suite('DragAndDropController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should initialize without errors', () => {
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			instantiationService.stub(IContextMenuService, new TestContextMenuService());
			const controller = editor.registerAndInstantiateContribution(DragAndDropController.ID, DragAndDropController);
			assert.ok(controller);
		});
	});

	test('should track controller instance', () => {
		withTestCodeEditor('hello world', {}, (editor, viewModel, instantiationService) => {
			instantiationService.stub(IContextMenuService, new TestContextMenuService());
			const controller = editor.registerAndInstantiateContribution(DragAndDropController.ID, DragAndDropController);
			assert.ok(controller);
			
			// Set selection
			editor.setSelection(new Selection(1, 1, 1, 6));
			
			// Verify controller exists and is registered
			const retrievedController = DragAndDropController.get(editor);
			assert.strictEqual(retrievedController, controller);
		});
	});

	test('should have proper dependency injection for IContextMenuService', () => {
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			// Register a mock context menu service
			const contextMenuService = new TestContextMenuService();
			instantiationService.stub(IContextMenuService, contextMenuService);
			
			const controller = editor.registerAndInstantiateContribution(DragAndDropController.ID, DragAndDropController);
			assert.ok(controller);
		});
	});
});
