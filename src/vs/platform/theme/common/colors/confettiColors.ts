/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerColor } from '../colorUtils.js';
import { chartsBlue, chartsGreen, chartsOrange, chartsPurple, chartsRed, chartsYellow } from './chartsColors.js';

export const confettiColor1 = registerColor('confetti.color1', chartsRed,
	nls.localize('confettiColor1', "The first color used in confetti animations."));

export const confettiColor2 = registerColor('confetti.color2', chartsOrange,
	nls.localize('confettiColor2', "The second color used in confetti animations."));

export const confettiColor3 = registerColor('confetti.color3', chartsYellow,
	nls.localize('confettiColor3', "The third color used in confetti animations."));

export const confettiColor4 = registerColor('confetti.color4', chartsGreen,
	nls.localize('confettiColor4', "The fourth color used in confetti animations."));

export const confettiColor5 = registerColor('confetti.color5', chartsBlue,
	nls.localize('confettiColor5', "The fifth color used in confetti animations."));

export const confettiColor6 = registerColor('confetti.color6', chartsPurple,
	nls.localize('confettiColor6', "The sixth color used in confetti animations."));
