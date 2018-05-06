/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { NextEditorPart } from 'vs/workbench/browser/parts/editor2/nextEditorPart';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { GroupDirection } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { Dimension } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INextEditorPartOptions } from 'vs/workbench/browser/parts/editor2/editor2';

suite('Next editor2 part tests', () => {

	function createPart(): NextEditorPart {
		const instantiationService = workbenchInstantiationService();

		const part = instantiationService.createInstance(NextEditorPart, 'id');
		part.create(document.createElement('div'));
		part.layout(new Dimension(400, 300));

		return part;
	}

	test('Editor groups basics', function () {
		const part = createPart();

		let activeGroupChangeCounter = 0;
		const activeGroupChangeListener = part.onDidActiveGroupChange(() => {
			activeGroupChangeCounter++;
		});

		let groupAddedCounter = 0;
		const groupAddedListener = part.onDidAddGroup(() => {
			groupAddedCounter++;
		});

		let groupRemovedCounter = 0;
		const groupRemovedListener = part.onDidRemoveGroup(() => {
			groupRemovedCounter++;
		});

		// always a root group
		const rootGroup = part.groups[0];
		assert.equal(part.groups.length, 1);
		assert.equal(part.count, 1);
		assert.equal(rootGroup, part.getGroup(rootGroup.id));
		assert.ok(part.activeGroup === rootGroup);

		let mru = part.getGroups(true);
		assert.equal(mru.length, 1);
		assert.equal(mru[0], rootGroup);

		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		assert.equal(rightGroup, part.getGroup(rightGroup.id));
		assert.equal(groupAddedCounter, 1);
		assert.equal(part.groups.length, 2);
		assert.equal(part.count, 2);
		assert.ok(part.activeGroup === rootGroup);

		mru = part.getGroups(true);
		assert.equal(mru.length, 2);
		assert.equal(mru[0], rootGroup);
		assert.equal(mru[1], rightGroup);

		assert.equal(activeGroupChangeCounter, 0);

		part.activateGroup(rightGroup);
		assert.ok(part.activeGroup === rightGroup);
		assert.equal(activeGroupChangeCounter, 1);

		mru = part.getGroups(true);
		assert.equal(mru.length, 2);
		assert.equal(mru[0], rightGroup);
		assert.equal(mru[1], rootGroup);

		const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
		let didDispose = false;
		downGroup.onWillDispose(() => {
			didDispose = true;
		});
		assert.equal(groupAddedCounter, 2);
		assert.equal(part.groups.length, 3);
		assert.ok(part.activeGroup === rightGroup);
		assert.ok(!downGroup.activeControl);

		mru = part.getGroups(true);
		assert.equal(mru.length, 3);
		assert.equal(mru[0], rightGroup);
		assert.equal(mru[1], rootGroup);
		assert.equal(mru[2], downGroup);

		part.removeGroup(downGroup);
		assert.ok(!part.getGroup(downGroup.id));
		assert.equal(didDispose, true);
		assert.equal(groupRemovedCounter, 1);
		assert.equal(part.groups.length, 2);
		assert.ok(part.activeGroup === rightGroup);

		mru = part.getGroups(true);
		assert.equal(mru.length, 2);
		assert.equal(mru[0], rightGroup);
		assert.equal(mru[1], rootGroup);

		let rightGroupInstantiator: IInstantiationService;
		part.activeGroup.invokeWithinContext(accessor => {
			rightGroupInstantiator = accessor.get(IInstantiationService);
		});

		let rootGroupInstantiator: IInstantiationService;
		rootGroup.invokeWithinContext(accessor => {
			rootGroupInstantiator = accessor.get(IInstantiationService);
		});

		assert.ok(rightGroupInstantiator);
		assert.ok(rootGroupInstantiator);
		assert.ok(rightGroupInstantiator !== rootGroupInstantiator);

		part.removeGroup(rightGroup);
		assert.equal(groupRemovedCounter, 2);
		assert.equal(part.groups.length, 1);
		assert.ok(part.activeGroup === rootGroup);

		mru = part.getGroups(true);
		assert.equal(mru.length, 1);
		assert.equal(mru[0], rootGroup);

		part.removeGroup(rootGroup); // cannot remove root group
		assert.equal(part.groups.length, 1);
		assert.equal(groupRemovedCounter, 2);
		assert.ok(part.activeGroup === rootGroup);

		activeGroupChangeListener.dispose();
		groupAddedListener.dispose();
		groupRemovedListener.dispose();

		part.dispose();
	});

	test('Editor part options', function () {
		const part = createPart();

		let oldOptions: INextEditorPartOptions;
		let newOptions: INextEditorPartOptions;
		part.onDidEditorPartOptionsChange(event => {
			oldOptions = event.oldPartOptions;
			newOptions = event.newPartOptions;
		});

		const currentOptions = part.partOptions;
		assert.ok(currentOptions);

		part.enforcePartOptions({ showTabs: false });
		assert.equal(part.partOptions.showTabs, false);
		assert.equal(newOptions.showTabs, false);
		assert.equal(oldOptions, currentOptions);

		part.dispose();
	});
});
