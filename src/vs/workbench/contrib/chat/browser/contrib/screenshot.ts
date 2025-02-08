/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IChatRequestVariableEntry } from '../../common/chatModel.js';

export const ScreenshotVariableId = 'screenshot-focused-window';

export function convertBufferToScreenshotVariable(buffer: ArrayBufferLike): IChatRequestVariableEntry {
	return {
		id: ScreenshotVariableId,
		name: localize('screenshot', 'Screenshot'),
		value: new Uint8Array(buffer),
		isImage: true,
	};
}
