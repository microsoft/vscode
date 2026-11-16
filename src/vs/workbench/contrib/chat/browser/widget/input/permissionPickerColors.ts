/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { problemsWarningIconForeground, registerColor } from '../../../../../../platform/theme/common/colorRegistry.js';

// The problems warning icon color is tuned for icons: on light backgrounds it is too light for text.
export const chatPermissionPickerWarningForeground = registerColor(
	'chat.permissionPickerWarningForeground',
	{ dark: problemsWarningIconForeground, light: '#895503', hcDark: problemsWarningIconForeground, hcLight: problemsWarningIconForeground },
	localize('chat.permissionPickerWarningForeground', "Foreground color of the permissions picker in chat when Assisted permissions or Autopilot is selected."));
