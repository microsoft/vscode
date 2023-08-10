/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyCellOutput } from '../../../browser/contrib/clipboard/cellOutputClipboard';
import { ICellOutputViewModel, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { mock } from 'vs/base/test/common/mock';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ILogService } from 'vs/platform/log/common/log';
import assert = require('assert');
import { VSBuffer } from 'vs/base/common/buffer';
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';

suite('Cell Output Clipboard Tests', () => {

	class ClipboardService {
		private _clipboardContent = '';
		public get clipboardContent() {
			return this._clipboardContent;
		}
		public async writeText(value: string) {
			this._clipboardContent = value;
		}
	}

	const logService = new class extends mock<ILogService>() { };

	function createOutputViewModel(outputs: IOutputItemDto[], cellViewModel?: ICellViewModel) {
		const outputViewModel = { model: { outputs: outputs } } as ICellOutputViewModel;

		if (cellViewModel) {
			cellViewModel.outputsViewModels.push(outputViewModel);
		} else {
			cellViewModel = { outputsViewModels: [outputViewModel] } as ICellViewModel;
		}

		outputViewModel.cellViewModel = cellViewModel;

		return outputViewModel;
	}

	test('Copy text/plain output', async () => {
		const mimeType = 'text/plain';
		const clipboard = new ClipboardService();

		const outputDto = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
		const output = createOutputViewModel([outputDto]);

		await copyCellOutput(mimeType, output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'output content');
	});


});
