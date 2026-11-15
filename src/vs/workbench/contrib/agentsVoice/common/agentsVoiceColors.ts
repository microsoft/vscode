/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { chartsBlue } from '../../../../platform/theme/common/colors/chartsColors.js';
import { localize } from '../../../../nls.js';

export const agentsVoiceSpeakingForeground = registerColor('agentsVoice.speakingForeground',
	chartsBlue,
	localize('agentsVoice.speakingForeground', "Color for the speaking/active voice state indicator")
);

export const agentsVoiceSpeakingBackground = registerColor('agentsVoice.speakingBackground',
	transparent(agentsVoiceSpeakingForeground, 0.08),
	localize('agentsVoice.speakingBackground', "Background color for the speaking voice state row highlight")
);
