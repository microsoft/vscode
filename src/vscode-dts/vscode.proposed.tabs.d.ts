/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/Microsoft/vscode/issues/15178

	export enum TabKind {
		Singular = 0,
		Diff = 1,
		SidebySide = 2,
		Other = 3
	}

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

		/**
		 * The resource represented by the tab if available.
		 * Note: Not all tabs have a resource associated with them.
		 */
		readonly resource: Uri | undefined;

		/**
		 * The type of view contained in the tab
		 * This is equivalent to `viewType` for custom editors and `notebookType` for notebooks.
		 * The built-in text editor has an id of 'default' for all configurations.
		 */
		readonly viewType: string | undefined;

		/**
		 * All the resources and viewIds represented by a tab
		 * {@link Tab.resource resource} and {@link Tab.viewType viewType} will
		 * always be at index 0.
		 */
		readonly additionalResourcesAndViewTypes: readonly {
			readonly resource: Uri | undefined;
			readonly viewType: string | undefined;
		}[];

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
		 * Indicates the type of tab it is.
		 */
		readonly kind: TabKind;

		/**
		 * Moves a tab to the given index within the column.
		 * If the index is out of range, the tab will be moved to the end of the column.
		 * If the column is out of range, a new one will be created after the last existing column.
		 * @param index The index to move the tab to
		 * @param viewColumn The column to move the tab into
		 */
		move(index: number, viewColumn: ViewColumn): Thenable<void>;

		/**
		 * Closes the tab. This makes the tab object invalid and the tab
		 * should no longer be used for further actions.
		 */
		close(): Thenable<void>;
	}

	export namespace window {
		/**
		 * Represents the grid widget within the main editor area
		 */
		export const tabGroups: TabGroups;
	}

	interface TabGroups {
		/**
		 * All the groups within the group container
		 */
		readonly all: TabGroup[];

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
		onDidChangeActiveTabGroup: Event<TabGroup>;
	}

	interface TabGroup {
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
