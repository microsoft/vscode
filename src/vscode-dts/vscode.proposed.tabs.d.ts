/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/Microsoft/vscode/issues/15178

	// TODO@API names
	export class TextTabInput {
		readonly uri: Uri;
		constructor(uri: Uri);
	}

	// TODO@API names
	export class TextDiffTabInput {
		readonly original: Uri;
		readonly modified: Uri;
		constructor(original: Uri, modified: Uri);
	}

	export class CustomEditorTabInput {
		readonly uri: Uri;
		readonly viewType: string;
		constructor(uri: Uri, viewType: string);
	}

	export class NotebookEditorTabInput {
		readonly uri: Uri;
		readonly notebookType: string;
		constructor(uri: Uri, notebookType: string);
	}

	export class NotebookDiffEditorTabInput {
		readonly original: Uri;
		readonly modified: Uri;
		readonly notebookType: string;
		constructor(original: Uri, modified: Uri, notebookType: string);
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
		 * The group which the tab belongs to
		 */
		readonly parentGroup: TabGroup;

		// TODO@API NAME: optional
		readonly input: TextTabInput | TextDiffTabInput | CustomEditorTabInput | NotebookEditorTabInput | NotebookDiffEditorTabInput | unknown;

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
		 * Whether or not the tab is pinned (pin icon is present)
		 */
		readonly isPinned: boolean;

		/**
		 * Whether or not the tab is in preview mode.
		 */
		readonly isPreview: boolean;
	}

	export namespace window {
		/**
		 * Represents the grid widget within the main editor area
		 */
		export const tabGroups: TabGroups;
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
		readonly tabs: readonly Tab[];
	}

	export interface TabGroups {
		/**
		 * All the groups within the group container
		 */
		readonly groups: readonly TabGroup[];

		/**
		 * The currently active group
		 */
		readonly activeTabGroup: TabGroup | undefined;

		/**
		 * An {@link Event} which fires when a group changes.
		 */
		readonly onDidChangeTabGroup: Event<void>;

		/**
		 * An {@link Event} which fires when a tab changes.
		 */
		// TODO@API use richer event type?
		readonly onDidChangeTab: Event<Tab>;

		/**
		 * An {@link Event} which fires when the active group changes.
		 * Whether it be which group is active.
		 */
		readonly onDidChangeActiveTabGroup: Event<TabGroup | undefined>;

		/**
		 * Closes the tab. This makes the tab object invalid and the tab
		 * should no longer be used for further actions.
		 * @param tab The tab to close, must be reference equal to a tab given by the API
		 * @param preserveFocus When `true` focus will remain in its current position. If `false` it will jump to the next tab.
		 */
		close(tab: Tab[], preserveFocus?: boolean): Thenable<void>;
		close(tab: Tab, preserveFocus?: boolean): Thenable<void>;

		/**
		 * Moves a tab to the given index within the column.
		 * If the index is out of range, the tab will be moved to the end of the column.
		 * If the column is out of range, a new one will be created after the last existing column.
		 *
		 * @package tab The tab to move.
		 * @param viewColumn The column to move the tab into
		 * @param index The index to move the tab to
		 */
		// TODO@API support TabGroup in addition to ViewColumn
		// TODO@API support just index for moving inside current group
		move(tab: Tab, viewColumn: ViewColumn, index: number, preserveFocus?: boolean): Thenable<void>;
	}
}
