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
				borderColor: idleStyle.borderColor,
				boxShadow: idleStyle.boxShadow.replace('12.600000000000001', '12.6'),
			},
			{
				borderColor: 'rgba(255,255,255,0.42)',
				boxShadow: '0 0 12.6px rgba(255,255,255,0.248), inset 0 0 4.41px rgba(255,255,255,0.124)'
			}
		);
	});

	test('breathes the idle glow intensity over time', () => {
		assert.deepStrictEqual(
			[0, 300 * Math.PI, 900 * Math.PI].map(timestamp => Number(readIdleVoiceGlowIntensity(timestamp).toFixed(3))),
			[0.4, 0.55, 0.25]
		);
	});
});
