/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { GroupDirection } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { createEditorPart, TestEditorPart, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('Editor Part Group Gap', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createPart(): Promise<TestEditorPart> {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		return createEditorPart(instantiationService, disposables); // laid out at 1080x800
	}

	/**
	 * The margins of the group (top right bottom left) and the size its editor is laid out at; titles are hidden so
	 * that the editor takes the whole height of the group.
	 */
	function describe(part: TestEditorPart, group: IEditorGroupView) {
		disposables.add(part.hideGroupTitle(group));
		const editorContainer = group.element.querySelector<HTMLElement>('.editor-container')!;
		return {
			margin: [group.element.style.marginTop, group.element.style.marginRight, group.element.style.marginBottom, group.element.style.marginLeft].map(margin => parseInt(margin) || 0).join(' '),
			width: parseInt(editorContainer.style.width),
			height: parseInt(editorContainer.style.height),
		};
	}

	test('a gap of 0 lays out groups as without a gap', async () => {
		const part = await createPart();
		const group1 = part.activeGroup;
		const group2 = part.addGroup(group1, GroupDirection.RIGHT);
		const before = [describe(part, group1), describe(part, group2)];

		part.setGroupGap(0);
		const zero = [describe(part, group1), describe(part, group2)];
		part.setGroupGap(8);
		part.setGroupGap(0);

		const reset = [describe(part, group1), describe(part, group2)];
		const styles = [group1, group2].map(group => ({ margin: group.element.style.margin, height: group.element.style.height }));

		assert.deepStrictEqual({ before, zero, reset, styles }, {
			before: [{ margin: '0 0 0 0', width: 540, height: 800 }, { margin: '0 0 0 0', width: 540, height: 800 }],
			zero: [{ margin: '0 0 0 0', width: 540, height: 800 }, { margin: '0 0 0 0', width: 540, height: 800 }],
			reset: [{ margin: '0 0 0 0', width: 540, height: 800 }, { margin: '0 0 0 0', width: 540, height: 800 }],
			// Setting the gap back to 0 leaves no styles behind
			styles: [{ margin: '', height: '' }, { margin: '', height: '' }],
		});
	});

	test('groups are inset by the gap on the sides that face another group only', async () => {
		const part = await createPart();
		const left = part.activeGroup;
		const right = part.addGroup(left, GroupDirection.RIGHT);
		part.setGroupGap(9);
		const columns = { left: describe(part, left), right: describe(part, right) };

		const bottomLeft = part.addGroup(left, GroupDirection.DOWN);
		const columnsAndRows = { topLeft: describe(part, left), bottomLeft: describe(part, bottomLeft), right: describe(part, right) };

		part.removeGroup(right);
		const rows = { top: describe(part, left), bottom: describe(part, bottomLeft) };

		assert.deepStrictEqual({ columns, columnsAndRows, rows }, {
			// 540 + 540 wide: the left half of the gap is rounded down, the right one up
			columns: {
				left: { margin: '0 5 0 0', width: 535, height: 800 },
				right: { margin: '0 0 0 4', width: 536, height: 800 },
			},
			// 400 + 400 high on the left
			columnsAndRows: {
				topLeft: { margin: '0 5 5 0', width: 535, height: 395 },
				bottomLeft: { margin: '4 5 0 0', width: 535, height: 396 },
				right: { margin: '0 0 0 4', width: 536, height: 800 },
			},
			rows: {
				top: { margin: '0 0 5 0', width: 1080, height: 395 },
				bottom: { margin: '4 0 0 0', width: 1080, height: 396 },
			},
		});
	});

	test('a maximized group is not inset', async () => {
		const part = await createPart();
		const left = part.activeGroup;
		const right = part.addGroup(left, GroupDirection.RIGHT);
		part.setGroupGap(8);

		part.toggleMaximizeGroup(left);
		const maximized = describe(part, left);
		part.toggleMaximizeGroup(left);

		assert.deepStrictEqual({ maximized, restored: [describe(part, left), describe(part, right)] }, {
			maximized: { margin: '0 0 0 0', width: 1080, height: 800 },
			restored: [{ margin: '0 4 0 0', width: 536, height: 800 }, { margin: '0 0 0 4', width: 536, height: 800 }],
		});
	});

	test('the gap combines with the content right inset', async () => {
		const part = await createPart();
		const left = part.activeGroup;
		const right = part.addGroup(left, GroupDirection.RIGHT);
		part.setGroupGap(8);
		part.setContentRightInset(100);

		assert.deepStrictEqual([describe(part, left), describe(part, right)], [
			{ margin: '0 4 0 0', width: 536, height: 800 },
			// Inset by half of the gap on the left, and its editor by the content inset on the right
			{ margin: '0 0 0 4', width: 436, height: 800 },
		]);
	});
});
