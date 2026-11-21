/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/306507

	/**
	 * Line-level statistics that describe the size of a change.
	 */
	export interface SourceControlResourceDiffStatistics {
		/**
		 * The number of lines added.
		 */
		readonly insertions: number;

		/**
		 * The number of lines removed.
		 */
		readonly deletions: number;
	}

	export interface SourceControlResourceState {
		/**
		 * Optional line-level diff statistics for this resource state.
		 *
		 * When provided, the Source Control view may show the number of inserted and
		 * deleted lines next to the resource, and aggregate the values of all the
		 * resources of a {@link SourceControlResourceGroup resource group} on the
		 * group header.
		 */
		readonly diffStatistics?: SourceControlResourceDiffStatistics;
	}
}
