/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { KeyboardEvent, MenuItem, MenuItemConstructorOptions } from 'electron';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createBrowserViewExternalLinkMenuItem } from '../../electron-main/browserViewContextMenu.js';

suite('BrowserView external-link context menu', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const presentation = { type: 'external', resource: URI.parse('test-canvas:/owner/chat/instance') } satisfies NonNullable<Parameters<typeof createBrowserViewExternalLinkMenuItem>[0]>;

	function click(item: MenuItemConstructorOptions): void {
		item.click?.(upcastPartial<MenuItem>({}), undefined, upcastPartial<KeyboardEvent>({}));
	}

	test('unsafe canvas links are disabled and their callbacks cannot invoke the external opener', () => {
		const opened: string[] = [];
		const blocked: string[] = [];
		const log = store.add(new class extends NullLogService {
			override warn(message: string): void { blocked.push(message); }
		}());
		const urls = ['file:///private/canvas/index.html', 'vscode://publisher.extension/action', 'custom-app:action'];
		const enabled = urls.map(url => {
			const item = createBrowserViewExternalLinkMenuItem(presentation, url, async target => { opened.push(target); return true; }, log);
			click(item);
			return item.enabled;
		});
		assert.deepStrictEqual({ enabled, opened, blocked: blocked.length }, { enabled: [false, false, false], opened: [], blocked: 3 });
	});

	test('allowed canvas links preserve the exact user-selected target', () => {
		const opened: string[] = [];
		const log = store.add(new NullLogService());
		const urls = ['https://example.com/trace', 'http://127.0.0.1:3000/help', 'mailto:help@example.com'];
		const enabled = urls.map(url => {
			const item = createBrowserViewExternalLinkMenuItem(presentation, url, async target => { opened.push(target); return true; }, log);
			click(item);
			return item.enabled;
		});
		assert.deepStrictEqual({ enabled, opened }, { enabled: [true, true, true], opened: urls });
	});

	test('ordinary browser links retain their existing external-scheme behavior', () => {
		const opened: string[] = [];
		const log = store.add(new NullLogService());
		const urls = ['file:///private/example.html', 'vscode://publisher.extension/action', 'custom-app:action'];
		const enabled = urls.map(url => {
			const item = createBrowserViewExternalLinkMenuItem(undefined, url, async target => { opened.push(target); return true; }, log);
			click(item);
			return item.enabled;
		});
		assert.deepStrictEqual({ enabled, opened }, { enabled: [true, true, true], opened: urls });
	});

	test('an external opener failure is reported without retrying', async () => {
		const failure = new Error('Controlled external opener failure');
		const errors: Error[] = [];
		let attempts = 0;
		const log = store.add(new class extends NullLogService {
			override error(_message: string, error: Error): void { errors.push(error); }
		}());
		click(createBrowserViewExternalLinkMenuItem(presentation, 'https://example.com', async () => { attempts++; throw failure; }, log));
		await timeout(0);
		assert.deepStrictEqual({ attempts, errors }, { attempts: 1, errors: [failure] });
	});
});
