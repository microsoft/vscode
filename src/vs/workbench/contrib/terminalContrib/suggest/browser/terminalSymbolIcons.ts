/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/terminalSymbolIcons.css';
import { SYMBOL_ICON_ENUMERATOR_FOREGROUND, SYMBOL_ICON_METHOD_FOREGROUND } from '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';
import { registerColor } from '../../../../../platform/theme/common/colorUtils.js';
import { localize } from '../../../../../nls.js';

export const TERMINAL_SYMBOL_ICON_FLAG_FOREGROUND = registerColor('terminalSymbolIcon.flagForeground', SYMBOL_ICON_ENUMERATOR_FOREGROUND, localize('terminalSymbolIcon.flagForeground', 'The foreground color for an flag icon. These icons will appear in the terminal suggest widget.'));

export const TERMINAL_SYMBOL_ICON_ALIAS_FOREGROUND = registerColor('terminalSymbolIcon.aliasForeground', SYMBOL_ICON_METHOD_FOREGROUND, localize('terminalSymbolIcon.aliasForeground', 'The foreground color for an alias icon. These icons will appear in the terminal suggest widget.'));
