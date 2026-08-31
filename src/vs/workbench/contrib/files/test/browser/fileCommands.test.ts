/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resourcesToClipboard } from '../../browser/fileCommands.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

suite('Files - Copy Path Quoting', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface MockClipboardService extends IClipboardService {
		lastWritten: string | undefined;
	}

	function createMockClipboardService(): MockClipboardService {
		const mock = {
			_serviceBrand: undefined,
			lastWritten: undefined as string | undefined,
			async writeText(text: string) { mock.lastWritten = text; },
			async readText() { return ''; },
			async readFindText() { return ''; },
			async writeFindText(_text: string) { },
			async writeResources(_resources: URI[]) { },
			async readResources() { return []; },
			async hasResources() { return false; },
			async triggerPaste() { },
			async readImage() { return Uint8Array.from([]); },
		};
		return mock as MockClipboardService;
	}

	function createMockLabelService(): ILabelService {
		return {
			getUriLabel(resource: URI, options?: { relative?: boolean; noPrefix?: boolean; separator?: '/' | '\\' }) {
				if (options?.relative) {
					return 'relative/path/file.ts';
				}
				return resource.fsPath;
			},
		} as ILabelService;
	}

	function createMockConfigurationService(config: Record<string, string>): IConfigurationService {
		return {
			getValue(key: string) {
				return config[key];
			},
		} as IConfigurationService;
	}

	test('Copy path with no quoting (default)', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyPathSeparator': 'auto',
			'explorer.copyPathQuoting': 'none',
		});

		const resource = URI.file('/test/path/file.ts');
		await resourcesToClipboard([resource], false, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		assert.ok(!clipboard.lastWritten.startsWith('\''));
		assert.ok(!clipboard.lastWritten.startsWith('"'));
	});

	test('Copy path with single quoting', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyPathSeparator': 'auto',
			'explorer.copyPathQuoting': 'single',
		});

		const resource = URI.file('/test/path/file.ts');
		await resourcesToClipboard([resource], false, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		assert.ok(clipboard.lastWritten.startsWith('\''), `Expected single quote at start, got: ${clipboard.lastWritten}`);
		assert.ok(clipboard.lastWritten.endsWith('\''), `Expected single quote at end, got: ${clipboard.lastWritten}`);
	});

	test('Copy path with double quoting', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyPathSeparator': 'auto',
			'explorer.copyPathQuoting': 'double',
		});

		const resource = URI.file('/test/path/file.ts');
		await resourcesToClipboard([resource], false, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		assert.ok(clipboard.lastWritten.startsWith('"'), `Expected double quote at start, got: ${clipboard.lastWritten}`);
		assert.ok(clipboard.lastWritten.endsWith('"'), `Expected double quote at end, got: ${clipboard.lastWritten}`);
	});

	test('Copy relative path with single quoting', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyRelativePathSeparator': 'auto',
			'explorer.copyRelativePathQuoting': 'single',
		});

		const resource = URI.file('/test/path/file.ts');
		await resourcesToClipboard([resource], true, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		assert.strictEqual(clipboard.lastWritten, '\'relative/path/file.ts\'');
	});

	test('Copy relative path with double quoting', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyRelativePathSeparator': 'auto',
			'explorer.copyRelativePathQuoting': 'double',
		});

		const resource = URI.file('/test/path/file.ts');
		await resourcesToClipboard([resource], true, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		assert.strictEqual(clipboard.lastWritten, '"relative/path/file.ts"');
	});

	test('Copy relative path with no quoting', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyRelativePathSeparator': 'auto',
			'explorer.copyRelativePathQuoting': 'none',
		});

		const resource = URI.file('/test/path/file.ts');
		await resourcesToClipboard([resource], true, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		assert.strictEqual(clipboard.lastWritten, 'relative/path/file.ts');
	});

	test('Multiple resources are each quoted individually', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyPathSeparator': '/',
			'explorer.copyPathQuoting': 'double',
		});

		const resources = [
			URI.file('/test/path/file1.ts'),
			URI.file('/test/path/file2.ts'),
		];
		await resourcesToClipboard(resources, false, clipboard, label, config);
		assert.ok(clipboard.lastWritten);
		const lines = clipboard.lastWritten.split(/\r?\n/);
		assert.strictEqual(lines.length, 2);
		for (const line of lines) {
			assert.ok(line.startsWith('"'), `Expected double quote at start of line: ${line}`);
			assert.ok(line.endsWith('"'), `Expected double quote at end of line: ${line}`);
		}
	});

	test('Empty resources array does not write to clipboard', async () => {
		const clipboard = createMockClipboardService();
		const label = createMockLabelService();
		const config = createMockConfigurationService({
			'explorer.copyPathQuoting': 'single',
		});

		await resourcesToClipboard([], false, clipboard, label, config);
		assert.strictEqual(clipboard.lastWritten, undefined);
	});
});
