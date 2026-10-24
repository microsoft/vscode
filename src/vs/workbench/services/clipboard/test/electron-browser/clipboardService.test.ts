/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { NativeClipboardService } from '../../electron-browser/clipboardService.js';

suite('Native clipboard service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('defers native file clipboard formats to paste events', async () => {
		const formats = isMacintosh ? ['public.file-url', 'NSFilenamesPboardType'] : isWindows ? ['FileNameW', 'CF_HDROP'] : ['text/uri-list', 'x-special/gnome-copied-files'];
		const results = [];
		for (const fileFormat of formats) {
			const nativeHostService = new class extends mock<INativeHostService>() {
				override async hasClipboard(format: string): Promise<boolean> {
					return format === fileFormat;
				}
			};
			const clipboard = new NativeClipboardService(nativeHostService, store.add(new NullLogService()));
			results.push(await clipboard.readData());
		}
		assert.deepStrictEqual(results, formats.map(() => undefined));
	});
});
