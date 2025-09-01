/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IThinkingProcessor = createDecorator<IThinkingProcessor>('thinkingProcessor');

export interface IThinkingProcessor {
	readonly _serviceBrand: undefined;
	
	processThinkingTagsWithBuffer(delta: string): string;
	resetThinkingBuffer(): void;
	processThinkingTagsComplete(content: string): string;
	shouldAutoShowThinkingMessage(): boolean;
}
