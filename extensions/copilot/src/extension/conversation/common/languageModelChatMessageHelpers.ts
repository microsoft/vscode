/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { LanguageModelDataPart } from '../../../vscodeTypes';

export enum ChatImageMimeType {
	PNG = 'image/png',
	JPEG = 'image/jpeg',
	GIF = 'image/gif',
	WEBP = 'image/webp',
	BMP = 'image/bmp',
}

export function isImageDataPart(part: unknown): part is LanguageModelDataPart {
	if (part instanceof LanguageModelDataPart && isChatImageMimeType(part.mimeType)) {
		return true;
	}

	return false;
}

function isChatImageMimeType(mimeType: string): mimeType is ChatImageMimeType {
	switch (mimeType) {
		case ChatImageMimeType.JPEG:
		case ChatImageMimeType.PNG:
		case ChatImageMimeType.GIF:
		case ChatImageMimeType.WEBP:
		case ChatImageMimeType.BMP:
			return true;
		default:
			return false;
	}
}
