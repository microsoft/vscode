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

	for (const redirect of [false, true]) {
		test(`restores the committed favicon after an aborted cross-host ${redirect ? 'redirect' : 'navigation'}`, async () => {
			const testCase = createView();
			await testCase.setIcon(oldIcon);
			const favicons: (string | undefined)[] = [];
			store.add(testCase.view.onDidChangeFavicon(event => favicons.push(event.favicon)));
			const target = 'https://second.example/destination';
			testCase.navigate(redirect ? 'https://first.example/redirect' : target);
			if (redirect) {
				testCase.redirect(target);
			}
			const pending = testCase.view.getNavigationState();
			testCase.events.emit('did-fail-provisional-load', {}, -3, 'ERR_ABORTED', target, true);
			testCase.events.emit('did-stop-loading');
			const stopped = testCase.view.getNavigationState();
			testCase.events.emit('did-navigate-in-page', {}, 'https://first.example/page#after-cancel', true);

			assert.deepStrictEqual({
				pendingIcon: pending.lastFavicon, stoppedIcon: stopped.lastFavicon,
				newerVersion: stopped.navigationStateVersion > pending.navigationStateVersion,
				afterSameDocumentNavigation: testCase.view.getNavigationState().lastFavicon,
				originalHistoryIcon: testCase.history[0].favicon, favicons,
			}, {
				pendingIcon: undefined, stoppedIcon: oldIcon, newerVersion: true,
				afterSameDocumentNavigation: oldIcon, originalHistoryIcon: oldIcon, favicons: [oldIcon],
			});
		});
	}

	test('preserves the original favicon across multiple uncommitted navigations and an abort', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://second.example/first');
		testCase.navigate('https://third.example/second');
		testCase.events.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://second.example/first', true);
		const whileLoading = testCase.view.getNavigationState().lastFavicon;
		testCase.events.emit('did-navigate-in-page', {}, 'https://first.example/page#pending', true);
		testCase.events.emit('did-stop-loading');

		assert.deepStrictEqual({ whileLoading, stopped: testCase.view.getNavigationState().lastFavicon }, {
			whileLoading: undefined, stopped: oldIcon,
		});
	});

	test('discards pending provisional favicon work after restoring the committed icon', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://second.example/destination');
		const iconUrl = 'https://second.example/pending.png';
		testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
		testCase.events.emit('did-stop-loading');
		await testCase.completeFavicon(iconUrl, 'stale');

		assert.deepStrictEqual({ icon: testCase.view.getNavigationState().lastFavicon, historyIcon: testCase.history[0].favicon }, {
			icon: oldIcon, historyIcon: oldIcon,
		});
	});

	test('does not restore the previous favicon after a successful commit', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://second.example/destination');
		testCase.commit('https://second.example/destination');
		testCase.events.emit('did-stop-loading');
		const iconless = testCase.view.getNavigationState().lastFavicon;
		const newIcon = 'data:image/png;base64,bmV3';
		await testCase.setIcon(newIcon);
		testCase.events.emit('did-stop-loading');
		testCase.navigate('https://third.example/destination');
		testCase.events.emit('did-stop-loading');

		assert.deepStrictEqual({ iconless, afterLaterAbort: testCase.view.getNavigationState().lastFavicon }, {
			iconless: undefined, afterLaterAbort: newIcon,
		});
	});

	test('does not restore the previous favicon after a non-aborted main-frame failure', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		const target = 'https://second.example/destination';
		testCase.navigate(target);
		testCase.events.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', target, true);
		testCase.events.emit('did-stop-loading');
		const state = testCase.view.getNavigationState();

		assert.deepStrictEqual({ favicon: state.lastFavicon, error: state.lastError?.errorCode, historyIcon: testCase.history[0].favicon }, {
			favicon: undefined, error: -105, historyIcon: oldIcon,
		});
	});

	test('subframe failures do not discard the main-frame favicon needed on abort', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://second.example/destination');
		testCase.events.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://frame.example/', false);
		testCase.events.emit('did-stop-loading');

		assert.strictEqual(testCase.view.getNavigationState().lastFavicon, oldIcon);
	});

	test('an unchanged favicon does not produce another notification after a same-host abort', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		const favicons: (string | undefined)[] = [];
		store.add(testCase.view.onDidChangeFavicon(event => favicons.push(event.favicon)));
		testCase.navigate('https://first.example/next');
		testCase.events.emit('did-stop-loading');
		testCase.events.emit('did-stop-loading');

		assert.deepStrictEqual({ favicon: testCase.view.getNavigationState().lastFavicon, favicons }, {
			favicon: oldIcon, favicons: [],
		});
	});

	for (const success of [true, false]) {
		for (const commit of [true, false]) {
			test(`defers a provisional favicon ${success ? 'update' : 'clear'} until navigation ${commit ? 'commits' : 'aborts'}`, async () => {
				const testCase = createView();
				await testCase.setIcon(oldIcon);
				const target = 'https://first.example/next';
				const iconUrl = 'https://first.example/provisional.png';
				const provisionalIcon = success ? 'data:image/png;base64,bmV3' : undefined;
				testCase.navigate(target);
				testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
				await testCase.completeFavicon(iconUrl, 'new', success ? 200 : 404);
				const duringNavigation = {
					favicon: testCase.view.getNavigationState().lastFavicon,
					history: testCase.history.map(entry => ({ ...entry })),
				};
				if (commit) {
					testCase.commit(target);
				}
				testCase.events.emit('did-stop-loading');

				assert.deepStrictEqual({
					duringNavigation,
					favicon: testCase.view.getNavigationState().lastFavicon,
					history: testCase.history,
				}, {
					duringNavigation: {
						favicon: provisionalIcon,
						history: [{ url: 'https://first.example/page', favicon: oldIcon }],
					},
					favicon: commit ? provisionalIcon : oldIcon,
					history: [
						{ url: 'https://first.example/page', favicon: oldIcon },
						...(commit ? [{ url: target, favicon: provisionalIcon }] : []),
					],
				});
			});
		}

		test(`records a provisional favicon ${success ? 'update' : 'clear'} when the document replaces its history entry`, async () => {
			const testCase = createView();
			await testCase.setIcon(oldIcon);
			const target = 'https://first.example/replacement';
			const iconUrl = 'https://first.example/provisional.png';
			testCase.navigate(target);
			testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
			await testCase.completeFavicon(iconUrl, 'new', success ? 200 : 404);
			const beforeCommit = testCase.history[0].favicon;
			testCase.commit(target, { replace: true });

			assert.deepStrictEqual({
				beforeCommit,
				favicon: testCase.view.getNavigationState().lastFavicon,
				history: testCase.history.map(({ url, favicon }) => ({ url, favicon })),
			}, {
				beforeCommit: oldIcon,
				favicon: success ? 'data:image/png;base64,bmV3' : undefined,
				history: [{ url: target, favicon: success ? 'data:image/png;base64,bmV3' : null }],
			});
		});
	}

	test('same-document history updates during a provisional load keep the committed favicon', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://second.example/destination');
		await testCase.setIcon('data:image/png;base64,bmV3');
		testCase.commit('https://first.example/page#pending', { sameDocument: true, replace: true });
		const duringNavigation = testCase.history[0].favicon;
		testCase.events.emit('did-stop-loading');

		assert.deepStrictEqual({
			duringNavigation, favicon: testCase.view.getNavigationState().lastFavicon,
			history: testCase.history.map(({ url, favicon }) => ({ url, favicon })),
		}, {
			duringNavigation: oldIcon, favicon: oldIcon,
			history: [{ url: 'https://first.example/page#pending', favicon: oldIcon }],
		});
	});

	for (const sameHost of [true, false]) {
		for (const completeBeforeFailure of [true, false]) {
			test(`rejects a ${sameHost ? 'same-host' : 'cross-host'} favicon completed ${completeBeforeFailure ? 'before' : 'after'} a failed navigation`, async () => {
				const testCase = createView();
				await testCase.setIcon(oldIcon);
				const target = `https://${sameHost ? 'first' : 'second'}.example/destination`;
				const iconUrl = 'https://first.example/provisional.png';
				const favicons: (string | undefined)[] = [];
				store.add(testCase.view.onDidChangeFavicon(event => favicons.push(event.favicon)));
				testCase.navigate(target);
				testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
				if (completeBeforeFailure) {
					await testCase.completeFavicon(iconUrl, 'new');
				}
				testCase.events.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', target, true);
				testCase.events.emit('did-stop-loading');
				if (!completeBeforeFailure) {
					await testCase.completeFavicon(iconUrl, 'new');
				}
				const state = testCase.view.getNavigationState();

				assert.deepStrictEqual({
					favicon: state.lastFavicon, error: state.lastError?.errorCode,
					historyIcon: testCase.history[0].favicon, favicons,
				}, {
					favicon: undefined, error: -105, historyIcon: oldIcon,
					favicons: completeBeforeFailure ? ['data:image/png;base64,bmV3', undefined] : sameHost ? [undefined] : [],
				});
			});
		}
	}

	test('subframe failures leave current favicon work active', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		const iconUrl = 'https://first.example/current.png';
		testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
		testCase.events.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://frame.example/', false);
		await testCase.completeFavicon(iconUrl, 'new');

		assert.deepStrictEqual({
			favicon: testCase.view.getNavigationState().lastFavicon,
			historyIcon: testCase.history[0].favicon,
		}, {
			favicon: 'data:image/png;base64,bmV3', historyIcon: 'data:image/png;base64,bmV3',
		});
	});
});
