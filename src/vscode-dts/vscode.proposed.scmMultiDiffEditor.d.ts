/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/199291

	export interface SourceControlResourceState {
		/**
		 * The uri that resolves to the original document of this resource (before the change).
		 * Used for the multi diff editor exclusively.
		 */
		readonly multiDiffEditorOriginalUri?: Uri;

		/**
		 * The uri that resolves to the modified document of this resource (after the change).
		 * Used for the multi diff editor exclusively.
		 */
		readonly multiFileDiffEditorModifiedUri?: Uri;
	}

	export interface SourceControl {
		/**
		 * Create a new {@link SourceControlResourceGroup resource group}.
		 * @param id An `id` for the {@link SourceControlResourceGroup resource group}.
		 * @param label A human-readable string for the {@link SourceControlResourceGroup resource group}.
		 * @param options Options for the {@link SourceControlResourceGroup resource group}.
		 * 				Set `multiDiffEditorEnableViewChanges` to `true` to enable the "View Changes" option which opens the multi file diff editor.
		 * @return An instance of {@link SourceControlResourceGroup resource group}.
		 */
		createResourceGroup(id: string, label: string, options: { multiDiffEditorEnableViewChanges?: boolean }): SourceControlResourceGroup;
	}
}
