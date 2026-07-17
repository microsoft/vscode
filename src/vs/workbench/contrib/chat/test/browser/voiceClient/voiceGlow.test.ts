/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeVoiceGlowStyle, readIdleVoiceGlowIntensity } from '../../../browser/voiceClient/voiceGlow.js';

suite('VoiceGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders a subtle white glow for connected idle voice mode', () => {
		const idleStyle = computeVoiceGlowStyle('idle', 0.4, false);
		assert.deepStrictEqual(
			{
				borderColor: idleStyle.borderColor.replace('0.23199999999999998', '0.232'),
				boxShadow: idleStyle.boxShadow,
			},
			{
				borderColor: 'rgba(255,255,255,0.232)',
				boxShadow: '0 0 9px rgba(255,255,255,0.136), inset 0 0 3.15px rgba(255,255,255,0.068)'
			}
		);
	});

	test('breathes the idle glow intensity over time', () => {
		assert.deepStrictEqual(
			[0, 300 * Math.PI, 900 * Math.PI].map(timestamp => Number(readIdleVoiceGlowIntensity(timestamp).toFixed(3))),
			[0.3, 0.4, 0.2]
		);
	});
});
