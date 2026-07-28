/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { IScreenshotService } from '../browser/screenshotService.js';
import { encodeBase64 } from '../../../../base/common/buffer.js';

export class NativeScreenshotService implements IScreenshotService {
	readonly _serviceBrand: undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) { }

	async captureScreenshot(rect?: IRectangle): Promise<string | undefined> {
		const buffer = await this.nativeHostService.getScreenshot(rect);
		if (!buffer) {
			return undefined;
		}

		return `data:image/jpeg;base64,${encodeBase64(buffer)}`;
	}
}
