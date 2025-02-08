/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const INTERACTIVE_INPUT_CURSOR_BOUNDARY = new RawContextKey<'none' | 'top' | 'bottom' | 'both'>('interactiveInputCursorAtBoundary', 'none');

export const ReplEditorSettings = {
	interactiveWindowAlwaysScrollOnNewCell: 'interactiveWindow.alwaysScrollOnNewCell',
	executeWithShiftEnter: 'interactiveWindow.executeWithShiftEnter',
	showExecutionHint: 'interactiveWindow.showExecutionHint',
};
