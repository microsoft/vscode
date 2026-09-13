/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createTestBrowserView } from './browserViewTestUtils.js';

suite('BrowserView favicon navigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const oldIcon = 'data:image/png;base64,b2xk';

	const createView = (associatedResource?: URI) => createTestBrowserView(store, associatedResource);

	test('clears the authoritative icon before a cross-host redirect commits', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.redirect('https://second.example/destination');
		const beforeCommit = testCase.view.getNavigationState().lastFavicon;
		testCase.commit('https://second.example/destination');

		assert.deepStrictEqual({ beforeCommit, snapshotIcon: testCase.view.getNavigationState().lastFavicon, history: testCase.history }, {
			beforeCommit: undefined,
			snapshotIcon: undefined,
			history: [
				{ url: 'https://first.example/page', favicon: oldIcon },
				{ url: 'https://second.example/destination', favicon: undefined },
			],
		});
	});

	test('discards a favicon request started after navigation but before the redirect', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.events.emit('page-favicon-updated', {}, ['https://first.example/intermediate.png']);
		testCase.redirect('https://second.example/destination');
		testCase.commit('https://second.example/destination');
		await testCase.completeFavicon('https://first.example/intermediate.png', 'stale-icon');

		assert.deepStrictEqual({ snapshotIcon: testCase.view.getNavigationState().lastFavicon, committedIcon: testCase.history[1].favicon }, {
			snapshotIcon: undefined, committedIcon: undefined,
		});
	});

	test('clears intermediate icons when a redirect chain returns to the original host', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.redirect('https://second.example/intermediate');
		await testCase.setIcon('data:image/png;base64,aW50ZXJtZWRpYXRl');
		testCase.redirect('https://first.example/destination');

		assert.strictEqual(testCase.view.getNavigationState().lastFavicon, undefined);
	});

	test('keeps the icon for same-host redirects and cross-host subframe redirects', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.redirect('https://first.example/destination');
		const sameHost = testCase.view.getNavigationState().lastFavicon;
		testCase.redirect('https://second.example/frame', false);

		assert.deepStrictEqual({ sameHost, afterSubframe: testCase.view.getNavigationState().lastFavicon }, {
			sameHost: oldIcon, afterSubframe: oldIcon,
		});
	});

	test('does not clear the icon when the redirect is diverted to a new editor', async () => {
		const testCase = createView(URI.file('/workspace/page.html'));
		await testCase.setIcon(oldIcon);
		const prevented = testCase.redirect('https://second.example/destination');

		assert.deepStrictEqual({ prevented, childCreates: testCase.childCreates, favicon: testCase.view.getNavigationState().lastFavicon }, {
			prevented: true, childCreates: 1, favicon: oldIcon,
		});
	});

	test('preserves a pending favicon when navigation is diverted after did-start-navigation', async () => {
		const testCase = createView(URI.file('/workspace/page.html'));
		const iconUrl = 'https://first.example/pending.png';
		testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
		const prevented = testCase.navigate('https://second.example/destination');
		await testCase.completeFavicon(iconUrl, 'kept');

		assert.deepStrictEqual({
			prevented, childCreates: testCase.childCreates,
			favicon: testCase.view.getNavigationState().lastFavicon, historyIcon: testCase.history[0].favicon,
		}, {
			prevented: true, childCreates: 1,
			favicon: 'data:image/png;base64,a2VwdA==', historyIcon: 'data:image/png;base64,a2VwdA==',
		});
	});

	test('still discards pending work after an accepted document navigation', async () => {
		const testCase = createView();
		const iconUrl = 'https://first.example/pending.png';
		testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
		const prevented = testCase.navigate('https://first.example/next');
		await testCase.completeFavicon(iconUrl, 'stale');

		assert.deepStrictEqual({ prevented, favicon: testCase.view.getNavigationState().lastFavicon }, {
			prevented: false, favicon: undefined,
		});
	});

	for (const method of ['loadURL', 'back', 'forward'] as const) {
		test(`clears cross-host favicon state for ${method} without will-navigate`, async () => {
			const testCase = createView();
			await testCase.setIcon(oldIcon);
			await testCase.navigateProgrammatically(method, 'https://second.example/destination');
			const beforeCommit = testCase.view.getNavigationState().lastFavicon;
			testCase.commit('https://second.example/destination');

			assert.deepStrictEqual({
				calls: testCase.programmaticCalls, beforeCommit,
				snapshotIcon: testCase.view.getNavigationState().lastFavicon, historyIcon: testCase.history[1].favicon,
			}, {
				calls: [method], beforeCommit: undefined, snapshotIcon: undefined, historyIcon: undefined,
			});
		});
	}
});
