/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Agent-sessions font-ramp size tokens.
//
// Registrations live here in the sessions layer. The workbench entry point
// (`workbench.common.main.ts`) imports this file as a side-effect so the
// tokens are present in the global size registry and JSON schema for both
// the main workbench and the sessions workbench.

import { localize } from '../../nls.js';
import { registerSize, sizeForAllThemes } from '../../platform/theme/common/sizeUtils.js';

// ============================================================================
// Agents window — font ramp
// ============================================================================

/** 26 px · SemiBold (600) — Welcome screen title */
export const agentsFontSizeHeading1 = registerSize(
	'agents.fontSize.heading1',
	sizeForAllThemes(26, 'px'),
	localize('agents.fontSize.heading1', "Heading 1 font size for the agents window (welcome screen title).")
);

/** 18 px · SemiBold (600) — Title */
export const agentsFontSizeHeading2 = registerSize(
	'agents.fontSize.heading2',
	sizeForAllThemes(18, 'px'),
	localize('agents.fontSize.heading2', "Heading 2 font size for the agents window (title).")
);

/** 13 px · SemiBold (600) — Subtitle */
export const agentsFontSizeHeading3 = registerSize(
	'agents.fontSize.heading3',
	sizeForAllThemes(13, 'px'),
	localize('agents.fontSize.heading3', "Heading 3 font size for the agents window (subtitle).")
);

/** 13 px · Regular (400) — Primary body text */
export const agentsFontSizeBody1 = registerSize(
	'agents.fontSize.body1',
	sizeForAllThemes(13, 'px'),
	localize('agents.fontSize.body1', "Primary body font size for the agents window.")
);

/** 11 px · Regular (400) — Secondary body text */
export const agentsFontSizeBody2 = registerSize(
	'agents.fontSize.body2',
	sizeForAllThemes(11, 'px'),
	localize('agents.fontSize.body2', "Secondary body font size for the agents window.")
);

/** 12 px · Medium (500) — Interactive tabs */
export const agentsFontSizeLabel1 = registerSize(
	'agents.fontSize.label1',
	sizeForAllThemes(12, 'px'),
	localize('agents.fontSize.label1', "Label 1 font size for the agents window (interactive tabs).")
);

/** 11 px · Medium (500) — Metadata emphasis */
export const agentsFontSizeLabel2 = registerSize(
	'agents.fontSize.label2',
	sizeForAllThemes(11, 'px'),
	localize('agents.fontSize.label2', "Label 2 font size for the agents window (metadata emphasis).")
);

/** 11 px · Regular (400) — Metadata primary */
export const agentsFontSizeLabel3 = registerSize(
	'agents.fontSize.label3',
	sizeForAllThemes(11, 'px'),
	localize('agents.fontSize.label3', "Label 3 font size for the agents window (metadata primary).")
);

/** 10 px · Regular (400) — Badge */
export const agentsFontSizeLabel4 = registerSize(
	'agents.fontSize.label4',
	sizeForAllThemes(10, 'px'),
	localize('agents.fontSize.label4', "Label 4 font size for the agents window (badge).")
);

// ============================================================================
// Agents window — font weights
// ============================================================================

/** Regular — 400 */
export const agentsFontWeightRegular = registerSize(
	'agents.fontWeight.regular',
	sizeForAllThemes(400, ''),
	localize('agents.fontWeight.regular', "Regular font weight (400) for the agents window.")
);

/** Medium — 500 */
export const agentsFontWeightMedium = registerSize(
	'agents.fontWeight.medium',
	sizeForAllThemes(500, ''),
	localize('agents.fontWeight.medium', "Medium font weight (500) for the agents window.")
);

/** SemiBold — 600 */
export const agentsFontWeightSemiBold = registerSize(
	'agents.fontWeight.semiBold',
	sizeForAllThemes(600, ''),
	localize('agents.fontWeight.semiBold', "SemiBold font weight (600) for the agents window.")
);
