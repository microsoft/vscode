/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import '../../../browser/actions/layoutActions.js';
import { IViewSize } from '../../../../base/browser/ui/grid/grid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { TestLayoutService } from '../workbenchTestServices.js';

suite('Layout Actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestSideBarLayoutService extends TestLayoutService {
		sideBarVisible = true;
		sideBarSize: IViewSize = { width: 300, height: 900 };
		override isVisible(part: Parts): boolean { return part === Parts.SIDEBAR_PART ? this.sideBarVisible : super.isVisible(part); }
		override getSize(part: Parts): IViewSize { return this.sideBarSize; }
		override setSize(part: Parts, size: IViewSize): void {
			if (part === Parts.SIDEBAR_PART) {
				this.sideBarSize = size;
			}
		}
	}

	function executeCommand(layoutService: IWorkbenchLayoutService, id: string, ...args: unknown[]): unknown {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, layoutService);

		return instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args));
	}

	test('getSideBarWidth returns the width of the visible side bar', () => {
		const layoutService = new TestSideBarLayoutService();

		assert.strictEqual(executeCommand(layoutService, 'workbench.action.getSideBarWidth'), 300);
	});

	test('getSideBarWidth returns undefined when the side bar is hidden', () => {
		const layoutService = new TestSideBarLayoutService();
		layoutService.sideBarVisible = false;

		assert.strictEqual(executeCommand(layoutService, 'workbench.action.getSideBarWidth'), undefined);
	});

	test('setSideBarWidth sets the width and preserves the height', () => {
		const layoutService = new TestSideBarLayoutService();

		executeCommand(layoutService, 'workbench.action.setSideBarWidth', 450);

		assert.deepStrictEqual(layoutService.sideBarSize, { width: 450, height: 900 });
	});

	test('setSideBarWidth fails when the side bar is hidden', () => {
		const layoutService = new TestSideBarLayoutService();
		layoutService.sideBarVisible = false;

		assert.throws(() => executeCommand(layoutService, 'workbench.action.setSideBarWidth', 450));
		assert.deepStrictEqual(layoutService.sideBarSize, { width: 300, height: 900 });
	});

	test('setSideBarWidth fails for invalid width values', () => {
		const layoutService = new TestSideBarLayoutService();

		for (const width of [undefined, null, -1, 0, NaN, Infinity, '450', { width: 450 }]) {
			assert.throws(() => executeCommand(layoutService, 'workbench.action.setSideBarWidth', width), `expected to throw for width: ${width}`);
		}

		assert.deepStrictEqual(layoutService.sideBarSize, { width: 300, height: 900 });
	});
});
