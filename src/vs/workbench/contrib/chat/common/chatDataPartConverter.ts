/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatDataContent } from './chatService.js';
import { IChatResponseDataPart, IChatMessageDataPart } from './languageModels.js';

/**
 * Converts language model data parts to chat data content for rendering via chat output renderers.
 */
export function convertDataPartToChatContent(dataPart: IChatResponseDataPart | IChatMessageDataPart): IChatDataContent {
	return {
		kind: 'data',
		mimeType: dataPart.mimeType,
		data: dataPart.data
	};
}

/**
 * Checks if a language model response part is a data part
 */
export function isDataPart(part: any): part is IChatResponseDataPart | IChatMessageDataPart {
	return part && typeof part === 'object' && 'mimeType' in part && 'data' in part && part.type === 'data';
}