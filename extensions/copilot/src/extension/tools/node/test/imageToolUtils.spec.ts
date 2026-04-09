/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatImageMimeType } from '../../../conversation/common/languageModelChatMessageHelpers';
import { getImageMimeType } from '../imageToolUtils';

suite('imageToolUtils', () => {
	test('recognizes all supported image extensions', () => {
		expect([
			getImageMimeType(URI.file('/workspace/image.png')),
			getImageMimeType(URI.file('/workspace/image.jpg')),
			getImageMimeType(URI.file('/workspace/image.jpeg')),
			getImageMimeType(URI.file('/workspace/image.gif')),
			getImageMimeType(URI.file('/workspace/image.webp')),
		]).toEqual([
			ChatImageMimeType.PNG,
			ChatImageMimeType.JPEG,
			ChatImageMimeType.JPEG,
			ChatImageMimeType.GIF,
			ChatImageMimeType.WEBP,
		]);
	});

	test('does not recognize unsupported extensions as images', () => {
		expect(getImageMimeType(URI.file('/workspace/image.bmp'))).toBeUndefined();
	});
});