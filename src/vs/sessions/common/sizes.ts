/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Agent-sessions size tokens.
//
// Registrations live here in the sessions layer. The workbench entry point
// (`workbench.common.main.ts`) imports this file as a side-effect so the
// tokens are present in the global size registry and JSON schema for both
// the main workbench and the sessions workbench.

import { localize } from '../../nls.js';
import { registerSize, sizeForAllThemes } from '../../platform/theme/common/sizeUtils.js';

// ============================================================================
// Agents window — layout
// ============================================================================

export const AGENTS_FLOATING_PANEL_GAP = 5;

/** Gap between floating panels in the Agents window. */
export const agentsLayoutFloatingPanelGap = registerSize(
	'agents.layout.floatingPanelGap',
	sizeForAllThemes(AGENTS_FLOATING_PANEL_GAP, 'px'),
	localize('agents.layout.floatingPanelGap', "Gap between floating panels in the Agents window.")
);

// ============================================================================
// Agents window — font ramp
// ============================================================================
//
// "Strong" variants in the design (e.g. "Body 1 Strong", "Label 2 Strong") are
// NOT separate size tokens: they reuse the matching size token paired with
// `agents.fontWeight.semiBold` (600). Regular text pairs with
// `agents.fontWeight.regular` (400). The ramp defines only these two weights.

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

/** 12 px · Regular (400) — Section title, tabs */
export const agentsFontSizeLabel1 = registerSize(
	'agents.fontSize.label1',
	sizeForAllThemes(12, 'px'),
	localize('agents.fontSize.label1', "Label 1 font size for the agents window (section title, tabs).")
);

/** 11 px · Regular (400) — Metadata */
export const agentsFontSizeLabel2 = registerSize(
	'agents.fontSize.label2',
	sizeForAllThemes(11, 'px'),
	localize('agents.fontSize.label2', "Label 2 font size for the agents window (metadata).")
);

/** 10 px · Regular (400) — Badge */
export const agentsFontSizeLabel3 = registerSize(
	'agents.fontSize.label3',
	sizeForAllThemes(10, 'px'),
	localize('agents.fontSize.label3', "Label 3 font size for the agents window (badge).")
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

/** SemiBold — 600 */
export const agentsFontWeightSemiBold = registerSize(
	'agents.fontWeight.semiBold',
	sizeForAllThemes(600, ''),
	localize('agents.fontWeight.semiBold', "SemiBold font weight (600) for the agents window.")
);
