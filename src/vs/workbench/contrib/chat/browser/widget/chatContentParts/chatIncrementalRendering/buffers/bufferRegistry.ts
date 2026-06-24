/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIncrementalRenderingBuffer } from './buffer.js';
import { OffBuffer } from './offBuffer.js';
import { ParagraphBuffer } from './paragraphBuffer.js';
import { WordBuffer } from './wordBuffer.js';

/**
 * Registry of all available buffering strategies.
 * To add a new buffer, add an entry here.
 */
export const BUFFER_MODES = {
	off: (_domNode: HTMLElement): IIncrementalRenderingBuffer => new OffBuffer(),
	word: (_domNode: HTMLElement): IIncrementalRenderingBuffer => new WordBuffer(),
	paragraph: (_domNode: HTMLElement): IIncrementalRenderingBuffer => new ParagraphBuffer(),
} as const satisfies Record<string, (domNode: HTMLElement) => IIncrementalRenderingBuffer>;

export type BufferModeName = keyof typeof BUFFER_MODES;
