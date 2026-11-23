/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewFavicon } from '../../electron-main/browserViewFavicon.js';

suite('BrowserViewFavicon', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const url = 'http://127.0.0.1:8123/';
	const originalFavicon = 'data:image/svg+xml;base64,original';
	const failedUrl = 'http://favicon-recovery-test.invalid/';

	test('reports no cross-host error favicon and restores it on return without another favicon update', () => {
		const changes: (string | undefined)[] = [];
		const favicon = new BrowserViewFavicon(url, value => changes.push(value));
		favicon.update(originalFavicon);
		const original = favicon.value;
		favicon.didFailLoad(failedUrl);
		const failed = favicon.value;

		const errorPageUpdate = favicon.update(undefined);
		favicon.didNavigate(url);
		const recovered = favicon.value;
		favicon.didNavigate(url);
		const reloaded = favicon.value;

		assert.deepStrictEqual({ original, failed, errorPageUpdate, recovered, reloaded, changes }, {
			original: originalFavicon,
			failed: undefined,
			errorPageUpdate: false,
			recovered: originalFavicon,
			reloaded: originalFavicon,
			changes: [originalFavicon, undefined, originalFavicon],
		});
	});

	test('retains the document favicon across repeated failed loads', () => {
		const favicon = new BrowserViewFavicon(url, () => { });
		favicon.update(originalFavicon);
		favicon.didFailLoad(failedUrl);
		favicon.didFailLoad('http://another-failed-host.invalid/');
		const failed = favicon.value;
		favicon.didNavigate(url);

		assert.deepStrictEqual({ failed, recovered: favicon.value }, { failed: undefined, recovered: originalFavicon });
	});

	test('clears the retained icon on successful cross-host navigation', () => {
		const changes: (string | undefined)[] = [];
		const favicon = new BrowserViewFavicon(url, value => changes.push(value));
		favicon.update(originalFavicon);
		favicon.didFailLoad(failedUrl);
		const otherUrl = 'https://example.com/';
		favicon.didNavigate(otherUrl);
		const otherHost = favicon.value;
		favicon.update('other favicon');
		const updated = favicon.value;
		favicon.didNavigate(url);

		assert.deepStrictEqual({ otherHost, updated, returned: favicon.value, changes }, {
			otherHost: undefined,
			updated: 'other favicon',
			returned: undefined,
			changes: [originalFavicon, undefined, 'other favicon', undefined],
		});
	});

	test('clears the displayed icon on direct successful cross-host navigation', () => {
		const changes: (string | undefined)[] = [];
		const favicon = new BrowserViewFavicon(url, value => changes.push(value));
		favicon.update(originalFavicon);
		favicon.didNavigate('https://example.com/');

		assert.deepStrictEqual({ value: favicon.value, changes }, {
			value: undefined,
			changes: [originalFavicon, undefined],
		});
	});

	test('preserves same-host favicons across navigation and load failures', () => {
		const changes: (string | undefined)[] = [];
		const favicon = new BrowserViewFavicon(url, value => changes.push(value));
		favicon.update(originalFavicon);
		favicon.didNavigate(`${url}next`);
		const navigated = favicon.value;
		favicon.didFailLoad(`${url}unavailable`);
		const failed = favicon.value;
		favicon.didNavigate(url);

		assert.deepStrictEqual({ navigated, failed, recovered: favicon.value, changes }, {
			navigated: originalFavicon,
			failed: originalFavicon,
			recovered: originalFavicon,
			changes: [originalFavicon],
		});
	});

	test('preserves the document favicon across a same-document URL change', () => {
		const favicon = new BrowserViewFavicon(url, () => { });
		favicon.update(originalFavicon);
		favicon.didNavigate(url + '#section');

		assert.strictEqual(favicon.value, originalFavicon);
	});

	test('does not restore a favicon that was removed by the successful document', () => {
		const changes: (string | undefined)[] = [];
		const favicon = new BrowserViewFavicon(url, value => changes.push(value));
		favicon.update(originalFavicon);
		favicon.update(undefined);
		favicon.didFailLoad(failedUrl);
		favicon.didNavigate(url);

		assert.deepStrictEqual({ value: favicon.value, changes }, { value: undefined, changes: [originalFavicon, undefined] });
	});
});
