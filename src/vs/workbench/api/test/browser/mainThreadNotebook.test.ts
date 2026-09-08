/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotebookCellStatusBarItemProvider } from '../../../contrib/notebook/common/notebookCommon.js';
import { INotebookCellStatusBarService } from '../../../contrib/notebook/common/notebookCellStatusBarService.js';
import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadNotebooks } from '../../browser/mainThreadNotebook.js';
import { ExtHostNotebookShape } from '../../common/extHost.protocol.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadNotebooks', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes and clears cell status bar provider registrations', async () => {
		let registrationDisposals = 0;
		const cellStatusBarService = new class extends mock<INotebookCellStatusBarService>() {
			override registerCellStatusBarItemProvider(_provider: INotebookCellStatusBarItemProvider) {
				return { dispose: () => registrationDisposals++ };
			}
		};
		const service = store.add(new MainThreadNotebooks(
			AnyCallRPCProtocol<ExtHostNotebookShape>(),
			new class extends mock<INotebookService>() { },
			cellStatusBarService,
			new class extends mock<ILogService>() { },
		));

		await service.$registerNotebookCellStatusBarItemProvider(1, undefined, '*');
		service.dispose();
		await service.$unregisterNotebookCellStatusBarItemProvider(1, undefined);

		assert.strictEqual(registrationDisposals, 1);
	});
});
