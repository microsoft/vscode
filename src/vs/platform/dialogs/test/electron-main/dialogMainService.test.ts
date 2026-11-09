/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { BrowserWindow, MessageBoxReturnValue, OpenDialogReturnValue, SaveDialogReturnValue } from 'electron';
import { Queue } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { DialogMainService } from '../../electron-main/dialogMainService.js';

type DialogResult = MessageBoxReturnValue | SaveDialogReturnValue | OpenDialogReturnValue;

interface TestDialogMainService {
	getWindowDialogQueue<T extends DialogResult>(window?: BrowserWindow): Queue<T>;
	windowDialogQueues: Map<number, Queue<DialogResult>>;
}

suite('DialogMainService', () => {

	const productService: IProductService = {
		_serviceBrand: undefined,
		...product,
		nameLong: 'Test'
	};

	test('discards a per-window dialog queue after it drains', async () => {
		const service = new DialogMainService(new NullLogService(), productService) as unknown as TestDialogMainService;
		const window = { id: 1 } as BrowserWindow;
		const queue = service.getWindowDialogQueue<MessageBoxReturnValue>(window);

		assert.strictEqual(service.windowDialogQueues.size, 1);
		await queue.queue(async () => ({ response: 0, checkboxChecked: false }));
		await queue.whenIdle();
		assert.strictEqual(service.windowDialogQueues.size, 0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
