/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { BrowserFavicon } from '../../common/browserFavicon.js';
import { BrowserHistoryStore, IBrowserHistoryItemHandle } from '../../common/browserHistory.js';

suite('BrowserFavicon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const firstUrl = 'https://first.example/page';
	const secondUrl = 'https://second.example/page';
	const oldIcon = 'data:image/png;base64,b2xk';
	const newIcon = 'data:image/png;base64,bmV3';

	function createFavicon() {
		const requests = new Map<string, DeferredPromise<string>>();
		const loaded: (string | undefined)[] = [];
		const favicon = store.add(new BrowserFavicon(firstUrl, url => {
			if (url.startsWith('data:')) {
				return Promise.resolve(url);
			}
			const request = new DeferredPromise<string>();
			requests.set(url, request);
			return request.p;
		}, new NullLogService()));
		store.add(favicon.onDidLoad(icon => loaded.push(icon)));
		return { favicon, requests, loaded };
	}

	test('only the newest request may publish, clear, or try fallback URLs', async () => {
		const { favicon, requests, loaded } = createFavicon();
		const oldSuccess = favicon.load(['old-success']);
		const oldFailure = favicon.load(['old-failure', 'stale-fallback']);
		await favicon.load([newIcon]);
		await requests.get('old-success')!.complete(oldIcon);
		await requests.get('old-failure')!.error(new Error('Unavailable'));
		await Promise.all([oldSuccess, oldFailure]);

		assert.deepStrictEqual({ icon: favicon.favicon, loaded, requests: [...requests.keys()] }, {
			icon: newIcon, loaded: [newIcon], requests: ['old-success', 'old-failure'],
		});
	});

	test('tries current fallbacks and clears when none succeeds', async () => {
		const { favicon, requests, loaded } = createFavicon();
		const fallback = favicon.load(['missing', newIcon]);
		await requests.get('missing')!.error(new Error('Unavailable'));
		await fallback;
		const missing = favicon.load(['also-missing']);
		await requests.get('also-missing')!.error(new Error('Unavailable'));
		await missing;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: undefined, loaded: [newIcon, undefined] });
	});

	test('an empty update supersedes an outstanding request', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		const pending = favicon.load(['pending']);
		await favicon.load([]);
		await requests.get('pending')!.complete(newIcon);
		await pending;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: undefined, loaded: [oldIcon, undefined] });
	});

	test('does not publish a request from the previous document after navigation starts', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		const pending = favicon.load(['old-document']);
		favicon.beginNavigation(secondUrl);
		await requests.get('old-document')!.complete(newIcon);
		await pending;
		const duringNavigation = favicon.favicon;
		favicon.commitNavigation(secondUrl);

		assert.deepStrictEqual({ duringNavigation, committed: favicon.favicon, loaded }, {
			duringNavigation: oldIcon, committed: undefined, loaded: [oldIcon],
		});
	});

	for (const finish of ['commit', 'abort', 'failure'] as const) {
		test(`keeps provisional icons out of committed state and history until ${finish}`, async () => {
			const { favicon } = createFavicon();
			const history = store.add(new BrowserHistoryStore());
			await favicon.load([oldIcon]);
			let handle: IBrowserHistoryItemHandle = history.add(firstUrl, 'First', favicon.favicon);
			store.add(favicon.onDidLoad(icon => handle.update({ favicon: icon ?? null })));
			favicon.beginNavigation(secondUrl);
			await favicon.load([newIcon]);
			const duringNavigation = favicon.favicon;
			if (finish === 'commit') {
				favicon.commitNavigation(secondUrl);
				handle = history.add(secondUrl, 'Second', favicon.favicon);
			} else if (finish === 'abort') {
				favicon.abortNavigation();
			} else {
				favicon.failNavigation();
			}
			const icons = history.entries.items.map(entry => entry.icon ? history.favicons.get(entry.icon) : undefined);

			assert.deepStrictEqual({ duringNavigation, committed: favicon.favicon, icons }, {
				duringNavigation: oldIcon,
				committed: finish === 'commit' ? newIcon : finish === 'abort' ? oldIcon : undefined,
				icons: finish === 'commit' ? [oldIcon, newIcon] : [oldIcon],
			});
		});
	}

	test('a candidate request may finish after its document commits', async () => {
		const { favicon, requests, loaded } = createFavicon();
		favicon.beginNavigation(secondUrl);
		const pending = favicon.load(['new-document']);
		favicon.commitNavigation(secondUrl);
		favicon.abortNavigation();
		await requests.get('new-document')!.complete(newIcon);
		await pending;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: newIcon, loaded: [newIcon] });
	});

	test('replacement history records the committed icon, including an explicit clear', async () => {
		const observations = [];
		for (const icon of [newIcon, undefined]) {
			const { favicon } = createFavicon();
			const history = store.add(new BrowserHistoryStore());
			await favicon.load([oldIcon]);
			const handle = history.add(firstUrl, 'First', favicon.favicon);
			store.add(favicon.onDidLoad(value => handle.update({ favicon: value ?? null })));
			favicon.beginNavigation(secondUrl);
			await favicon.load(icon ? [icon] : []);
			const beforeCommit = history.favicons.get(history.entries.items[0].icon!);
			favicon.commitNavigation(secondUrl);
			handle.update({ url: secondUrl, favicon: favicon.favicon ?? null });
			observations.push({
				beforeCommit,
				entries: history.entries.items.map(entry => ({ url: entry.url, icon: entry.icon ? history.favicons.get(entry.icon) : undefined })),
			});
		}
		assert.deepStrictEqual(observations, [
			{ beforeCommit: oldIcon, entries: [{ url: secondUrl, icon: newIcon }] },
			{ beforeCommit: oldIcon, entries: [{ url: secondUrl, icon: undefined }] },
		]);
	});

	test('cross-host redirects invalidate candidates even when returning to the original host', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		favicon.beginNavigation(firstUrl);
		const pending = favicon.load(['intermediate']);
		favicon.redirectNavigation(secondUrl);
		await favicon.load([newIcon]);
		favicon.redirectNavigation(firstUrl);
		await requests.get('intermediate')!.complete(newIcon);
		await pending;
		const duringNavigation = favicon.favicon;
		favicon.commitNavigation(firstUrl);

		assert.deepStrictEqual({ duringNavigation, committed: favicon.favicon, loaded }, {
			duringNavigation: oldIcon, committed: undefined, loaded: [oldIcon],
		});
	});

	test('same-host redirects keep the candidate and do not cancel its request', async () => {
		const { favicon, requests } = createFavicon();
		await favicon.load([oldIcon]);
		favicon.beginNavigation(firstUrl);
		const pending = favicon.load(['same-host']);
		favicon.redirectNavigation('https://first.example/redirected');
		await requests.get('same-host')!.complete(newIcon);
		await pending;
		favicon.commitNavigation('https://first.example/redirected');

		assert.strictEqual(favicon.favicon, newIcon);
	});

	test('superseding provisional navigations do not replace the original committed icon on abort', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		favicon.beginNavigation(secondUrl);
		await favicon.load([newIcon]);
		favicon.beginNavigation('https://third.example/');
		const pending = favicon.load(['superseded']);
		favicon.commitNavigation(firstUrl + '#same-document', true);
		favicon.abortNavigation();
		await requests.get('superseded')!.complete(newIcon);
		await pending;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: oldIcon, loaded: [oldIcon] });
	});

	test('same-document navigation preserves current fetches and explicit empty candidates clear at commit', async () => {
		const { favicon, requests, loaded } = createFavicon();
		const pending = favicon.load(['current']);
		favicon.commitNavigation(firstUrl + '#fragment', true);
		await requests.get('current')!.complete(oldIcon);
		await pending;
		favicon.beginNavigation(firstUrl);
		await favicon.load([]);
		const duringNavigation = favicon.favicon;
		favicon.commitNavigation(firstUrl);

		assert.deepStrictEqual({ duringNavigation, committed: favicon.favicon, loaded }, {
			duringNavigation: oldIcon, committed: undefined, loaded: [oldIcon],
		});
	});

	test('failed loads reject pending and late favicon work until a new navigation', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		favicon.beginNavigation(secondUrl);
		const pending = favicon.load(['failing-document']);
		favicon.failNavigation();
		await requests.get('failing-document')!.complete(newIcon);
		await pending;
		await favicon.load(['after-failure']);
		const failedIcon = favicon.favicon;
		favicon.beginNavigation(firstUrl);
		await favicon.load([newIcon]);
		favicon.commitNavigation(firstUrl);

		assert.deepStrictEqual({ failedIcon, recovered: favicon.favicon, loaded, requests: [...requests.keys()] }, {
			failedIcon: undefined, recovered: newIcon, loaded: [oldIcon], requests: ['failing-document'],
		});
	});

	test('disposal prevents pending completions and new requests', async () => {
		const { favicon, requests, loaded } = createFavicon();
		const pending = favicon.load(['pending']);
		favicon.dispose();
		await requests.get('pending')!.complete(newIcon);
		await pending;
		await favicon.load(['after-disposal']);

		assert.deepStrictEqual({ loaded, requests: [...requests.keys()] }, { loaded: [], requests: ['pending'] });
	});
});
