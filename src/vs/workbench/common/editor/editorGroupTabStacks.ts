/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../base/common/color.js';
import { EditorInput } from './editorInput.js';

/**
 * Identifies a tab stack within its editor group. Identifiers are not kept
 * across restarts or turning tab stacks off and on.
 */
export type TabStackId = string;

/**
 * The preset colors of tab stacks. A tab stack that adding editors creates gets the least used one,
 * the earliest on ties.
 */
export const TAB_STACK_COLORS = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'cyan', 'gray'] as const;

/** One of the preset colors in {@link TAB_STACK_COLORS}. */
export type TabStackPresetColor = typeof TAB_STACK_COLORS[number];

/**
 * The color of a tab stack: a preset, or a custom color written as a
 * lowercase `#rrggbb` string.
 */
export type TabStackColor = TabStackPresetColor | `#${string}`;

function isTabStackPresetColor(value: string): value is TabStackPresetColor {
	return (TAB_STACK_COLORS as readonly string[]).includes(value);
}

/**
 * A snapshot of a tab stack: a named, colored run of adjacent editors in an editor group.
 */
export interface ITabStack {

	/** The identifier of the tab stack within its group. */
	readonly id: TabStackId;

	/** The name of the tab stack, empty when it has no name. */
	readonly label: string;

	/** The color of the tab stack. */
	readonly color: TabStackColor;

	/**
	 * The editors of the tab stack in sequential order. There is at least one, and once an
	 * operation on the group ends they are adjacent and none of them is sticky or a preview.
	 */
	readonly editors: readonly EditorInput[];
}

/**
 * A single move of an editor within its group, with indices that are valid at
 * the time of the move.
 */
export interface ITabStackEditorMove {

	/** The editor that moved. */
	readonly editor: EditorInput;

	/** The index of the editor before the move. */
	readonly from: number;

	/** The index of the editor after the move. */
	readonly to: number;
}

/**
 * What an explicit tab stack operation did to the editors of the group.
 */
export interface ITabStackOperationResult {

	/**
	 * The moves in the order they happened. Replaying them one after the
	 * other on the previous order of editors gives the new order.
	 */
	readonly moves: readonly ITabStackEditorMove[];

	/**
	 * The preview editors that were pinned because they joined a tab stack.
	 */
	readonly pinned: readonly EditorInput[];
}

/**
 * The result of adding editors to a tab stack, with the tab stack they are in afterwards.
 */
export interface IAddEditorsToTabStackResult extends ITabStackOperationResult {

	/**
	 * The tab stack of the editors, or `undefined` while tab stacks are off, for a tab stack that does
	 * not exist, or when no editor could start a new one.
	 */
	readonly tabStack: ITabStack | undefined;
}

/**
 * Returns whether the color is a custom hex color rather than a preset.
 */
export function isCustomTabStackColor(color: TabStackColor): color is `#${string}` {
	return !isTabStackPresetColor(color);
}

/**
 * Returns the tab stack color that the value describes: a preset name, or a `#rgb` or `#rrggbb`
 * hex color normalized to lowercase `#rrggbb`.
 */
export function parseTabStackColor(value: unknown): TabStackColor | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	if (isTabStackPresetColor(value)) {
		return value;
	}

	if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
		return undefined;
	}

	const color = Color.Format.CSS.parseHex(value);

	return color ? Color.Format.CSS.formatHex(color) as TabStackColor : undefined;
}

/**
 * Returns the least used preset color among the colors of the tab stacks, the earliest on ties.
 */
export function getLeastUsedTabStackColor(colors: Iterable<TabStackColor>): TabStackPresetColor {
	const usage = TAB_STACK_COLORS.map(() => 0);
	for (const color of colors) {
		if (isTabStackPresetColor(color)) {
			usage[TAB_STACK_COLORS.indexOf(color)]++;
		}
	}

	return TAB_STACK_COLORS[usage.indexOf(Math.min(...usage))];
}

/**
 * Returns the index right after the editors of the tab stack from `index` on, or `index` when the
 * editor there is not in it.
 */
export function getGapAfterTabStack(editors: readonly EditorInput[], index: number, tabStack: TabStackId, getTabStackId: (editor: EditorInput) => TabStackId | undefined): number {
	let gap = index;
	while (gap < editors.length && getTabStackId(editors[gap]) === tabStack) {
		gap++;
	}

	return gap;
}

/**
 * Returns the index of the first editor of the tab stack that ends right before `index`, or
 * `index` when the editor before it is not in it.
 */
export function getGapBeforeTabStack(editors: readonly EditorInput[], index: number, tabStack: TabStackId, getTabStackId: (editor: EditorInput) => TabStackId | undefined): number {
	let gap = index;
	while (gap > 0 && getTabStackId(editors[gap - 1]) === tabStack) {
		gap--;
	}

	return gap;
}

/**
 * Returns the tab stack that the editors on both sides of the gap before `index` share, if any.
 */
export function getSurroundingTabStack(editors: readonly EditorInput[], index: number, getTabStackId: (editor: EditorInput) => TabStackId | undefined): TabStackId | undefined {
	if (index <= 0 || index >= editors.length) {
		return undefined;
	}

	const tabStack = getTabStackId(editors[index - 1]);

	return tabStack !== undefined && getTabStackId(editors[index]) === tabStack ? tabStack : undefined;
}
