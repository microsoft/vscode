/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The height of a standard quick input item in pixels. */
export const QUICK_INPUT_ITEM_HEIGHT = 22;

/** The height of a quick input item with detail text in pixels. */
export const QUICK_INPUT_ITEM_WITH_DETAIL_HEIGHT = QUICK_INPUT_ITEM_HEIGHT * 2;

/** Extra list viewport height that indicates more content can be scrolled to. */
export const QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT = 6;

/** The maximum default width of the quick input widget in pixels. */
export const QUICK_INPUT_MAX_WIDTH = 600;

/** The default fraction of the host height occupied by quick input items. */
export const QUICK_INPUT_DEFAULT_HEIGHT_RATIO = 0.4;

/** The maximum fraction of either host dimension occupied by the quick input. */
export const QUICK_INPUT_MAX_DIMENSION_RATIO = 0.9;

/** The minimum quick input width as a fraction of its default width. */
export const QUICK_INPUT_MIN_WIDTH_RATIO = 1 / 3;

/** The amount by which keyboard commands resize the quick input width in pixels. */
export const QUICK_INPUT_RESIZE_WIDTH_INCREMENT = 60;
