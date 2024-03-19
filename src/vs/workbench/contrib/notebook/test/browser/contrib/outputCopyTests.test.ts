/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICellOutputViewModel, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { mock } from 'vs/base/test/common/mock';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ILogService } from 'vs/platform/log/common/log';
import assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { copyCellOutput } from 'vs/workbench/contrib/notebook/browser/contrib/clipboard/cellOutputClipboard';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Cell Output Clipboard Tests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
			cellViewModel.model.outputs.push(outputViewModel.model);
		} else {
			cellViewModel = {
				outputsViewModels: [outputViewModel],
				model: { outputs: [outputViewModel.model] }
			} as ICellViewModel;
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

	test('Nothing copied for invalid mimetype', async () => {
		const clipboard = new ClipboardService();

		const outputDtos = [
			{ data: VSBuffer.fromString('output content'), mime: 'bad' },
			{ data: VSBuffer.fromString('output 2'), mime: 'unknown' }];
		const output = createOutputViewModel(outputDtos);

		await copyCellOutput('bad', output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, '');
	});

	test('Text copied if available instead of invalid mime type', async () => {
		const clipboard = new ClipboardService();

		const outputDtos = [
			{ data: VSBuffer.fromString('output content'), mime: 'bad' },
			{ data: VSBuffer.fromString('text content'), mime: 'text/plain' }];
		const output = createOutputViewModel(outputDtos);

		await copyCellOutput('bad', output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'text content');
	});

	test('Selected mimetype is preferred', async () => {
		const clipboard = new ClipboardService();

		const outputDtos = [
			{ data: VSBuffer.fromString('plain text'), mime: 'text/plain' },
			{ data: VSBuffer.fromString('html content'), mime: 'text/html' }];
		const output = createOutputViewModel(outputDtos);

		await copyCellOutput('text/html', output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'html content');
	});

	test('copy subsequent output', async () => {
		const clipboard = new ClipboardService();

		const output = createOutputViewModel([{ data: VSBuffer.fromString('first'), mime: 'text/plain' }]);
		const output2 = createOutputViewModel([{ data: VSBuffer.fromString('second'), mime: 'text/plain' }], output.cellViewModel as ICellViewModel);
		const output3 = createOutputViewModel([{ data: VSBuffer.fromString('third'), mime: 'text/plain' }], output.cellViewModel as ICellViewModel);

		await copyCellOutput('text/plain', output2, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'second');

		await copyCellOutput('text/plain', output3, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'third');
	});

	test('adjacent stream outputs are concanented', async () => {
		const clipboard = new ClipboardService();

		const output = createOutputViewModel([{ data: VSBuffer.fromString('stdout'), mime: 'application/vnd.code.notebook.stdout' }]);
		createOutputViewModel([{ data: VSBuffer.fromString('stderr'), mime: 'application/vnd.code.notebook.stderr' }], output.cellViewModel as ICellViewModel);
		createOutputViewModel([{ data: VSBuffer.fromString('text content'), mime: 'text/plain' }], output.cellViewModel as ICellViewModel);
		createOutputViewModel([{ data: VSBuffer.fromString('non-adjacent'), mime: 'application/vnd.code.notebook.stdout' }], output.cellViewModel as ICellViewModel);

		await copyCellOutput('application/vnd.code.notebook.stdout', output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'stdoutstderr');
	});

});
