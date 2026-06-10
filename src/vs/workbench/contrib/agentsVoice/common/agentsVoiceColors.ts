/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';

export const voiceCodeSpeakingForeground = registerColor('voiceCode.speakingForeground',
	{ dark: '#a371f7', light: '#8250df', hcDark: '#d2a8ff', hcLight: '#6639ba' },
	localize('voiceCode.speakingForeground', "Color for the speaking/active voice state indicator")
);

export const voiceCodeSpeakingBackground = registerColor('voiceCode.speakingBackground',
	{ dark: '#a371f714', light: '#8250df14', hcDark: '#d2a8ff14', hcLight: '#6639ba14' },
	localize('voiceCode.speakingBackground', "Background color for the speaking voice state row highlight")
);
