/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICellOutputViewModel, ICellViewModel } from '../../../browser/notebookBrowser.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { IOutputItemDto } from '../../../common/notebookCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { copyCellOutput } from '../../../browser/viewModel/cellOutputTextHelper.js';

suite('Cell Output Clipboard Tests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class ClipboardService {
		private _clipboardContent = '';
		private _clipboardFormats = new Map<string, Uint8Array | string>();
		
		public get clipboardContent() {
			return this._clipboardContent;
		}
		
		public get clipboardFormats() {
			return this._clipboardFormats;
		}
		
		public async writeText(value: string) {
			this._clipboardContent = value;
			this._clipboardFormats.clear();
			this._clipboardFormats.set('text/plain', value);
		}
		
		public async writeMultipleFormats(formats: Map<string, Uint8Array | string>) {
			this._clipboardFormats = new Map(formats);
			// Set the main clipboard content to the first text format found
			for (const [mime, data] of formats) {
				if (typeof data === 'string' && (mime === 'text/plain' || mime.startsWith('text/'))) {
					this._clipboardContent = data;
					break;
				}
			}
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

	test('error output uses the value in the stack', async () => {
		const clipboard = new ClipboardService();

		const data = VSBuffer.fromString(`{"name":"Error Name","message":"error message","stack":"error stack"}`);
		const output = createOutputViewModel([{ data, mime: 'application/vnd.code.notebook.error' }]);

		await copyCellOutput('application/vnd.code.notebook.error', output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'error stack');
	});

	test('error without stack uses the name and message', async () => {
		const clipboard = new ClipboardService();

		const data = VSBuffer.fromString(`{"name":"Error Name","message":"error message"}`);
		const output = createOutputViewModel([{ data, mime: 'application/vnd.code.notebook.error' }]);

		await copyCellOutput('application/vnd.code.notebook.error', output, clipboard as unknown as IClipboardService, logService);

		assert.strictEqual(clipboard.clipboardContent, 'Error Name: error message');
	});

	test('Multiple mime types should be copied when no specific type requested', async () => {
		const clipboard = new ClipboardService();

		const outputDtos = [
			{ data: VSBuffer.fromString('plain text content'), mime: 'text/plain' },
			{ data: VSBuffer.fromString('<h1>HTML content</h1>'), mime: 'text/html' },
			{ data: VSBuffer.fromString('PNG_DATA'), mime: 'image/png' }
		];
		const output = createOutputViewModel(outputDtos);

		// When no specific mime type is specified, should copy all relevant types
		await copyCellOutput(undefined, output, clipboard as unknown as IClipboardService, logService);

		// Should have multiple formats in the clipboard
		assert.strictEqual(clipboard.clipboardFormats.size, 3);
		assert.strictEqual(clipboard.clipboardFormats.get('text/plain'), 'plain text content');
		assert.strictEqual(clipboard.clipboardFormats.get('text/html'), '<h1>HTML content</h1>');
		assert.ok(clipboard.clipboardFormats.has('image/png'));
		
		// The main clipboard content should be the text/plain version
		assert.strictEqual(clipboard.clipboardContent, 'plain text content');
	});

	test('Only text formats copied when multiple text formats available', async () => {
		const clipboard = new ClipboardService();

		const outputDtos = [
			{ data: VSBuffer.fromString('plain text content'), mime: 'text/plain' },
			{ data: VSBuffer.fromString('<h1>HTML content</h1>'), mime: 'text/html' },
			{ data: VSBuffer.fromString('{"key": "value"}'), mime: 'application/json' }
		];
		const output = createOutputViewModel(outputDtos);

		await copyCellOutput(undefined, output, clipboard as unknown as IClipboardService, logService);

		// Should have all text formats
		assert.strictEqual(clipboard.clipboardFormats.size, 3);
		assert.strictEqual(clipboard.clipboardFormats.get('text/plain'), 'plain text content');
		assert.strictEqual(clipboard.clipboardFormats.get('text/html'), '<h1>HTML content</h1>');
		assert.strictEqual(clipboard.clipboardFormats.get('application/json'), '{"key": "value"}');
	});
});
