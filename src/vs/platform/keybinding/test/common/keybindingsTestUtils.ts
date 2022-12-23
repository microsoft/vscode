/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createKeybinding, ResolvedKeybinding } from 'vs/base/common/keybindings';
import { OperatingSystem } from 'vs/base/common/platform';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';

export function createUSLayoutResolvedKeybinding(keybinding: number, OS: OperatingSystem): ResolvedKeybinding | undefined {
	if (keybinding === 0) {
		return undefined;
	}
	const userbinding = createKeybinding(keybinding, OS);
	if (!userbinding) {
		return undefined;
	}
	const result = USLayoutResolvedKeybinding.resolveUserBinding(userbinding, OS);
	if (result.length > 0) {
		return result[0];
	}
	return undefined;
}
