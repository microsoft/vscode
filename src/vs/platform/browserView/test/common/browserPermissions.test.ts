/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	BrowserPermissionStore,
	ISerializedBrowserPermissionsSnapshot,
	PermissionCategory,
	electronPermissionToCategories,
	toOriginKey,
} from '../../common/browserPermissions.js';

suite('BrowserPermissionStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('get/set/clear and origin normalization', () => {
		const store = new BrowserPermissionStore();

		assert.strictEqual(store.getDecision('https://example.com', PermissionCategory.Camera), undefined);

		store.set('https://example.com/some/path?q=1', PermissionCategory.Camera, 'allow');
		// Path/query are stripped down to the origin key.
		assert.strictEqual(store.getDecision('https://example.com', PermissionCategory.Camera), 'allow');
		assert.strictEqual(store.getDecision('https://example.com:443/x', PermissionCategory.Camera), 'allow');

		// Passing null clears the recorded decision, falling back to the default.
		store.set('https://example.com', PermissionCategory.Camera, null);
		assert.strictEqual(store.getDecision('https://example.com', PermissionCategory.Camera), undefined);
		assert.deepStrictEqual(store.origins(), []);

		store.dispose();
	});

	test('isAllowed falls back to per-category default state when unset', () => {
		const store = new BrowserPermissionStore();

		// Categories that prompt default to 'ask' (not allowed); some categories
		// (e.g. Sensors) default to 'allow'.
		assert.strictEqual(store.isAllowed('https://a.com', PermissionCategory.Location), false);
		assert.strictEqual(store.isAllowed('https://a.com', PermissionCategory.Sensors), true);
		// Devices default to 'allow' (the chooser itself is the consent gesture).
		assert.strictEqual(store.isAllowed('https://a.com', PermissionCategory.Devices), true);

		store.set('https://a.com', PermissionCategory.Location, 'allow');
		store.set('https://a.com', PermissionCategory.Sensors, 'deny');
		assert.strictEqual(store.isAllowed('https://a.com', PermissionCategory.Location), true);
		assert.strictEqual(store.isAllowed('https://a.com', PermissionCategory.Sensors), false);

		store.dispose();
	});

	test('onDidChange fires only on real changes', () => {
		const store = new BrowserPermissionStore();
		let changes = 0;
		const listener = store.onDidChange(() => changes++);

		store.set('https://a.com', PermissionCategory.Camera, 'allow');
		store.set('https://a.com', PermissionCategory.Camera, 'allow'); // no-op
		store.setMany('https://a.com', [
			{ category: PermissionCategory.Microphone, state: 'deny' },
			{ category: PermissionCategory.Camera, state: 'allow' }, // no-op
		]);
		store.clearOrigin('https://b.com'); // nothing recorded -> no-op

		assert.strictEqual(changes, 2);
		listener.dispose();
		store.dispose();
	});

	test('serialize/hydrate round-trips and clearOrigin/clear', () => {
		const store = new BrowserPermissionStore();
		store.setMany('https://a.com', [
			{ category: PermissionCategory.Camera, state: 'allow' },
			{ category: PermissionCategory.Microphone, state: 'deny' },
		]);
		store.set('https://b.com', PermissionCategory.Location, 'allow');

		const snapshot = store.serialize();
		assert.deepStrictEqual(snapshot, {
			origins: {
				'https://a.com': { camera: 'allow', microphone: 'deny' },
				'https://b.com': { location: 'allow' },
			},
		} satisfies ISerializedBrowserPermissionsSnapshot);

		const mirror = new BrowserPermissionStore();
		mirror.hydrate(snapshot);
		assert.deepStrictEqual(mirror.serialize(), snapshot);

		mirror.clearOrigin('https://a.com');
		assert.deepStrictEqual(mirror.origins(), ['https://b.com']);
		mirror.clear();
		assert.deepStrictEqual(mirror.serialize(), { origins: {} });

		store.dispose();
		mirror.dispose();
	});

	test('hydrate ignores unknown categories and bad input', () => {
		const store = new BrowserPermissionStore();
		store.hydrate({ origins: { 'https://a.com': { camera: 'allow', bogus: 'allow' } } } as unknown as ISerializedBrowserPermissionsSnapshot);
		assert.deepStrictEqual(store.serialize(), { origins: { 'https://a.com': { camera: 'allow' } } });

		store.hydrate(undefined);
		assert.deepStrictEqual(store.serialize(), { origins: {} });

		store.dispose();
	});
});

suite('electronPermissionToCategories', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps known permissions and media disambiguation', () => {
		assert.deepStrictEqual(electronPermissionToCategories('geolocation'), [PermissionCategory.Location]);
		assert.deepStrictEqual(electronPermissionToCategories('notifications'), [PermissionCategory.Notifications]);
		assert.deepStrictEqual(electronPermissionToCategories('sensors'), [PermissionCategory.Sensors]);
		// USB, Serial, and HID all map to the single Devices category.
		assert.deepStrictEqual(electronPermissionToCategories('usb'), [PermissionCategory.Devices]);
		assert.deepStrictEqual(electronPermissionToCategories('serial'), [PermissionCategory.Devices]);
		assert.deepStrictEqual(electronPermissionToCategories('hid'), [PermissionCategory.Devices]);
		assert.deepStrictEqual(electronPermissionToCategories('unrecognized'), []);

		// `media` resolves from hints, defaulting to both when none are given.
		assert.deepStrictEqual(electronPermissionToCategories('media'), [PermissionCategory.Camera, PermissionCategory.Microphone]);
		assert.deepStrictEqual(electronPermissionToCategories('media', ['video']), [PermissionCategory.Camera]);
		assert.deepStrictEqual(electronPermissionToCategories('media', ['audio']), [PermissionCategory.Microphone]);
	});
});

suite('toOriginKey', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes urls and tolerates bad input', () => {
		assert.strictEqual(toOriginKey('https://example.com/a/b?c=1#d'), 'https://example.com');
		assert.strictEqual(toOriginKey('http://host:8080/x'), 'http://host:8080');
		// file: URLs have no real origin, so they key off scheme + full path
		// with query and fragment stripped.
		assert.strictEqual(toOriginKey('file:///home/user/page.html?x=1#y'), 'file:///home/user/page.html');
		assert.strictEqual(toOriginKey('file:///C:/Users/me/index.html'), 'file:///C:/Users/me/index.html');
		assert.strictEqual(toOriginKey(undefined), '');
		assert.strictEqual(toOriginKey('  not a url  '), 'not a url');
		// Whitespace is trimmed before parsing so valid URLs still normalize.
		assert.strictEqual(toOriginKey('  https://example.com/a  '), 'https://example.com');
		// Opaque origins reported as the literal "null" have no real host.
		assert.strictEqual(toOriginKey('null'), '');
		assert.strictEqual(toOriginKey('   '), '');
	});
});
