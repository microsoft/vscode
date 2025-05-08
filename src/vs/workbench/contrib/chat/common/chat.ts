/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMode } from './constants.js';

export function checkModeOption(mode: ChatMode, option: boolean | ((mode: ChatMode) => boolean) | undefined): boolean | undefined {
	if (option === undefined) {
		return undefined;
	}
	if (typeof option === 'function') {
		return option(mode);
	}
	return option;
}
