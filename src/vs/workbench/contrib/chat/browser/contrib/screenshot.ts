/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateFocusedWindowScreenshot } from '../../../../../base/browser/screenshot.js';
import { localize } from '../../../../../nls.js';

import { IChatRequestVariableEntry } from '../../common/chatModel.js';

export const ScreenshotVariableId = 'screenshot-focused-window';

export async function getScreenshotAsVariable(): Promise<IChatRequestVariableEntry | undefined> {
	const screenshot = await generateFocusedWindowScreenshot();
	if (!screenshot) {
		return;
	}

	return {
		id: ScreenshotVariableId,
		name: localize('screenshot', 'Screenshot'),
		value: new Uint8Array(screenshot),
		isImage: true,
		isDynamic: true
	};
}

