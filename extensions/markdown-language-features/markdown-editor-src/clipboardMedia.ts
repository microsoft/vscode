/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NativeClipboardData } from '@vscode/markdown-editor';

export const clipboardFormatsUnavailableMessage = 'The clipboard formats are not available to this editor. Try copying the media itself instead of its file.';

export function getNativeClipboardMedia(data: NativeClipboardData, plainText: boolean): { readonly text: string; readonly images: readonly File[] } {
	const images = plainText ? [] : data.files.filter(file => /^(image|video|audio)\//.test(file.type));
	if (!plainText && data.files.length && !images.length && !data.text) {
		throw new Error(clipboardFormatsUnavailableMessage);
	}
	return { text: data.text, images };
}
