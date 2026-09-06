/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { ChatImageMimeType } from '../../conversation/common/languageModelChatMessageHelpers';

/** Maximum image file size in bytes (20 MB) */
export const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;

const imageExtensionToMimeType: Record<string, ChatImageMimeType> = {
	'.png': ChatImageMimeType.PNG,
	'.jpg': ChatImageMimeType.JPEG,
	'.jpeg': ChatImageMimeType.JPEG,
	'.gif': ChatImageMimeType.GIF,
	'.webp': ChatImageMimeType.WEBP,
};

export function getImageMimeType(uri: URI): ChatImageMimeType | undefined {
	const path = uri.path.toLowerCase();
	for (const [ext, mime] of Object.entries(imageExtensionToMimeType)) {
		if (path.endsWith(ext)) {
			return mime;
		}
	}

	return undefined;
}
