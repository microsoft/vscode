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

	function createFavicon(readFaviconUrls: () => Promise<readonly string[] | undefined> = async () => undefined) {
		const requests = new Map<string, DeferredPromise<string>>();
		const loaded: (string | undefined)[] = [];
		const favicon = store.add(new BrowserFavicon(firstUrl, readFaviconUrls, url => {
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

	for (const replaced of [false, true]) {
		test(`an in-flight request ${replaced ? 'cannot outlive a full commit' : 'keeps its committed document as owner'}`, async () => {
			const { favicon, requests, loaded } = createFavicon();
			const pending = favicon.load(['outgoing']);
			if (replaced) {
				favicon.commitNavigation(secondUrl);
			}
			await requests.get('outgoing')!.complete(newIcon);
			await pending;

			assert.deepStrictEqual({ icon: favicon.favicon, loaded }, {
				icon: replaced ? undefined : newIcon, loaded: replaced ? [] : [newIcon],
			});
		});
	}

	test('updates the outgoing history entry until a new document commits', async () => {
		const { favicon } = createFavicon();
		const history = store.add(new BrowserHistoryStore());
		await favicon.load([oldIcon]);
		let handle: IBrowserHistoryItemHandle = history.add(firstUrl, 'First', favicon.favicon);
		store.add(favicon.onDidLoad(icon => handle.update({ favicon: icon ?? null })));
		await favicon.load([newIcon]);
		const beforeCommit = favicon.favicon;
		favicon.commitNavigation(secondUrl);
		handle = history.add(secondUrl, 'Second', favicon.favicon);
		await favicon.load([oldIcon]);

		assert.deepStrictEqual({
			beforeCommit,
			current: favicon.favicon,
			icons: history.entries.items.map(entry => entry.icon ? history.favicons.get(entry.icon) : undefined),
		}, { beforeCommit: newIcon, current: oldIcon, icons: [newIcon, oldIcon] });
	});

	test('replacement history records the committed icon, including an explicit clear', async () => {
		const observations = [];
		for (const icon of [newIcon, undefined]) {
			const { favicon } = createFavicon();
			const history = store.add(new BrowserHistoryStore());
			await favicon.load([oldIcon]);
			const handle = history.add(firstUrl, 'First', favicon.favicon);
			store.add(favicon.onDidLoad(value => handle.update({ favicon: value ?? null })));
			const beforeCommit = history.favicons.get(history.entries.items[0].icon!);
			favicon.commitNavigation(secondUrl);
			handle.update({ url: secondUrl, favicon: favicon.favicon ?? null });
			await favicon.load(icon ? [icon] : []);
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

	test('same-URL replacement cannot resurrect an outgoing request after clearing the icon', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		const pending = favicon.load(['superseded']);
		favicon.commitNavigation(firstUrl);
		await favicon.load([]);
		await requests.get('superseded')!.complete(newIcon);
		await pending;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: undefined, loaded: [oldIcon, undefined] });
	});

	test('same-document navigation preserves current fetches', async () => {
		const { favicon, requests, loaded } = createFavicon();
		const pending = favicon.load(['current']);
		favicon.commitNavigation(firstUrl + '#fragment', true);
		await requests.get('current')!.complete(oldIcon);
		await pending;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: oldIcon, loaded: [oldIcon] });
	});

	test('reacquires identical candidates after a cross-host commit', async () => {
		const { favicon, loaded } = createFavicon(async () => [oldIcon]);
		await favicon.refresh();
		favicon.commitNavigation(secondUrl);
		const atCommit = favicon.favicon;
		await favicon.refresh();

		assert.deepStrictEqual({ atCommit, icon: favicon.favicon, loaded }, { atCommit: undefined, icon: oldIcon, loaded: [oldIcon, oldIcon] });
	});

	test('only the latest document read may publish', async () => {
		const first = new DeferredPromise<readonly string[]>();
		const second = new DeferredPromise<readonly string[]>();
		const reads = [first, second];
		const { favicon, loaded } = createFavicon(() => reads.shift()!.p);
		const older = favicon.refresh();
		const newer = favicon.refresh();
		await first.complete([oldIcon]);
		await older;
		const beforeLatest = favicon.favicon;
		await second.complete([newIcon]);
		await newer;

		assert.deepStrictEqual({ beforeLatest, icon: favicon.favicon, loaded }, { beforeLatest: undefined, icon: newIcon, loaded: [newIcon] });
	});

	test('a newer native request takes precedence over an outstanding document read', async () => {
		const read = new DeferredPromise<readonly string[]>();
		const { favicon, requests, loaded } = createFavicon(() => read.p);
		const reading = favicon.refresh();
		const loading = favicon.load(['native']);
		await read.complete([oldIcon]);
		await reading;
		await requests.get('native')!.complete(newIcon);
		await loading;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded, requests: [...requests.keys()] }, {
			icon: newIcon, loaded: [newIcon], requests: ['native'],
		});
	});

	test('discards a document read across a same-URL commit', async () => {
		const read = new DeferredPromise<readonly string[]>();
		const { favicon, loaded } = createFavicon(() => read.p);
		await favicon.load([oldIcon]);
		favicon.commitNavigation(firstUrl);
		const reading = favicon.refresh();
		favicon.commitNavigation(firstUrl);
		await read.complete([newIcon]);
		await reading;

		assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: oldIcon, loaded: [oldIcon] });
	});

	for (const fails of [false, true]) {
		test(`a document read that ${fails ? 'fails' : 'is not ready'} does not invalidate an active fetch`, async () => {
			const { favicon, requests, loaded } = createFavicon(async () => {
				if (fails) {
					throw new Error('Frame detached');
				}
				return undefined;
			});
			const pending = favicon.load(['pending']);
			await favicon.refresh();
			await requests.get('pending')!.complete(newIcon);
			await pending;

			assert.deepStrictEqual({ icon: favicon.favicon, loaded }, { icon: newIcon, loaded: [newIcon] });
		});
	}

	test('failed loads reject pending and late favicon work until a new navigation', async () => {
		const { favicon, requests, loaded } = createFavicon();
		await favicon.load([oldIcon]);
		const pending = favicon.load(['failing-document']);
		favicon.failNavigation();
		await requests.get('failing-document')!.complete(newIcon);
		await pending;
		await favicon.load(['after-failure']);
		const failedIcon = favicon.favicon;
		favicon.commitNavigation(firstUrl);
		await favicon.load([newIcon]);

		assert.deepStrictEqual({ failedIcon, recovered: favicon.favicon, loaded, requests: [...requests.keys()] }, {
			failedIcon: undefined, recovered: newIcon, loaded: [oldIcon, newIcon], requests: ['failing-document'],
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
