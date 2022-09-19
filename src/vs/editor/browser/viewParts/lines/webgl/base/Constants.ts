/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { isFirefox } from 'vs/base/common/platform';

export const INVERTED_DEFAULT_COLOR = 257;

export const DIM_OPACITY = 0.5;

// The text baseline is set conditionally by browser. Using 'ideographic' for Firefox or Legacy Edge would
// result in truncated text (Issue 3353). Using 'bottom' for Chrome would result in slightly
// unaligned Powerline fonts (PR 3356#issuecomment-850928179).
export const TEXT_BASELINE: CanvasTextBaseline = isFirefox /*|| isLegacyEdge*/ ? 'bottom' : 'ideographic';

export const NULL_CELL_CODE = 0;
export const NULL_CELL_CHAR = '';

/**
 * Bitmasks for accessing data in `content`.
 */
export const enum Content {
	/**
	 * bit 1..21    codepoint, max allowed in UTF32 is 0x10FFFF (21 bits taken)
	 *              read:   `codepoint = content & Content.codepointMask;`
	 *              write:  `content |= codepoint & Content.codepointMask;`
	 *                      shortcut if precondition `codepoint <= 0x10FFFF` is met:
	 *                      `content |= codepoint;`
	 */
	CODEPOINT_MASK = 0x1FFFFF,

	/**
	 * bit 22       flag indication whether a cell contains combined content
	 *              read:   `isCombined = content & Content.isCombined;`
	 *              set:    `content |= Content.isCombined;`
	 *              clear:  `content &= ~Content.isCombined;`
	 */
	IS_COMBINED_MASK = 0x200000,  // 1 << 21

	/**
	 * bit 1..22    mask to check whether a cell contains any string data
	 *              we need to check for codepoint and isCombined bits to see
	 *              whether a cell contains anything
	 *              read:   `isEmpty = !(content & Content.hasContent)`
	 */
	HAS_CONTENT_MASK = 0x3FFFFF,

	/**
	 * bit 23..24   wcwidth value of cell, takes 2 bits (ranges from 0..2)
	 *              read:   `width = (content & Content.widthMask) >> Content.widthShift;`
	 *                      `hasWidth = content & Content.widthMask;`
	 *                      as long as wcwidth is highest value in `content`:
	 *                      `width = content >> Content.widthShift;`
	 *              write:  `content |= (width << Content.widthShift) & Content.widthMask;`
	 *                      shortcut if precondition `0 <= width <= 3` is met:
	 *                      `content |= width << Content.widthShift;`
	 */
	WIDTH_MASK = 0xC00000,   // 3 << 22
	WIDTH_SHIFT = 22
}

export const enum Attributes {
	/**
	 * bit 1..8     blue in RGB, color in P256 and P16
	 */
	BLUE_MASK = 0xFF,
	BLUE_SHIFT = 0,
	PCOLOR_MASK = 0xFF,
	PCOLOR_SHIFT = 0,

	/**
	 * bit 9..16    green in RGB
	 */
	GREEN_MASK = 0xFF00,
	GREEN_SHIFT = 8,

	/**
	 * bit 17..24   red in RGB
	 */
	RED_MASK = 0xFF0000,
	RED_SHIFT = 16,

	/**
	 * bit 25..26   color mode: DEFAULT (0) | P16 (1) | P256 (2) | RGB (3)
	 */
	CM_MASK = 0x3000000,
	CM_DEFAULT = 0,
	CM_P16 = 0x1000000,
	CM_P256 = 0x2000000,
	CM_RGB = 0x3000000,

	/**
	 * bit 1..24  RGB room
	 */
	RGB_MASK = 0xFFFFFF
}

export const enum FgFlags {
	/**
	 * bit 27..32
	 */
	INVERSE = 0x4000000,
	BOLD = 0x8000000,
	UNDERLINE = 0x10000000,
	BLINK = 0x20000000,
	INVISIBLE = 0x40000000,
	STRIKETHROUGH = 0x80000000,
}

export const enum BgFlags {
	/**
	 * bit 27..32 (upper 2 unused)
	 */
	ITALIC = 0x4000000,
	DIM = 0x8000000,
	HAS_EXTENDED = 0x10000000,
	PROTECTED = 0x20000000
}

export const enum ExtFlags {
	/**
	 * bit 27..32 (upper 3 unused)
	 */
	UNDERLINE_STYLE = 0x1C000000
}

export const DEFAULT_COLOR = 256;
export const DEFAULT_EXT = 0;
