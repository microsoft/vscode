/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeKeybinding, ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { USLayoutResolvedKeybinding } from '../../common/usLayoutResolvedKeybinding.js';

export function createUSLayoutResolvedKeybinding(encodedKeybinding: number | number[], OS: OperatingSystem): ResolvedKeybinding | undefined {
	if (encodedKeybinding === 0) {
		return undefined;
	}
	const keybinding = decodeKeybinding(encodedKeybinding, OS);
	if (!keybinding) {
		return undefined;
	}
	const result = USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
	if (result.length > 0) {
		return result[0];
	}
	return undefined;
}
