/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Mobile diff / changes overlay color tokens.
//
// These tokens back the phone-layout changes-list and diff overlay
// (icons, A/M/D pills, +N/-N counters, edge bars on diff rows). They
// live next to the views that consume them rather than in the global
// `vs/sessions/common/theme.ts`, since they are mobile-specific and
// have no consumers in any other layer.
//
// Why register them at all? `vs/workbench/contrib/scm` is not loaded in
// the agents window, so the `gitDecoration.*` color tokens that the
// desktop changes view relies on aren't available here. We register our
// own tokens so themes can override them, and the CSS reads them via
// `--vscode-agentsMobileDiff-*` variables. Defaults mirror the
// git-extension palette so they look the same as the rest of VS Code.
//
// The file is imported as a side-effect from the mobile diff/changes
// views, which is enough to register the tokens with the global color
// registry on startup.

import { localize } from '../../../../../nls.js';
import { registerColor } from '../../../../../platform/theme/common/colorUtils.js';

export const agentsMobileDiffAddedForeground = registerColor(
	'agentsMobileDiff.addedForeground',
	{ dark: '#81b88b', light: '#587c0c', hcDark: '#a1e3ad', hcLight: '#374e06' },
	localize('agentsMobileDiff.addedForeground', 'Foreground color used for added files / lines in the mobile changes-list and diff overlay in the agent sessions window.')
);

export const agentsMobileDiffModifiedForeground = registerColor(
	'agentsMobileDiff.modifiedForeground',
	{ dark: '#E2C08D', light: '#895503', hcDark: '#E2C08D', hcLight: '#895503' },
	localize('agentsMobileDiff.modifiedForeground', 'Foreground color used for modified files in the mobile changes-list in the agent sessions window.')
);

export const agentsMobileDiffDeletedForeground = registerColor(
	'agentsMobileDiff.deletedForeground',
	{ dark: '#c74e39', light: '#ad0707', hcDark: '#c74e39', hcLight: '#ad0707' },
	localize('agentsMobileDiff.deletedForeground', 'Foreground color used for deleted files / removed lines in the mobile changes-list and diff overlay in the agent sessions window.')
);
