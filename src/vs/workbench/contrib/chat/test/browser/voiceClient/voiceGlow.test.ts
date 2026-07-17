/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeVoiceGlowStyle, readIdleVoiceGlowIntensity } from '../../../browser/voiceClient/voiceGlow.js';

suite('VoiceGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders a themed subtle glow for connected idle voice mode', () => {
		const idleStyle = computeVoiceGlowStyle('idle', 0.4, false);
		assert.deepStrictEqual(
			{
				borderColor: idleStyle.borderColor,
				boxShadow: idleStyle.boxShadow.replace('12.600000000000001', '12.6'),
			},
			{
				borderColor: 'color-mix(in srgb, var(--vscode-foreground) 42%, transparent)',
				boxShadow: '0 0 12.6px color-mix(in srgb, var(--vscode-foreground) 24.8%, transparent), inset 0 0 4.41px color-mix(in srgb, var(--vscode-foreground) 12.4%, transparent)'
			}
		);
	});

	test('breathes the idle glow intensity over time', () => {
		assert.deepStrictEqual(
			[0, 300 * Math.PI, 900 * Math.PI].map(timestamp => Number(readIdleVoiceGlowIntensity(timestamp).toFixed(3))),
			[0.4, 0.55, 0.25]
		);
	});

	test('renders a static idle glow midpoint when motion is reduced', () => {
		assert.deepStrictEqual(
			[0, 300 * Math.PI, 900 * Math.PI].map(timestamp => readIdleVoiceGlowIntensity(timestamp, true)),
			[0.4, 0.4, 0.4]
		);
	});
});
