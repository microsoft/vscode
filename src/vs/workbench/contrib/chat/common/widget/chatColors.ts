/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from '../../../../../base/common/color.js';
import { localize } from '../../../../../nls.js';
import { badgeBackground, badgeForeground, contrastBorder, editorBackground, editorSelectionBackground, editorWidgetBackground, focusBorder, foreground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { editorFindMatchHighlight } from '../../../../../platform/theme/common/colors/editorColors.js';
import { buttonBackground } from '../../../../../platform/theme/common/colors/inputColors.js';
import { darken, lighten } from '../../../../../platform/theme/common/colorUtils.js';
import { COMMAND_CENTER_BACKGROUND } from '../../../../common/theme.js';

// This color inherits its default value from commandCenter.background but is registered
// separately so that it doesn't get overridden when debugging (the debug toolbar overrides
// commandCenter.background). This allows themes to customize it while maintaining
// independence from debug mode changes.
export const agentStatusIndicatorBackground = registerColor(
	'agentStatusIndicator.background',
	COMMAND_CENTER_BACKGROUND,
	localize('agentStatusIndicator.background', 'Background color of the agent status indicator in the titlebar.')
);

export const chatRequestBorder = registerColor(
	'chat.requestBorder',
	{ dark: new Color(new RGBA(255, 255, 255, 0.10)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: contrastBorder, hcLight: contrastBorder, },
	localize('chat.requestBorder', 'The border color of a chat request.')
);

export const chatRequestBackground = registerColor(
	'chat.requestBackground',
	{ dark: transparent(editorBackground, 0.62), light: transparent(editorBackground, 0.62), hcDark: editorWidgetBackground, hcLight: null },
	localize('chat.requestBackground', 'The background color of a chat request.')
);

export const chatSlashCommandBackground = registerColor(
	'chat.slashCommandBackground',
	{ dark: '#26477866', light: '#adceff7a', hcDark: Color.white, hcLight: badgeBackground },
	localize('chat.slashCommandBackground', 'The background color of a chat slash command.')
);

export const chatSlashCommandForeground = registerColor(
	'chat.slashCommandForeground',
	{ dark: '#85b6ff', light: '#26569e', hcDark: Color.black, hcLight: badgeForeground },
	localize('chat.slashCommandForeground', 'The foreground color of a chat slash command.')
);

export const chatAvatarBackground = registerColor(
	'chat.avatarBackground',
	{ dark: '#1f1f1f', light: '#f2f2f2', hcDark: Color.black, hcLight: Color.white, },
	localize('chat.avatarBackground', 'The background color of a chat avatar.')
);

export const chatAvatarForeground = registerColor(
	'chat.avatarForeground',
	foreground,
	localize('chat.avatarForeground', 'The foreground color of a chat avatar.')
);

export const chatEditedFileForeground = registerColor(
	'chat.editedFileForeground',
	{
		light: '#895503',
		dark: '#E2C08D',
		hcDark: '#E2C08D',
		hcLight: '#895503'
	},
	localize('chat.editedFileForeground', 'The foreground color of a chat edited file in the edited file list.')
);

export const chatRequestCodeBorder = registerColor('chat.requestCodeBorder', { dark: '#004972B8', light: '#0e639c40', hcDark: null, hcLight: null }, localize('chat.requestCodeBorder', 'Border color of code blocks within the chat request bubble.'), true);

export const chatRequestBubbleBackground = registerColor('chat.requestBubbleBackground', { light: transparent(editorSelectionBackground, 0.3), dark: transparent(editorSelectionBackground, 0.3), hcDark: null, hcLight: null }, localize('chat.requestBubbleBackground', "Background color of the chat request bubble."), true);

export const chatRequestBubbleHoverBackground = registerColor('chat.requestBubbleHoverBackground', { dark: transparent(editorSelectionBackground, 0.6), light: transparent(editorSelectionBackground, 0.6), hcDark: null, hcLight: null }, localize('chat.requestBubbleHoverBackground', 'Background color of the chat request bubble on hover.'), true);

export const chatCheckpointSeparator = registerColor('chat.checkpointSeparator',
	{ dark: '#585858', light: '#a9a9a9', hcDark: '#a9a9a9', hcLight: '#a5a5a5' },
	localize('chatCheckpointSeparator', "Chat checkpoint separator color."));

export const chatLinesAddedForeground = registerColor(
	'chat.linesAddedForeground',
	{ dark: '#54B054', light: '#107C10', hcDark: '#54B054', hcLight: '#107C10' },
	localize('chat.linesAddedForeground', 'Foreground color of lines added in chat code block pill.'), true);

export const chatLinesRemovedForeground = registerColor(
	'chat.linesRemovedForeground',
	{ dark: '#FC6A6A', light: '#BC2F32', hcDark: '#F48771', hcLight: '#B5200D' },
	localize('chat.linesRemovedForeground', 'Foreground color of lines removed in chat code block pill.'), true);

export const chatFindMatchHighlightBackground = registerColor(
	'chat.findMatchHighlightBackground',
	{ dark: editorFindMatchHighlight, light: editorFindMatchHighlight, hcDark: '#EA5C0055', hcLight: '#EA5C0055' },
	localize('chat.findMatchHighlightBackground', 'Background color of the other search matches in a chat transcript. The color must not be opaque so as not to hide underlying content.'), true);

export const chatFindMatchBackground = registerColor(
	'chat.findMatchBackground',
	{ dark: transparent(chatFindMatchHighlightBackground, 2), light: transparent(chatFindMatchHighlightBackground, 2), hcDark: '#EA5C00AA', hcLight: '#EA5C00AA' },
	localize('chat.findMatchBackground', 'Background color of the current search match in a chat transcript.'), true);

export const chatThinkingShimmer = registerColor(
	'chat.thinkingShimmer',
	{ dark: '#ffffff', light: '#000000', hcDark: '#ffffff', hcLight: '#000000' },
	localize('chat.thinkingShimmer', 'Shimmer highlight for thinking/working labels.'), true);

export const chatInputWorkingBorderColor1 = registerColor(
	'chat.inputWorkingBorderColor1',
	{ dark: buttonBackground, light: buttonBackground, hcDark: '#FFFFFF', hcLight: '#000000' },
	localize('chat.inputWorkingBorderColor1', 'First color stop of the animated chat input border shown while a request is in flight.'), true);

export const chatInputWorkingBorderColor2 = registerColor(
	'chat.inputWorkingBorderColor2',
	{ dark: darken(buttonBackground, 0.5), light: darken(buttonBackground, 0.3), hcDark: '#A0A0A0', hcLight: '#555555' },
	localize('chat.inputWorkingBorderColor2', 'Secondary accent color used by other animated chat input affordances. Not used by the in-flight chat input border.'), true);

export const chatInputWorkingBorderColor3 = registerColor(
	'chat.inputWorkingBorderColor3',
	{ dark: lighten(buttonBackground, 0.5), light: lighten(buttonBackground, 0.3), hcDark: '#000000', hcLight: '#000000' },
	localize('chat.inputWorkingBorderColor3', 'Tertiary accent color used by other animated chat input affordances. Not used by the in-flight chat input border.'), true);

// --- Voice Mode ambient glow -------------------------------------------------
// The listening / processing / speaking glows are derived from a single base
// accent by hue-shifting (see `resolveVoiceGlowColors` in `voiceGlow.ts`), so the
// glow harmonizes with whatever accent the active theme uses. Themes can pin any
// individual state by setting its own token.

export const chatVoiceGlowBaseColor = registerColor(
	'chat.voiceGlowBaseColor',
	focusBorder,
	localize('chat.voiceGlowBaseColor', 'Base accent the Voice Mode ambient glow is derived from. The listening and speaking glows are hue-shifted from this color.'), true);

export const chatVoiceListeningGlow = registerColor(
	'chat.voiceListeningGlow',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	localize('chat.voiceListeningGlow', 'Accent color of the Voice Mode glow while listening. Derived from {0} when unset.', 'chat.voiceGlowBaseColor'), true);

export const chatVoiceSpeakingGlow = registerColor(
	'chat.voiceSpeakingGlow',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	localize('chat.voiceSpeakingGlow', 'Accent color of the Voice Mode glow while the agent is speaking. Derived from {0} when unset.', 'chat.voiceGlowBaseColor'), true);

// Dictation shares Voice Mode's listening accent, so an open microphone reads the
// same whichever feature opened it.
export const chatDictationActiveMicGlow = registerColor(
	'chat.dictationActiveMicGlow',
	chatVoiceGlowBaseColor,
	localize('chat.dictationActiveMicGlow', 'Accent color of the glow shown on the microphone while dictation is listening.'));
