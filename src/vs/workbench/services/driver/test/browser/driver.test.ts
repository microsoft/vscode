/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { BrowserWindowDriver } from '../../browser/driver.js';
import { IHostService } from '../../../host/browser/host.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';

suite('BrowserWindowDriver native focus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('focuses the registered native window and rejects unknown IDs', async () => {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const target = frame.contentWindow!;
		ensureCodeWindow(target, 12346);
		store.add(registerWindow(target));
		const focused: Window[] = [];
		const driver = new BrowserWindowDriver(
			new class extends mock<IFileService>() { }(),
			new class extends mock<IEnvironmentService>() { }(),
			new class extends mock<ILifecycleService>() { }(),
			store.add(new NullLogService()),
			new class extends mock<IHostService>() {
				override async focus(window: Window): Promise<void> { focused.push(window); }
			}(),
		);
		await driver.focusWindow(12346);
		await assert.rejects(driver.focusWindow(-1), /unknown window/);
		assert.deepStrictEqual(focused, [target]);
	});
});
