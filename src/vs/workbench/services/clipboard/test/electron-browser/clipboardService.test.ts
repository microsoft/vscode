/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { NativeClipboardService } from '../../electron-browser/clipboardService.js';

suite('NativeClipboardService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(clipboard: Record<string, string>): NativeClipboardService {
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async readClipboardBuffer(format: string): Promise<VSBuffer> {
				return VSBuffer.fromString(clipboard[format] ?? '');
			}
		};
		return new NativeClipboardService(nativeHostService, new NullLogService());
	}

	test('readResources prefers resources copied inside VS Code', async () => {
		const service = createService({
			'code/file-list': [URI.file('/workspace/a.txt'), URI.file('/workspace/b.txt')].join('\n'),
			'text/uri-list': 'file:///home/user/other.txt',
		});

		assert.deepStrictEqual((await service.readResources()).map(r => r.toString()), [
			URI.file('/workspace/a.txt').toString(),
			URI.file('/workspace/b.txt').toString(),
		]);
	});

	(isLinux ? test : test.skip)('readResources falls back to file URIs from text/uri-list on Linux', async () => {
		const service = createService({
			'code/file-list': '',
			'text/uri-list': [
				'# comment',
				'file:///home/user/my%20file%20%231.txt',
				'https://example.com/not-a-file',
				'file:///home/user/%C3%BCber.txt',
			].join('\r\n') + '\nfile:///home/user/lf-separated.txt\n',
		});

		assert.deepStrictEqual((await service.readResources()).map(r => r.fsPath), [
			'/home/user/my file #1.txt',
			'/home/user/über.txt',
			'/home/user/lf-separated.txt',
		]);
	});
});
