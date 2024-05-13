/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const INTERACTIVE_INPUT_CURSOR_BOUNDARY = new RawContextKey<'none' | 'top' | 'bottom' | 'both'>('interactiveInputCursorAtBoundary', 'none');

export const InteractiveWindowSetting = {
	interactiveWindowAlwaysScrollOnNewCell: 'interactiveWindow.alwaysScrollOnNewCell'
};
