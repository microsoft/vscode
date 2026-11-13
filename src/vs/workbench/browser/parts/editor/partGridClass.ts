/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The class of the element of a grid of the parts of a window. With focus in
 * it but in no part, such as in its title row, the active part of the window
 * is its main part.
 */
export const PART_GRID_CLASS = 'part-grid';

/**
 * The class of a part's top strip, such as the tabs of an editor group, that shares the top edge of the part's card in
 * a grid of parts with the card's grabber: while the pointer is over it, the card is marked
 * `part-grid-pointer-over-top-strip`, and while it is over the grabber, `part-grid-pointer-over-grabber`.
 */
export const PART_GRID_TOP_STRIP_CLASS = 'part-grid-top-strip';
