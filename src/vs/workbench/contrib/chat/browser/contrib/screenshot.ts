/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { generateFocusedWindowScreenshot } from '../../../../../platform/screenshot/browser/screenshot.js';

export async function getScreenshotAsVariable(): Promise<IScreenshotVariableEntry | undefined> {
	const screenshot = await generateFocusedWindowScreenshot();
	if (!screenshot) {
		return;
	}

	return {
		id: 'screenshot-focused-window',
		name: localize('screenshot', 'Screenshot'),
		value: new Uint8Array(screenshot),
		isImage: true,
		isDynamic: true
	};
}

interface IScreenshotVariableEntry {
	id: string;
	name: string;
	value: Uint8Array;
	isDynamic?: boolean;
	isImage?: boolean;
}
