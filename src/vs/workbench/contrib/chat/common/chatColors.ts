/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { badgeBackground, badgeForeground, foreground, registerColor } from 'vs/platform/theme/common/colorRegistry';

export const chatRequestBorder = registerColor(
	'chat.requestBorder',
	{ dark: new Color(new RGBA(255, 255, 255, 0.10)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: null, hcLight: null, },
	localize('chat.requestBorder', 'The border color of a chat request.')
);

export const chatSlashCommandBackground = registerColor(
	'chat.slashCommandBackground',
	{ dark: badgeBackground, light: badgeBackground, hcDark: Color.white, hcLight: badgeBackground },
	localize('chat.slashCommandBackground', 'The background color of a chat slash command.')
);

export const chatSlashCommandForeground = registerColor(
	'chat.slashCommandForeground',
	{ dark: badgeForeground, light: badgeForeground, hcDark: Color.black, hcLight: badgeForeground },
	localize('chat.slashCommandForeground', 'The foreground color of a chat slash command.')
);

export const chatProviderAvatarBackground = registerColor(
	'chat.providerAvatarBackground',
	{ dark: null, light: null, hcDark: null, hcLight: null, },
	localize('chat.avatarBackground', 'The background color of a chat avatar.')
);

export const chatProviderAvatarForeground = registerColor(
	'chat.providerAvatarForeground',
	{ dark: foreground, light: foreground, hcDark: foreground, hcLight: foreground, },
	localize('chat.avatarForeground', 'The foreground color of a chat avatar.')
);

export const chatAgentAvatarBackground = registerColor(
	'chat.agentAvatarBackground',
	{ dark: badgeBackground, light: badgeBackground, hcDark: badgeBackground, hcLight: badgeBackground, },
	localize('chat.avatarBackground', 'The background color of a chat avatar.')
);

export const chatAgentAvatarForeground = registerColor(
	'chat.agentAvatarForeground',
	{ dark: badgeForeground, light: badgeForeground, hcDark: badgeForeground, hcLight: badgeForeground, },
	localize('chat.avatarForeground', 'The foreground color of a chat avatar.')
);
