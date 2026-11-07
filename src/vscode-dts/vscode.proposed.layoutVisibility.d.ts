/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @cgaspard https://github.com/microsoft/vscode/issues/321409

	export namespace window {
		/**
		 * Whether the primary sidebar is currently visible.
		 *
		 * @see {@link window.onDidChangeLayoutVisibility}
		 */
		export const isSideBarVisible: boolean;

		/**
		 * Whether the bottom panel is currently visible.
		 *
		 * @see {@link window.onDidChangeLayoutVisibility}
		 */
		export const isPanelVisible: boolean;

		/**
		 * Whether the auxiliary bar (secondary sidebar) is currently visible.
		 *
		 * @see {@link window.onDidChangeLayoutVisibility}
		 */
		export const isAuxiliaryBarVisible: boolean;

		/**
		 * An event that fires when the visibility of the primary sidebar,
		 * bottom panel, or auxiliary bar changes.
		 *
		 * Extensions can use this event to track layout state without polling
		 * or parsing internal VS Code storage files.
		 *
		 * @example
		 * vscode.window.onDidChangeLayoutVisibility(state => {
		 *   console.log('panel visible:', state.panel);
		 * });
		 */
		export const onDidChangeLayoutVisibility: Event<{
			sideBar: boolean;
			panel: boolean;
			auxiliaryBar: boolean;
		}>;
	}
}
