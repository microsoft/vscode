/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { registerWindow } from '../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { timeout } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FontMeasurementsImpl, ISerializedFontInfo } from '../../../browser/config/fontMeasurements.js';
import { FontInfo, SERIALIZED_FONT_INFO_VERSION } from '../../../common/config/fontInfo.js';

suite('FontMeasurements', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	const restoredFontInfo: ISerializedFontInfo = {
		version: SERIALIZED_FONT_INFO_VERSION,
		pixelRatio: 1,
		fontFamily: 'monospace',
		fontWeight: 'normal',
		fontSize: 14,
		fontFeatureSettings: '"liga" off, "calt" off',
		fontVariationSettings: 'normal',
		lineHeight: 19,
		letterSpacing: 0,
		isMonospace: true,
		typicalHalfwidthCharacterWidth: 8,
		typicalFullwidthCharacterWidth: 14,
		canUseHalfwidthRightwardsArrow: true,
		spaceWidth: 8,
		middotWidth: 8,
		wsmiddotWidth: 14,
		maxDigitWidth: 8,
	};

	function createAuxiliaryWindow() {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, 999);
		const registration = store.add(registerWindow(auxiliaryWindow));
		return { auxiliaryWindow, registration };
	}

	test('releases readings for unregistered windows without invalidating the main window', () => {
		const fontMeasurements = store.add(new FontMeasurementsImpl());
		const { auxiliaryWindow, registration } = createAuxiliaryWindow();
		const options = new FontInfo(restoredFontInfo, false);
		const mainFont = fontMeasurements.readFontInfo(mainWindow, options);
		const auxiliaryFont = fontMeasurements.readFontInfo(auxiliaryWindow, options);
		assert.strictEqual(auxiliaryFont.isTrusted, true);

		registration.dispose();

		assert.deepStrictEqual({
			closed: fontMeasurements.serializeFontInfo(auxiliaryWindow),
			live: fontMeasurements.serializeFontInfo(mainWindow),
			liveCachePreserved: fontMeasurements.readFontInfo(mainWindow, options) === mainFont,
		}, {
			closed: [],
			live: [mainFont],
			liveCachePreserved: true,
		});
	});

	test('does not emit a delayed font change for an unregistered window', () => {
		const fontMeasurements = store.add(new FontMeasurementsImpl());
		const { auxiliaryWindow, registration } = createAuxiliaryWindow();
		const timerOptions = { global: auxiliaryWindow, toFake: ['setTimeout', 'clearTimeout'] };
		const clock = sinon.useFakeTimers(timerOptions);
		let changes = 0;
		store.add(fontMeasurements.onDidChange(() => changes++));
		fontMeasurements.restoreFontInfo(auxiliaryWindow, [restoredFontInfo]);

		registration.dispose();
		clock.tick(5000);

		assert.deepStrictEqual({ changes, serialized: fontMeasurements.serializeFontInfo(auxiliaryWindow) }, {
			changes: 0,
			serialized: [],
		});
	});

	test('allows closed-window font measurements to be garbage collected', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		const fontMeasurements = store.add(new FontMeasurementsImpl());
		const { auxiliaryWindow, registration } = createAuxiliaryWindow();
		const reading = new WeakRef(fontMeasurements.readFontInfo(auxiliaryWindow, new FontInfo(restoredFontInfo, false)));
		registration.dispose();

		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });

		assert.strictEqual(reading.deref(), undefined, 'The closed window font reading is still retained');
	});

	test('preserves restored untrusted font information through eviction', () => {
		const clock = sinon.useFakeTimers();
		const fontMeasurements = store.add(new FontMeasurementsImpl());
		const initiallySerialized = fontMeasurements.serializeFontInfo(mainWindow);
		let changeCount = 0;
		store.add(fontMeasurements.onDidChange(() => changeCount++));

		fontMeasurements.restoreFontInfo(mainWindow, [restoredFontInfo]);
		const isTrusted = fontMeasurements.readFontInfo(mainWindow, new FontInfo(restoredFontInfo, false)).isTrusted;
		const serializedBeforeEviction = fontMeasurements.serializeFontInfo(mainWindow);

		clock.tick(5000);

		const serializedAfterEviction = fontMeasurements.serializeFontInfo(mainWindow);
		const changeCountAfterEviction = changeCount;

		fontMeasurements.clearAllFontInfos();

		assert.deepStrictEqual({
			initiallySerialized,
			isTrusted,
			serializedBeforeEviction,
			serializedAfterEviction,
			changeCountAfterEviction,
			serializedAfterClear: fontMeasurements.serializeFontInfo(mainWindow),
		}, {
			initiallySerialized: [],
			isTrusted: false,
			serializedBeforeEviction: undefined,
			serializedAfterEviction: undefined,
			changeCountAfterEviction: 1,
			serializedAfterClear: [],
		});
	});

	test('serializes empty current-session failed font measurements', () => {
		const fontMeasurements = store.add(new FontMeasurementsImpl());
		const fontInfo = fontMeasurements.readFontInfo(mainWindow, new FontInfo({ ...restoredFontInfo, fontSize: 0 }, false));

		assert.deepStrictEqual({
			isTrusted: fontInfo.isTrusted,
			serialized: fontMeasurements.serializeFontInfo(mainWindow),
		}, {
			isTrusted: false,
			serialized: [],
		});
	});
});
