/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/Microsoft/vscode/issues/15178

	export class TabKindText {
		readonly uri: Uri;
		constructor(uri: Uri);
	}

	export class TabKindTextDiff {
		readonly original: Uri;
		readonly modified: Uri;
		constructor(original: Uri, modified: Uri);
	}

	export class TabKindCustom {
		readonly uri: Uri;
		readonly viewType: string;
		constructor(uri: Uri, viewType: string);
	}

	export class TabKindWebview {
		/**
		 * The type of webview. Maps to {@linkcode WebviewPanel.viewType WebviewPanel's viewType}
		 */
		readonly viewType: string;
		constructor(viewType: string);
	}

	export class TabKindNotebook {
		readonly uri: Uri;
		readonly notebookType: string;
		constructor(uri: Uri, notebookType: string);
	}

	export class TabKindNotebookDiff {
		readonly original: Uri;
		readonly modified: Uri;
		readonly notebookType: string;
		constructor(original: Uri, modified: Uri, notebookType: string);
	}

	export class TabKindTerminal {
		constructor();
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
		readonly group: TabGroup;

		/**
		 * Defines the structure of the tab i.e. text, notebook, custom, etc.
		 * Resource and other useful properties are defined on the tab kind.
		 */
		readonly kind: TabKindText | TabKindTextDiff | TabKindCustom | TabKindWebview | TabKindNotebook | TabKindNotebookDiff | TabKindTerminal | unknown;

		/**
		 * Whether or not the tab is currently active.
		 * This is dictated by being the selected tab in the group
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
		 * The view column of the group
		 */
		readonly viewColumn: ViewColumn;

		/**
		 * The active tab in the group (this is the tab currently being rendered).
		 * There can be one active tab per group. There can only be one active group.
		 */
		readonly activeTab: Tab | undefined;

		/**
		 * The list of tabs contained within the group.
		 * This can be empty if the group has no tabs open.
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
		// TOD@API name: maybe `activeGroup` to align with `groups` (which isn't tabGroups)
		readonly activeTabGroup: TabGroup;

		/**
		 * An {@link Event event} which fires when {@link TabGroup tab groups} has changed.
		 */
		readonly onDidChangeTabGroups: Event<TabGroup[]>;

		/**
		 * An {@link Event event} which fires when a {@link Tab tabs} have changed.
		 */
		readonly onDidChangeTabs: Event<Tab[]>;

		/**
		 * An {@link Event} which fires when an active tab changes.
		 * Similar to {@link TabGroup.onDidChangeTabs} but only on tabs
		 * with isActive equal to true.
		 */
		readonly onDidChangeActiveTab: Event<Tab>;

		/**
		 * An {@link Event} which fires when the active group changes.
		 * This does not fire when the properties within the group change.
		 */
		readonly onDidChangeActiveTabGroup: Event<TabGroup>;

		/**
		 * Closes the tab. This makes the tab object invalid and the tab
		 * should no longer be used for further actions.
		 * Note: In the case of a dirty tab, a confirmation dialog will be shown which may be cancelled. If cancelled the tab is still valid
		 * @param tab The tab to close, must be reference equal to a tab given by the API
		 * @param preserveFocus When `true` focus will remain in its current position. If `false` it will jump to the next tab.
		 * @returns A promise that resolves true when then tab is closed. Otherwise it will return false.
		 * If false is returned the tab is still valid.
		 */
		close(tab: Tab | Tab[], preserveFocus?: boolean): Thenable<boolean>;
		// TODO@API support to close "all"
		// close(tab: TabGroup | TabGroup[], preserveFocus?: boolean): Thenable<boolean>;

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
		// TODO@API move a tag group
		move(tab: Tab, viewColumn: ViewColumn, index: number, preserveFocus?: boolean): Thenable<void>;
	}
}
