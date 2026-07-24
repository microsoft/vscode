/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeVoiceGlowStyle, isGlowingVoiceState } from '../../../browser/voiceClient/voiceGlow.js';

suite('VoiceGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders a blue listening glow that intensifies with audio', () => {
		const listeningStyle = computeVoiceGlowStyle('listening', 0.5, false);
		assert.deepStrictEqual(
			{
				borderColor: listeningStyle.borderColor,
				boxShadow: listeningStyle.boxShadow,
			},
			{
				borderColor: 'rgba(88,166,255,0.4)',
				boxShadow: '0 0 4px rgba(88,166,255,0.12)'
			}
		);
	});

	test('connected-idle voice mode does not render a glow', () => {
		assert.deepStrictEqual(
			['idle', 'listening', 'speaking', 'processing', 'error'].map(isGlowingVoiceState as (s: string) => boolean),
			[false, true, true, false, false]
		);
	});
});
