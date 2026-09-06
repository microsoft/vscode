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
import { AGENTS_FLOATING_PANEL_GAP } from './layoutConstants.js';

// ============================================================================
// Agents window — layout
// ============================================================================

/** Gap between floating panels in the Agents window. */
export const agentsLayoutFloatingPanelGap = registerSize(
	'agents.layout.floatingPanelGap',
	sizeForAllThemes(AGENTS_FLOATING_PANEL_GAP, 'px'),
	localize('agents.layout.floatingPanelGap', "Gap between floating panels in the Agents window.")
);
// ============================================================================
// Agents window — deprecated font ramp
// ============================================================================

/** @deprecated Use `fontSize.heading1` instead. */
export const agentsFontSizeHeading1 = registerSize(
	'agents.fontSize.heading1',
	sizeForAllThemes(26, 'px'),
	localize('agents.fontSize.heading1', "Heading 1 font size for the agents window (welcome screen title)."),
	localize('agents.fontSize.heading1.deprecated', "Deprecated: use `fontSize.heading1` instead.")
);

/** @deprecated Use `fontSize.heading2` instead. */
export const agentsFontSizeHeading2 = registerSize(
	'agents.fontSize.heading2',
	sizeForAllThemes(18, 'px'),
	localize('agents.fontSize.heading2', "Heading 2 font size for the agents window (title)."),
	localize('agents.fontSize.heading2.deprecated', "Deprecated: use `fontSize.heading2` instead.")
);

/** @deprecated Use `fontSize.heading3` instead. */
export const agentsFontSizeHeading3 = registerSize(
	'agents.fontSize.heading3',
	sizeForAllThemes(13, 'px'),
	localize('agents.fontSize.heading3', "Heading 3 font size for the agents window (subtitle)."),
	localize('agents.fontSize.heading3.deprecated', "Deprecated: use `fontSize.heading3` instead.")
);

/** @deprecated Use `fontSize.body1` instead. */
export const agentsFontSizeBody1 = registerSize(
	'agents.fontSize.body1',
	sizeForAllThemes(13, 'px'),
	localize('agents.fontSize.body1', "Primary body font size for the agents window."),
	localize('agents.fontSize.body1.deprecated', "Deprecated: use `fontSize.body1` instead.")
);

/** @deprecated Use `fontSize.body2` instead. */
export const agentsFontSizeBody2 = registerSize(
	'agents.fontSize.body2',
	sizeForAllThemes(11, 'px'),
	localize('agents.fontSize.body2', "Secondary body font size for the agents window."),
	localize('agents.fontSize.body2.deprecated', "Deprecated: use `fontSize.body2` instead.")
);

/** @deprecated Use `fontSize.label1` instead. */
export const agentsFontSizeLabel1 = registerSize(
	'agents.fontSize.label1',
	sizeForAllThemes(12, 'px'),
	localize('agents.fontSize.label1', "Label 1 font size for the agents window (section title, tabs)."),
	localize('agents.fontSize.label1.deprecated', "Deprecated: use `fontSize.label1` instead.")
);

/** @deprecated Use `fontSize.label2` instead. */
export const agentsFontSizeLabel2 = registerSize(
	'agents.fontSize.label2',
	sizeForAllThemes(11, 'px'),
	localize('agents.fontSize.label2', "Label 2 font size for the agents window (metadata)."),
	localize('agents.fontSize.label2.deprecated', "Deprecated: use `fontSize.label2` instead.")
);

/** @deprecated Use `fontSize.label3` instead. */
export const agentsFontSizeLabel3 = registerSize(
	'agents.fontSize.label3',
	sizeForAllThemes(10, 'px'),
	localize('agents.fontSize.label3', "Label 3 font size for the agents window (badge)."),
	localize('agents.fontSize.label3.deprecated', "Deprecated: use `fontSize.label3` instead.")
);

// ============================================================================
// Agents window — deprecated font weights
// ============================================================================

/** @deprecated Use `fontWeight.regular` instead. */
export const agentsFontWeightRegular = registerSize(
	'agents.fontWeight.regular',
	sizeForAllThemes(400, ''),
	localize('agents.fontWeight.regular', "Regular font weight (400) for the agents window."),
	localize('agents.fontWeight.regular.deprecated', "Deprecated: use `fontWeight.regular` instead.")
);

/** @deprecated Use `fontWeight.semiBold` instead. */
export const agentsFontWeightSemiBold = registerSize(
	'agents.fontWeight.semiBold',
	sizeForAllThemes(600, ''),
	localize('agents.fontWeight.semiBold', "SemiBold font weight (600) for the agents window."),
	localize('agents.fontWeight.semiBold.deprecated', "Deprecated: use `fontWeight.semiBold` instead.")
);
