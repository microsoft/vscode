/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Agent-sessions color tokens.
//
// Registrations live here in the sessions layer. The workbench entry point
// (`workbench.common.main.ts`) imports this file as a side-effect so the
// tokens are present in the global color registry and JSON theme schema
// for both the main workbench and the sessions workbench.

import { localize } from '../../nls.js';
import { registerColor, transparent } from '../../platform/theme/common/colorUtils.js';
import { contrastBorder, focusBorder } from '../../platform/theme/common/colorRegistry.js';
import { editorWidgetBorder, editorBackground, toolbarHoverBackground } from '../../platform/theme/common/colors/editorColors.js';
import { buttonBackground, buttonBorder, inputBackground, inputBorder, inputForeground, inputPlaceholderForeground } from '../../platform/theme/common/colors/inputColors.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, PANEL_BORDER, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from '../../workbench/common/theme.js';

// ============================================================================
// Shell background (used by the gradient system)
// ============================================================================

export const agentsBackground = registerColor(
	'agents.background',
	{ dark: editorBackground, light: SIDE_BAR_BACKGROUND, hcDark: editorBackground, hcLight: editorBackground },
	localize('agents.background', 'Background color of the agent sessions window shell and gradient base.')
);

// ============================================================================
// Panels (chat panel, auxiliary bar, terminal panel)
// ============================================================================

export const agentsPanelBackground = registerColor(
	'agentsPanel.background',
	{ dark: SIDE_BAR_BACKGROUND, light: editorBackground, hcDark: SIDE_BAR_BACKGROUND, hcLight: SIDE_BAR_BACKGROUND },
	localize('agentsPanel.background', 'Background color of the card panels (chat, files, terminal) in the agent sessions window.')
);

export const agentsPanelForeground = registerColor(
	'agentsPanel.foreground', SIDE_BAR_FOREGROUND,
	localize('agentsPanel.foreground', 'Foreground color of the card panels (chat, files, terminal) in the agent sessions window.')
);

export const agentsPanelBorder = registerColor(
	'agentsPanel.border',
	{ dark: PANEL_BORDER, light: editorWidgetBorder, hcDark: contrastBorder, hcLight: contrastBorder },
	localize('agentsPanel.border', 'Border color of the card panels (chat, files, terminal) in the agent sessions window.')
);

// ============================================================================
// Gradient background tint
// ============================================================================

export const agentsGradientTintColor = registerColor(
	'agentsGradient.tintColor', buttonBackground,
	localize('agentsGradient.tintColor', 'Tint color used in the background gradient of the agent sessions window shell.')
);

// ============================================================================
// Agent feedback input widget
// ============================================================================

export const agentFeedbackInputWidgetBorder = registerColor(
	'agentFeedbackInputWidget.border',
	{ dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: contrastBorder, hcLight: contrastBorder },
	localize('agentFeedbackInputWidget.border', 'Border color of the agent feedback input widget shown in the editor.')
);

// ============================================================================
// Update button
// ============================================================================

export const agentsUpdateButtonDownloadingBackground = registerColor(
	'agentsUpdateButton.downloadingBackground', transparent(buttonBackground, 0.4),
	localize('agentsUpdateButton.downloadingBackground', 'Background color of the update button to show download progress in the agent sessions window.')
);

export const agentsUpdateButtonDownloadedBackground = registerColor(
	'agentsUpdateButton.downloadedBackground', transparent(buttonBackground, 0.7),
	localize('agentsUpdateButton.downloadedBackground', 'Background color of the update button when download is complete in the agent sessions window.')
);

// ============================================================================
// Chat input
// ============================================================================

export const agentsChatInputBackground = registerColor(
	'agentsChatInput.background', inputBackground,
	localize('agentsChatInput.background', 'Background color of the chat input field in the agent sessions window.')
);

export const agentsChatInputForeground = registerColor(
	'agentsChatInput.foreground', inputForeground,
	localize('agentsChatInput.foreground', 'Foreground color of the chat input field in the agent sessions window.')
);

export const agentsChatInputBorder = registerColor(
	'agentsChatInput.border', inputBorder,
	localize('agentsChatInput.border', 'Border color of the chat input field in the agent sessions window.')
);

export const agentsChatInputFocusBorder = registerColor(
	'agentsChatInput.focusBorder', focusBorder,
	localize('agentsChatInput.focusBorder', 'Border color of the chat input field when focused in the agent sessions window.')
);

export const agentsChatInputPlaceholderForeground = registerColor(
	'agentsChatInput.placeholderForeground', inputPlaceholderForeground,
	localize('agentsChatInput.placeholderForeground', 'Placeholder text color in the chat input field in the agent sessions window.')
);

// ============================================================================
// New session button
// ============================================================================

export const agentsNewSessionButtonBackground = registerColor(
	'agentsNewSessionButton.background', '#00000000',
	localize('agentsNewSessionButton.background', 'Background color of the New Session button in the agent sessions sidebar.')
);

export const agentsNewSessionButtonForeground = registerColor(
	'agentsNewSessionButton.foreground', SIDE_BAR_FOREGROUND,
	localize('agentsNewSessionButton.foreground', 'Foreground color of the New Session button in the agent sessions sidebar.')
);

export const agentsNewSessionButtonBorder = registerColor(
	'agentsNewSessionButton.border', buttonBorder,
	localize('agentsNewSessionButton.border', 'Border color of the New Session button in the agent sessions sidebar.')
);

export const agentsNewSessionButtonHoverBackground = registerColor(
	'agentsNewSessionButton.hoverBackground', toolbarHoverBackground,
	localize('agentsNewSessionButton.hoverBackground', 'Background color of the New Session button when hovered in the agent sessions sidebar.')
);

// ============================================================================
// Badge
// ============================================================================

export const agentsBadgeBackground = registerColor(
	'agentsBadge.background', ACTIVITY_BAR_BADGE_BACKGROUND,
	localize('agentsBadge.background', 'Background color of badges in the agent sessions window.')
);

export const agentsBadgeForeground = registerColor(
	'agentsBadge.foreground', ACTIVITY_BAR_BADGE_FOREGROUND,
	localize('agentsBadge.foreground', 'Foreground color of badges in the agent sessions window.')
);

// ============================================================================
// Unread session indicator
// ============================================================================

export const agentsUnreadBadgeBackground = registerColor(
	'agentsUnreadBadge.background', ACTIVITY_BAR_BADGE_BACKGROUND,
	localize('agentsUnreadBadge.background', 'Background color of the unread sessions count badge on the sidebar toggle.')
);

export const agentsUnreadBadgeForeground = registerColor(
	'agentsUnreadBadge.foreground', ACTIVITY_BAR_BADGE_FOREGROUND,
	localize('agentsUnreadBadge.foreground', 'Foreground color of the unread sessions count badge on the sidebar toggle.')
);
