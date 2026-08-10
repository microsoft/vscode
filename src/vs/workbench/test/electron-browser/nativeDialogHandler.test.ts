/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { MessageBoxReturnValue } from '../../../base/parts/sandbox/common/electronTypes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestClipboardService } from '../../../platform/clipboard/test/common/testClipboardService.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { NativeDialogHandler, UnexpectedNativeDialogResponseError } from '../../electron-browser/parts/dialogs/dialogHandler.js';
import { TestNativeHostService } from './workbenchTestServices.js';

class UnexpectedResponseNativeHostService extends TestNativeHostService {

	override async showMessageBox(): Promise<MessageBoxReturnValue> {
		return { response: 1, unexpectedResponse: 420, checkboxChecked: false };
	}
}

suite('NativeDialogHandler', () => {

	test('throws on unexpected native responses', async () => {
		const handler = new NativeDialogHandler(new NullLogService(), new UnexpectedResponseNativeHostService(), new TestClipboardService());
		const results = await Promise.allSettled([
			handler.confirm({ message: 'Confirm' }),
			handler.prompt({ message: 'Prompt' }),
			handler.about('About', 'Details', 'Details to copy')
		]);

		deepStrictEqual(results.map(result => result.status === 'rejected' ? result.reason.constructor : undefined), [
			UnexpectedNativeDialogResponseError,
			UnexpectedNativeDialogResponseError,
			UnexpectedNativeDialogResponseError
		]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});