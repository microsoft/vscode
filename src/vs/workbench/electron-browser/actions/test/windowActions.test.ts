/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { CloseAllOtherWindowsAction } from '../windowActions.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IOpenedMainWindow, IOpenedAuxiliaryWindow } from '../../../../platform/window/common/window.js';
import { URI } from '../../../../base/common/uri.js';
import * as dom from '../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('CloseAllOtherWindowsAction', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let nativeHostService: MockNativeHostService;
	let action: CloseAllOtherWindowsAction;
	let originalGetActiveWindow: any;

	class MockNativeHostService implements Partial<INativeHostService> {
		private windows: Array<IOpenedMainWindow | IOpenedAuxiliaryWindow> = [];
		private closedWindows: number[] = [];

		setWindows(windows: Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>) {
			this.windows = windows;
		}

		getClosedWindows(): number[] {
			return [...this.closedWindows];
		}

		async getWindows(): Promise<Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>> {
			return this.windows;
		}

		async closeWindow(options?: { targetWindowId?: number }): Promise<void> {
			if (options?.targetWindowId) {
				this.closedWindows.push(options.targetWindowId);
			}
		}
	}

	setup(() => {
		instantiationService = new TestInstantiationService();
		nativeHostService = new MockNativeHostService();
		instantiationService.set(INativeHostService, nativeHostService);
		action = new CloseAllOtherWindowsAction();
		
		// Store original function
		originalGetActiveWindow = dom.getActiveWindow;
	});

	teardown(() => {
		// Restore original function
		if (originalGetActiveWindow) {
			(dom as any).getActiveWindow = originalGetActiveWindow;
		}
	});

	test('should close all windows except current', async () => {
		// Mock the getActiveWindow function
		(dom as any).getActiveWindow = () => ({ vscodeWindowId: 1 });

		// Set up multiple windows
		const windows: IOpenedMainWindow[] = [
			{
				id: 1,
				workspace: { uri: URI.file('/workspace1'), folders: [] },
				title: 'Window 1',
				filename: '',
				dirty: false
			},
			{
				id: 2,
				workspace: { uri: URI.file('/workspace2'), folders: [] },
				title: 'Window 2',
				filename: '',
				dirty: false
			},
			{
				id: 3,
				workspace: { uri: URI.file('/workspace3'), folders: [] },
				title: 'Window 3',
				filename: '',
				dirty: false
			}
		];

		nativeHostService.setWindows(windows);

		// Run the action
		await action.run(instantiationService);

		// Verify that only windows 2 and 3 were closed (not window 1 which is current)
		const closedWindows = nativeHostService.getClosedWindows();
		assert.strictEqual(closedWindows.length, 2);
		assert.ok(closedWindows.includes(2));
		assert.ok(closedWindows.includes(3));
		assert.ok(!closedWindows.includes(1));
	});

	test('should handle no other windows to close', async () => {
		// Mock the getActiveWindow function
		(dom as any).getActiveWindow = () => ({ vscodeWindowId: 1 });

		// Set up only one window (current)
		const windows: IOpenedMainWindow[] = [
			{
				id: 1,
				workspace: { uri: URI.file('/workspace1'), folders: [] },
				title: 'Window 1',
				filename: '',
				dirty: false
			}
		];

		nativeHostService.setWindows(windows);

		// Run the action
		await action.run(instantiationService);

		// Verify no windows were closed
		const closedWindows = nativeHostService.getClosedWindows();
		assert.strictEqual(closedWindows.length, 0);
	});

	test('should handle auxiliary windows', async () => {
		// Mock the getActiveWindow function
		(dom as any).getActiveWindow = () => ({ vscodeWindowId: 1 });

		// Set up main and auxiliary windows
		const windows: Array<IOpenedMainWindow | IOpenedAuxiliaryWindow> = [
			{
				id: 1,
				workspace: { uri: URI.file('/workspace1'), folders: [] },
				title: 'Main Window',
				filename: '',
				dirty: false
			},
			{
				id: 2,
				parentId: 1,
				title: 'Auxiliary Window',
				filename: ''
			}
		];

		nativeHostService.setWindows(windows);

		// Run the action
		await action.run(instantiationService);

		// Verify that auxiliary window was closed
		const closedWindows = nativeHostService.getClosedWindows();
		assert.strictEqual(closedWindows.length, 1);
		assert.ok(closedWindows.includes(2));
		assert.ok(!closedWindows.includes(1));
	});
});