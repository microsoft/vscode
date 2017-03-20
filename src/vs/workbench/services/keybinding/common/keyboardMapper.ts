/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Keybinding, ResolvedKeybinding } from 'vs/base/common/keyCodes';

export interface IKeyboardMapper {
	dumpDebugInfo(): string;
	resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[];
}
