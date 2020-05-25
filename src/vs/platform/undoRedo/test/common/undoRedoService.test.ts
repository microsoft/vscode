/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { UndoRedoElementType, IUndoRedoElement } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';

suite('UndoRedoService', () => {

	function createUndoRedoService(): UndoRedoService {
		const dialogService = new TestDialogService();
		const notificationService = new TestNotificationService();
		return new UndoRedoService(dialogService, notificationService);
	}

	test('simple single element', () => {
		const resource = URI.file('test.txt');
		const service = createUndoRedoService();

		assert.equal(service.canUndo(resource), false);
		assert.equal(service.canRedo(resource), false);
		assert.equal(service.hasElements(resource), false);
		assert.ok(service.getLastElement(resource) === null);

		let undoCall1 = 0;
		let redoCall1 = 0;
		const element1: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: resource,
			label: 'typing 1',
			undo: () => { undoCall1++; },
			redo: () => { redoCall1++; }
		};
		service.pushElement(element1);

		assert.equal(undoCall1, 0);
		assert.equal(redoCall1, 0);
		assert.equal(service.canUndo(resource), true);
		assert.equal(service.canRedo(resource), false);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === element1);

		service.undo(resource);
		assert.equal(undoCall1, 1);
		assert.equal(redoCall1, 0);
		assert.equal(service.canUndo(resource), false);
		assert.equal(service.canRedo(resource), true);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === null);

		service.redo(resource);
		assert.equal(undoCall1, 1);
		assert.equal(redoCall1, 1);
		assert.equal(service.canUndo(resource), true);
		assert.equal(service.canRedo(resource), false);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === element1);

		let undoCall2 = 0;
		let redoCall2 = 0;
		const element2: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: resource,
			label: 'typing 2',
			undo: () => { undoCall2++; },
			redo: () => { redoCall2++; }
		};
		service.pushElement(element2);

		assert.equal(undoCall1, 1);
		assert.equal(redoCall1, 1);
		assert.equal(undoCall2, 0);
		assert.equal(redoCall2, 0);
		assert.equal(service.canUndo(resource), true);
		assert.equal(service.canRedo(resource), false);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === element2);

		service.undo(resource);

		assert.equal(undoCall1, 1);
		assert.equal(redoCall1, 1);
		assert.equal(undoCall2, 1);
		assert.equal(redoCall2, 0);
		assert.equal(service.canUndo(resource), true);
		assert.equal(service.canRedo(resource), true);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === null);

		let undoCall3 = 0;
		let redoCall3 = 0;
		const element3: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: resource,
			label: 'typing 2',
			undo: () => { undoCall3++; },
			redo: () => { redoCall3++; }
		};
		service.pushElement(element3);

		assert.equal(undoCall1, 1);
		assert.equal(redoCall1, 1);
		assert.equal(undoCall2, 1);
		assert.equal(redoCall2, 0);
		assert.equal(undoCall3, 0);
		assert.equal(redoCall3, 0);
		assert.equal(service.canUndo(resource), true);
		assert.equal(service.canRedo(resource), false);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === element3);

		service.undo(resource);

		assert.equal(undoCall1, 1);
		assert.equal(redoCall1, 1);
		assert.equal(undoCall2, 1);
		assert.equal(redoCall2, 0);
		assert.equal(undoCall3, 1);
		assert.equal(redoCall3, 0);
		assert.equal(service.canUndo(resource), true);
		assert.equal(service.canRedo(resource), true);
		assert.equal(service.hasElements(resource), true);
		assert.ok(service.getLastElement(resource) === null);
	});

});
