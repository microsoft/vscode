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
import { registerSize, SizeDefaults, sizeForAllThemes } from '../../platform/theme/common/sizeUtils.js';

// ============================================================================
// Font ramp — values
// ============================================================================
// Single source of truth for the ramp. Both the generic `fontSize.*` tokens
// and the deprecated `agents.fontSize.*` aliases register against these.

const fontSizeHeading1Value = sizeForAllThemes(26, 'px');  // SemiBold (600) — Welcome screen title
const fontSizeHeading2Value = sizeForAllThemes(18, 'px');  // SemiBold (600) — Title
const fontSizeHeading3Value = sizeForAllThemes(13, 'px');  // SemiBold (600) — Subtitle
const fontSizeBody1Value = sizeForAllThemes(13, 'px');     // Regular (400) — Primary body text
const fontSizeBody2Value = sizeForAllThemes(11, 'px');     // Regular (400) — Secondary body text
const fontSizeLabel1Value = sizeForAllThemes(12, 'px');    // Medium (500) — Interactive labels / tabs
const fontSizeLabel2Value = sizeForAllThemes(11, 'px');    // Medium (500) — Metadata emphasis
const fontSizeLabel3Value = sizeForAllThemes(11, 'px');    // Regular (400) — Metadata primary
const fontSizeLabel4Value = sizeForAllThemes(10, 'px');    // Regular (400) — Badge

const fontWeightRegularValue = sizeForAllThemes(400, '');
const fontWeightMediumValue = sizeForAllThemes(500, '');
const fontWeightSemiBoldValue = sizeForAllThemes(600, '');

// ============================================================================
// Font ramp — generic (canonical) tokens
// ============================================================================

/** 26 px · SemiBold (600) — Welcome screen title */
export const fontSizeHeading1 = registerSize(
	'fontSize.heading1',
	fontSizeHeading1Value,
	localize('fontSize.heading1', "Heading 1 font size (welcome screen title).")
);

/** 18 px · SemiBold (600) — Title */
export const fontSizeHeading2 = registerSize(
	'fontSize.heading2',
	fontSizeHeading2Value,
	localize('fontSize.heading2', "Heading 2 font size (title).")
);

/** 13 px · SemiBold (600) — Subtitle */
export const fontSizeHeading3 = registerSize(
	'fontSize.heading3',
	fontSizeHeading3Value,
	localize('fontSize.heading3', "Heading 3 font size (subtitle).")
);

/** 13 px · Regular (400) — Primary body text */
export const fontSizeBody1 = registerSize(
	'fontSize.body1',
	fontSizeBody1Value,
	localize('fontSize.body1', "Primary body font size.")
);

/** 11 px · Regular (400) — Secondary body text */
export const fontSizeBody2 = registerSize(
	'fontSize.body2',
	fontSizeBody2Value,
	localize('fontSize.body2', "Secondary body font size.")
);

/** 12 px · Medium (500) — Interactive labels / tabs */
export const fontSizeLabel1 = registerSize(
	'fontSize.label1',
	fontSizeLabel1Value,
	localize('fontSize.label1', "Label 1 font size (interactive labels / tabs).")
);

/** 11 px · Medium (500) — Metadata emphasis */
export const fontSizeLabel2 = registerSize(
	'fontSize.label2',
	fontSizeLabel2Value,
	localize('fontSize.label2', "Label 2 font size (metadata emphasis).")
);

/** 11 px · Regular (400) — Metadata primary */
export const fontSizeLabel3 = registerSize(
	'fontSize.label3',
	fontSizeLabel3Value,
	localize('fontSize.label3', "Label 3 font size (metadata primary).")
);

/** 10 px · Regular (400) — Badge */
export const fontSizeLabel4 = registerSize(
	'fontSize.label4',
	fontSizeLabel4Value,
	localize('fontSize.label4', "Label 4 font size (badge).")
);

/** Regular — 400 */
export const fontWeightRegular = registerSize(
	'fontWeight.regular',
	fontWeightRegularValue,
	localize('fontWeight.regular', "Regular font weight (400).")
);

/** Medium — 500 */
export const fontWeightMedium = registerSize(
	'fontWeight.medium',
	fontWeightMediumValue,
	localize('fontWeight.medium', "Medium font weight (500).")
);

/** SemiBold — 600 */
export const fontWeightSemiBold = registerSize(
	'fontWeight.semiBold',
	fontWeightSemiBoldValue,
	localize('fontWeight.semiBold', "SemiBold font weight (600).")
);

// ============================================================================
// Agents window — deprecated aliases
// ============================================================================
// Retained so existing `--vscode-agents-fontSize-*` / `--vscode-agents-fontWeight-*`
// consumers keep working. New code should use the generic `fontSize.*` /
// `fontWeight.*` tokens above.

function registerAgentsAlias(id: string, value: SizeDefaults, genericId: string): void {
	registerSize(
		id,
		value,
		localize('agents.alias', "Deprecated alias of `{0}`.", genericId),
		localize('agents.aliasDeprecation', "Deprecated. Use `{0}` instead.", genericId)
	);
}

registerAgentsAlias('agents.fontSize.heading1', fontSizeHeading1Value, 'fontSize.heading1');
registerAgentsAlias('agents.fontSize.heading2', fontSizeHeading2Value, 'fontSize.heading2');
registerAgentsAlias('agents.fontSize.heading3', fontSizeHeading3Value, 'fontSize.heading3');
registerAgentsAlias('agents.fontSize.body1', fontSizeBody1Value, 'fontSize.body1');
registerAgentsAlias('agents.fontSize.body2', fontSizeBody2Value, 'fontSize.body2');
registerAgentsAlias('agents.fontSize.label1', fontSizeLabel1Value, 'fontSize.label1');
registerAgentsAlias('agents.fontSize.label2', fontSizeLabel2Value, 'fontSize.label2');
registerAgentsAlias('agents.fontSize.label3', fontSizeLabel3Value, 'fontSize.label3');
registerAgentsAlias('agents.fontSize.label4', fontSizeLabel4Value, 'fontSize.label4');
registerAgentsAlias('agents.fontWeight.regular', fontWeightRegularValue, 'fontWeight.regular');
registerAgentsAlias('agents.fontWeight.medium', fontWeightMediumValue, 'fontWeight.medium');
registerAgentsAlias('agents.fontWeight.semiBold', fontWeightSemiBoldValue, 'fontWeight.semiBold');
