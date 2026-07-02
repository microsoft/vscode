/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITerminalGroup } from '../../browser/terminal.js';
import { TerminalGroupService } from '../../browser/terminalGroupService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestViewsService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

function makeGroup(id: number): ITerminalGroup {
	return { terminalInstances: [], id, setVisible: () => { } } as unknown as ITerminalGroup;
}

suite('Workbench - TerminalGroupService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: TerminalGroupService;

	setup(() => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IViewsService, new TestViewsService());
		service = store.add(instantiationService.createInstance(TerminalGroupService));
	});

	suite('moveGroupUp', () => {
		test('moving the first group is a no-op', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.moveGroupUp(a);
			deepStrictEqual(service.groups, [a, b, c]);
		});

		test('moving an unknown group is a no-op', () => {
			const [a, b] = [makeGroup(1), makeGroup(2)];
			service.groups.push(a, b);
			service.moveGroupUp(makeGroup(99));
			deepStrictEqual(service.groups, [a, b]);
		});

		test('moving a middle group swaps positions correctly', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.moveGroupUp(b);
			deepStrictEqual(service.groups, [b, a, c]);
		});

		test('moving the last group up swaps with previous', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.moveGroupUp(c);
			deepStrictEqual(service.groups, [a, c, b]);
		});

		test('activeGroupIndex follows the moved group', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.activeGroupIndex = 1; // b is active
			service.moveGroupUp(b);
			strictEqual(service.activeGroupIndex, 0);
		});

		test('activeGroupIndex updates when active group is displaced', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.activeGroupIndex = 0; // a is active, b moves up over it
			service.moveGroupUp(b);
			strictEqual(service.activeGroupIndex, 1);
		});
	});

	suite('moveGroupDown', () => {
		test('moving the last group is a no-op', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.moveGroupDown(c);
			deepStrictEqual(service.groups, [a, b, c]);
		});

		test('moving an unknown group is a no-op', () => {
			const [a, b] = [makeGroup(1), makeGroup(2)];
			service.groups.push(a, b);
			service.moveGroupDown(makeGroup(99));
			deepStrictEqual(service.groups, [a, b]);
		});

		test('moving a middle group swaps positions correctly', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.moveGroupDown(b);
			deepStrictEqual(service.groups, [a, c, b]);
		});

		test('moving the first group down swaps with next', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.moveGroupDown(a);
			deepStrictEqual(service.groups, [b, a, c]);
		});

		test('activeGroupIndex follows the moved group', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.activeGroupIndex = 1; // b is active
			service.moveGroupDown(b);
			strictEqual(service.activeGroupIndex, 2);
		});

		test('activeGroupIndex updates when active group is displaced', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			service.activeGroupIndex = 2; // c is active, b moves down over it
			service.moveGroupDown(b);
			strictEqual(service.activeGroupIndex, 1);
		});
	});

	suite('getGroupsBelow', () => {
		test('returns empty array for unknown group', () => {
			const [a, b] = [makeGroup(1), makeGroup(2)];
			service.groups.push(a, b);
			deepStrictEqual(service.getGroupsBelow(makeGroup(99)), []);
		});

		test('returns empty array for the last group', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			deepStrictEqual(service.getGroupsBelow(c), []);
		});

		test('returns all groups below a middle group', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			deepStrictEqual(service.getGroupsBelow(b), [c]);
		});

		test('returns all groups below the first group', () => {
			const [a, b, c] = [makeGroup(1), makeGroup(2), makeGroup(3)];
			service.groups.push(a, b, c);
			deepStrictEqual(service.getGroupsBelow(a), [b, c]);
		});
	});
});
