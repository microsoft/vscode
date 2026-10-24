/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { GroupDirection, GroupLayoutPriority, GroupsOrder } from '../../../../services/editor/common/editorGroupsService.js';
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
	test('maximizing and restoring a group keeps the priorities, also when set or cleared while maximized', async () => {
		const describe = async (when: 'before' | 'whileMaximized' | 'clearedWhileMaximized') => {
			const { part, top, middle, bottom } = await createStackedPart();
			if (when !== 'whileMaximized') {
				part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
			}

			part.toggleMaximizeGroup(middle);
			if (when === 'whileMaximized') {
				part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
			} else if (when === 'clearedWhileMaximized') {
				part.setGroupLayoutPriority(top, undefined);
			}
			const maximized = part.hasMaximizedGroup();
			part.toggleMaximizeGroup(middle);
			const restored = heights(part, top, middle, bottom);
			part.layout(1080, 600, 0, 0);

			return { maximized, restored, shrunk: heights(part, top, middle, bottom) };
		};

		assert.deepStrictEqual({ before: await describe('before'), whileMaximized: await describe('whileMaximized'), clearedWhileMaximized: await describe('clearedWhileMaximized') }, {
			before: { maximized: true, restored: [400, 200, 200], shrunk: [200, 200, 200] },
			whileMaximized: { maximized: true, restored: [400, 200, 200], shrunk: [200, 200, 200] },
			// Proportional again
			clearedWhileMaximized: { maximized: true, restored: [400, 200, 200], shrunk: [300, 150, 150] },
		});
	});

	test('restoring the state of the part restores the sizes, and the restored groups have no priority', async () => {
		const { part, top } = await createStackedPart();
		part.setGroupLayoutPriority(top, GroupLayoutPriority.High);

		await part.applyState(part.createState());
		const [newTop, newMiddle, newBottom] = part.getGroups(GroupsOrder.GRID_APPEARANCE);
		const restored = heights(part, newTop, newMiddle, newBottom);
		part.layout(1080, 400, 0, 0);
		const proportional = heights(part, newTop, newMiddle, newBottom);
		part.layout(1080, 800, 0, 0);
		part.setGroupLayoutPriority(newTop, GroupLayoutPriority.High);
		part.layout(1080, 600, 0, 0);

		assert.deepStrictEqual({ replaced: newTop !== top, restored, proportional, prioritized: heights(part, newTop, newMiddle, newBottom) }, {
			replaced: true,
			restored: [400, 200, 200],
			proportional: [200, 100, 100],
			prioritized: [200, 200, 200],
		});
	});

	test('a group moved beside the group with a high priority takes its size from it, and gives it back when moved away', async () => {
		const { part, top, middle, bottom } = await createStackedPart();
		const right = part.addGroup(bottom, GroupDirection.RIGHT); // a row of two groups at the bottom
		part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
		const before = heights(part, top, middle, bottom, right);

		part.moveGroup(right, middle, GroupDirection.DOWN); // into the column of the high priority group
		const movedIn = { order: part.getGroups(GroupsOrder.GRID_APPEARANCE).map(group => [top, middle, right, bottom].indexOf(group)), heights: heights(part, top, middle, right, bottom) };
		part.moveGroup(right, bottom, GroupDirection.RIGHT); // back into the row at the bottom
		const movedOut = heights(part, top, middle, bottom, right);

		assert.deepStrictEqual({ before, movedIn, movedOut }, {
			before: [400, 200, 200, 200],
			// Split from the middle group, which gets its size back from the high priority group
			movedIn: { order: [0, 1, 2, 3], heights: [300, 200, 100, 200] },
			movedOut: [400, 200, 200, 200],
		});
	});
	test('a group with a high priority at its minimum size gives no space, and the others are sized as without priorities', async () => {
		const { part, top, middle, bottom } = await createStackedPart();
		const minimum = top.minimumHeight;
		part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
		part.layout(1080, 400 + minimum, 0, 0);
		const before = heights(part, top, middle, bottom);

		const added = part.addGroup(bottom, GroupDirection.DOWN);
		const afterAdd = heights(part, top, middle, bottom, added);
		part.removeGroup(added);
		const afterRemove = heights(part, top, middle, bottom);

		assert.deepStrictEqual({ before, afterAdd, afterRemove }, {
			before: [minimum, 200, 200],
			// The middle group keeps its size, and the added group splits the bottom one as usual
			afterAdd: [minimum, 200, 100, 100],
			// The space of the removed group goes to the group with the high priority
			afterRemove: [minimum + 100, 200, 100],
		});
	});
	test('groups that get their sizes back share what the group with a high priority can give, in order', async () => {
		const describe = async (topSlack: number, middleHeight: number) => {
			const { part, top, middle, bottom } = await createStackedPart();
			disposables.add(part.enforcePartOptions({ splitSizing: 'distribute' })); // adding a group shrinks all others
			const minimum = top.minimumHeight;
			part.setSize(top, { width: 1080, height: minimum + topSlack });
			part.setSize(middle, { width: 1080, height: middleHeight });
			part.setGroupLayoutPriority(top, GroupLayoutPriority.High);
			const before = heights(part, top, middle, bottom);

			const added = part.addGroup(bottom, GroupDirection.DOWN);
			return { minimum, before, after: heights(part, top, middle, bottom, added) };
		};

		const minimum = (await createStackedPart()).top.minimumHeight;
		assert.deepStrictEqual({ lessThanBoth: await describe(30, 250), lessThanTheFirst: await describe(30, 400) }, {
			// Distributing gives each group 200, so the group with the high priority can give 200 - minimum.
			// The middle group gets the 50 it needs back, and the bottom group what remains of the 250 it needs
			lessThanBoth: { minimum, before: [minimum + 30, 250, 450], after: [minimum, 250, 200 + (200 - minimum - 50), 200] },
			// The middle group needs 200 and takes all there is, so the bottom group keeps what distributing gave it
			lessThanTheFirst: { minimum, before: [minimum + 30, 400, 300], after: [minimum, 200 + (200 - minimum), 200, 200] },
		});
	});
});
