/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../base/browser/window.js';
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
