/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {EditorStacksModel, IEditorStacksModel, IEditorGroup} from 'vs/workbench/common/editor/editorStacksModel';

function create(): IEditorStacksModel {
	return new EditorStacksModel();
}

interface GroupEvents {
	opened: IEditorGroup[];
	activated: IEditorGroup[];
	closed: IEditorGroup[];
}

function groupListener(model: IEditorStacksModel): GroupEvents {
	const groupEvents = {
		opened: [],
		activated: [],
		closed: []
	};

	model.onGroupOpened(g => groupEvents.opened.push(g));
	model.onGroupActivated(g => groupEvents.activated.push(g));
	model.onGroupClosed(g => groupEvents.closed.push(g));

	return groupEvents;
}

suite('Editor Stacks Model', () => {

	test('Groups', function () {
		const model = create();
		const events = groupListener(model);

		assert.equal(model.groups.length, 0);
		assert.ok(!model.activeGroup);

		const first = model.openGroup('first');
		assert.equal(events.opened[0], first);
		assert.equal(events.activated[0], first);
		assert.equal(model.activeGroup, first);
		assert.equal(model.groups.length, 1);

		const second = model.openGroup('second');
		assert.equal(events.opened[1], second);
		assert.equal(events.activated[1], second);
		assert.equal(model.activeGroup, second);
		assert.equal(model.groups.length, 2);

		const third = model.openGroup('third');
		assert.equal(events.opened[2], third);
		assert.equal(events.activated[2], third);
		assert.equal(model.activeGroup, third);
		assert.equal(model.groups.length, 3);

		model.closeGroup(first);
		assert.equal(events.closed[0], first);
		assert.equal(model.groups.length, 2);
		assert.equal(model.activeGroup, third);

		model.closeGroup(third);
		assert.equal(events.closed[1], third);
		assert.equal(events.activated[3], second);
		assert.equal(model.activeGroup, second);
		assert.equal(model.groups.length, 1);

		const fourth = model.openGroup('fourth');
		assert.equal(fourth, model.activeGroup);
		model.closeGroup(fourth);
		assert.equal(second, model.activeGroup);
	});
});