/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';

export const agentsVoiceSpeakingForeground = registerColor('agentsVoice.speakingForeground',
	{ dark: '#a371f7', light: '#8250df', hcDark: '#d2a8ff', hcLight: '#6639ba' },
	localize('agentsVoice.speakingForeground', "Color for the speaking/active voice state indicator")
);

export const agentsVoiceSpeakingBackground = registerColor('agentsVoice.speakingBackground',
	{ dark: '#a371f714', light: '#8250df14', hcDark: '#d2a8ff14', hcLight: '#6639ba14' },
	localize('agentsVoice.speakingBackground', "Background color for the speaking voice state row highlight")
);

/**
 * The introduction's waveform is drawn as a gradient across Voice Mode's own
 * two ambient states - the listening blue and the speaking violet - rather than
 * giving each voice its own hue. One sweep reads as a single considered
 * material; four competing colours read as a palette test.
 */
export const agentsVoiceWaveFrom = registerColor('agentsVoice.waveFrom',
	{ dark: '#58a6ff', light: '#0969da', hcDark: '#79c0ff', hcLight: '#0550ae' },
	localize('agentsVoice.waveFrom', "Start color of the Voice Mode waveform gradient.")
);

export const agentsVoiceWaveTo = registerColor('agentsVoice.waveTo',
	{ dark: '#a371f7', light: '#8250df', hcDark: '#d2a8ff', hcLight: '#6639ba' },
	localize('agentsVoice.waveTo', "End color of the Voice Mode waveform gradient.")
);
