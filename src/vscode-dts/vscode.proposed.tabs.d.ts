/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/Microsoft/vscode/issues/15178

	// TODO@API names: XYZInput -> XYZDescriptor, XYZDescription, XYZOptions
	export class TextTabInput {
		readonly uri: Uri;
	}

	export class TextDiffTabInput {
		readonly original: Uri;
		readonly modified: Uri;
	}

	export class NotebookTabInput {
		readonly notebookType: string;
		readonly uri: Uri;
	}

	export class NotebookDiffTabInput {
		readonly notebookType: string;
		readonly original: Uri;
		readonly modified: Uri;
	}

	export class CustomTabInput {
		readonly viewType: string;
		readonly uri: Uri;
	}

	// TODO@API add direction
	export class SplitTabInput {
		readonly inputs: readonly (TextTabInput | NotebookTabInput | CustomTabInput | unknown)[];
	}

	// TODO@API what about terminals
	export type TabInput = TextTabInput | TextDiffTabInput | NotebookTabInput | NotebookDiffTabInput | CustomTabInput | SplitTabInput;

	/**
	 * Represents a tab within the window
	 */
	export interface Tab {
		/**
		 * The text displayed on the tab
		 */
		readonly label: string;

		/**
		 * The column which the tab belongs to
		 */
		readonly viewColumn: ViewColumn;

		// TODO@API signal to extensions that this can grow in the future
		// TODO@API better name than "input"
		readonly input: TabInput | unknown;

		/**
		 * Whether or not the tab is currently active
		 * Dictated by being the selected tab in the group
		 */
		readonly isActive: boolean;

		/**
		 * Whether or not the dirty indicator is present on the tab
		 */
		readonly isDirty: boolean;

		/**
		 * Whether or not the tab is pinned
		 */
		readonly isPinned: boolean;

		/**
		 * Moves a tab to the given index within the column.
		 * If the index is out of range, the tab will be moved to the end of the column.
		 * If the column is out of range, a new one will be created after the last existing column.
		 * @param index The index to move the tab to
		 * @param viewColumn The column to move the tab into
		 */
		// TODO@API move into TabGroups
		move(index: number, viewColumn: ViewColumn): Thenable<void>;

		/**
		 * Closes the tab. This makes the tab object invalid and the tab
		 * should no longer be used for further actions.
		 */
		// TODO@API move into TabGroups
		close(): Thenable<void>;
	}

	export namespace window {
		/**
		 * Represents the grid widget within the main editor area
		 */
		export const tabGroups: TabGroups;
	}

	export interface TabGroups {
		/**
		 * All the groups within the group container
		 */
		readonly groups: TabGroup[];

		/**
		 * The currently active group
		 */
		readonly activeTabGroup: TabGroup | undefined;

		/**
		 * An {@link Event} which fires when a group changes.
		 */
		onDidChangeTabGroup: Event<void>;

		/**
		 * An {@link Event} which fires when the active group changes.
		 * Whether it be which group is active or its properties.
		 */
		onDidChangeActiveTabGroup: Event<TabGroup | undefined>;
	}

	export interface TabGroup {
		/**
		 * Whether or not the group is currently active
		 */
		readonly isActive: boolean;

		/**
		 * The view column of the groups
		 */
		readonly viewColumn: ViewColumn;

		/**
		 * The active tab within the group
		 */
		readonly activeTab: Tab | undefined;

		/**
		 * The list of tabs contained within the group
		 */
		readonly tabs: Tab[];
	}
}
