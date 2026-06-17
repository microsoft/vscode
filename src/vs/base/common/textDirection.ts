/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Matches a single character from a right-to-left script. Covers Hebrew, Arabic,
 * Syriac, Thaana, N'Ko, Samaritan, Mandaic, the Arabic Extended/Supplement blocks,
 * and the Arabic Presentation Forms.
 */
const RTL_CHARACTER = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0800-\u083F\u0840-\u085F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * Detects the writing direction to apply to a block of text.
 *
 * Detection is presence-based: if the text contains *any* RTL character the block is
 * laid out `rtl`, otherwise `auto` (the browser resolves LTR/neutral content itself).
 *
 * This is intentionally not the first-strong-character / `dir="auto"` heuristic: an RTL
 * paragraph that happens to start with an English word (a brand or tech term, very common
 * in Hebrew/Arabic writing) would otherwise be laid out left-to-right. The reverse —
 * an English paragraph containing a single RTL word — is rare, so presence-based detection
 * is the better trade-off for chat content.
 */
export function detectTextDirection(text: string): 'rtl' | 'auto' {
	return RTL_CHARACTER.test(text) ? 'rtl' : 'auto';
}
