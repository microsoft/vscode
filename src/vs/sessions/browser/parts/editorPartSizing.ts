/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared sizing constants for the editor part / single-pane side pane, so the
 * reveal split and the sash double-click reset (which live in different classes)
 * can never drift apart.
 */

/** Fraction of the full window width the single-pane side pane takes on first reveal and on sash double-click reset. */
export const SIDE_PANE_WIDTH_RATIO = 0.6;

/** Minimum width of the editor part / single-pane side pane. Also the floor below which a persisted width is treated as corrupt. */
export const EDITOR_PART_MINIMUM_WIDTH = 300;

/** Fallback editor width used when there is no valid saved width to restore. */
export const EDITOR_PART_DEFAULT_WIDTH = 600;
