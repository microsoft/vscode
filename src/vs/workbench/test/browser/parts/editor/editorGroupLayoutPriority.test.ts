/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { GroupDirection, GroupLayoutPriority } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { createEditorPart, TestEditorPart, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('Editor Part Group Layout Priority', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	/** A part laid out at 1080x800 with three groups stacked at heights of 400, 200 and 200. */
	async function createStackedPart(): Promise<{ part: TestEditorPart; top: IEditorGroupView; middle: IEditorGroupView; bottom: IEditorGroupView }> {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const part = await createEditorPart(instantiationService, disposables);
		const top = part.activeGroup;
		const middle = part.addGroup(top, GroupDirection.DOWN);
		const bottom = part.addGroup(middle, GroupDirection.DOWN);
		part.setSize(top, { width: 1080, height: 400 });
		part.setSize(middle, { width: 1080, height: 200 });

		return { part, top, middle, bottom };
	}

	function heights(part: TestEditorPart, ...groups: IEditorGroupView[]): number[] {
		return groups.map(group => part.getSize(group).height);
	}

	test('resizing the part resizes the group with a high priority first', async () => {
		const { part, top, middle, bottom } = await createStackedPart();
		const before = heights(part, top, middle, bottom);
		const minimum = top.minimumHeight;

		part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
		const afterSet = heights(part, top, middle, bottom);
		part.layout(1080, 600, 0, 0);
		const shrunk = heights(part, top, middle, bottom);
		part.layout(1080, 400 + minimum - 50, 0, 0);
		const belowMinimum = heights(part, top, middle, bottom);
		part.layout(1080, 900, 0, 0);
		const grown = heights(part, top, middle, bottom);

		assert.deepStrictEqual({ before, afterSet, shrunk, belowMinimum, grown }, {
			before: [400, 200, 200],
			afterSet: [400, 200, 200],
			shrunk: [200, 200, 200],
			// The high priority group stops at its minimum, then the last group gives way
			belowMinimum: [minimum, 200, 150],
			// and the high priority group takes the space when the part grows
			grown: [550, 200, 150],
		});
	});

	test('a group added or removed beside the group with a high priority takes or gives its size', async () => {
		const { part, top, middle, bottom } = await createStackedPart();
		part.setGroupLayoutPriority(top, GroupLayoutPriority.High);

		const added = part.addGroup(bottom, GroupDirection.DOWN); // splits the bottom group in half
		const afterAdd = heights(part, top, middle, bottom, added);
		part.removeGroup(added);
		const afterRemove = heights(part, top, middle, bottom);

		assert.deepStrictEqual({ afterAdd, afterRemove }, {
			afterAdd: [300, 200, 200, 100],
			afterRemove: [400, 200, 200],
		});
	});

	test('without priorities, groups resize proportionally', async () => {
		const { part, top, middle, bottom } = await createStackedPart();
		part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
		part.setGroupLayoutPriority(top, undefined);
		part.layout(1080, 400, 0, 0);
		const cleared = heights(part, top, middle, bottom);

		part.layout(1080, 800, 0, 0);
		part.setGroupLayoutPriority(middle, GroupLayoutPriority.Normal);
		part.layout(1080, 400, 0, 0);

		assert.deepStrictEqual({ cleared, normal: heights(part, top, middle, bottom) }, {
			cleared: [200, 100, 100],
			normal: [200, 100, 100],
		});
	});

	test('the priority of a group is cleared when it is removed', async () => {
		const describe = async (setPriority: boolean) => {
			const { part, top, middle, bottom } = await createStackedPart();
			if (setPriority) {
				part.setGroupLayoutPriority(middle, GroupLayoutPriority.High);
			}

			part.removeGroup(middle);
			const afterRemove = heights(part, top, bottom);
			part.layout(1080, 400, 0, 0);

			return { afterRemove, afterResize: heights(part, top, bottom) };
		};

		// As if the removed group never had a priority: the others resize proportionally again
		assert.deepStrictEqual(await describe(true), await describe(false));
	});
});
