/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { registerColor } from '../../../../../platform/theme/common/colorRegistry.js';

export const mcpCompatibilityWarningForeground = registerColor(
	'chat.mcpCompatibilityWarningForeground',
	{ dark: '#CCA700', light: '#8A6200', hcDark: '#FFFF00', hcLight: '#6F4E00' },
	localize('mcpCompatibilityWarningForeground', "Foreground color for MCP server compatibility warnings."),
);
