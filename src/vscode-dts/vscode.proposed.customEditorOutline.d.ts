/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/97095

	/**
	 * An item in a custom editor outline tree.
	 */
	export interface CustomEditorOutlineItem {

		/**
		 * A unique identifier for this item. Used to track active elements
		 * and for reveal requests.
		 */
		readonly id: string;

		/**
		 * The label of this item displayed in the outline.
		 */
		readonly label: string;

		/**
		 * An optional detail string displayed after the label.
		 */
		readonly detail?: string;

		/**
		 * An optional tooltip shown on hover.
		 */
		readonly tooltip?: string;

		/**
		 * An optional icon for this item, using a ThemeIcon such as
		 * `new ThemeIcon('symbol-class')`.
		 */
		readonly icon?: ThemeIcon;

		/**
		 * An optional context value that can be used for contributing actions
		 * via `menus` in package.json using the `customEditorOutlineItem` context key.
		 *
		 * Example package.json contribution for toolbar and context menu:
		 * ```json
		 * "menus": {
		 *   "customEditor/outline/toolbar": [{
		 *     "command": "myExt.deleteItem",
		 *     "group": "inline",
		 *     "when": "customEditorOutlineItem == 'myNodeType'"
		 *   }],
		 *   "customEditor/outline/context": [{
		 *     "command": "myExt.renameItem",
		 *     "when": "customEditorOutlineItem == 'myNodeType'"
		 *   }]
		 * }
		 * ```
		 */
		readonly contextValue?: string;

		/**
		 * Child items of this item.
		 */
		readonly children?: CustomEditorOutlineItem[];
	}

	/**
	 * A provider that supplies outline data for custom editors. Register via
	 * {@link window.registerCustomEditorOutlineProvider}.
	 */
	export interface CustomEditorOutlineProvider {

		/**
		 * Fired when the outline data for a specific resource has changed and
		 * needs to be refreshed.
		 */
		readonly onDidChangeOutline: Event<Uri>;

		/**
		 * Fired when the active (focused/selected) item in the custom editor
		 * has changed. The outline view will follow the active item and
		 * highlight it in the tree.
		 *
		 * Pass `undefined` for `itemId` if no item is currently active.
		 */
		readonly onDidChangeActiveItem: Event<{ uri: Uri; itemId: string | undefined }>;

		/**
		 * Provide the outline items for the custom editor displaying the given document.
		 *
		 * @param uri The URI of the document being displayed.
		 * @param token A cancellation token.
		 * @returns The root-level outline items, or `undefined` if no outline
		 *   can be provided.
		 */
		provideOutline(uri: Uri, token: CancellationToken): ProviderResult<CustomEditorOutlineItem[]>;

		/**
		 * Called when the user clicks an outline item. The extension should
		 * reveal/scroll to the corresponding element in the custom editor.
		 *
		 * @param uri The URI of the document being displayed.
		 * @param itemId The {@link CustomEditorOutlineItem.id id} of the item to reveal.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		revealItem(uri: Uri, itemId: string): void;
	}

	export namespace window {

		/**
		 * Register an outline provider for a custom editor view type.
		 *
		 * When a custom editor of the given `viewType` is active, the outline
		 * view will be populated using the data from this provider instead of
		 * the default document symbol provider.
		 *
		 * @param viewType The view type of the custom editor as declared in
		 *   `package.json` `customEditors`.
		 * @param provider The outline provider.
		 * @returns A disposable that unregisters this provider.
		 */
		export function registerCustomEditorOutlineProvider(viewType: string, provider: CustomEditorOutlineProvider): Disposable;
	}
}
