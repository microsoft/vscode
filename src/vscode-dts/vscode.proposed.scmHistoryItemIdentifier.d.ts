/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/314007
	// Requires scmHistoryProvider.

	export interface SourceControlHistoryItemIdentifierPart {
		/** Literal, single-line text. Markdown and icon syntax are not interpreted. */
		readonly text: string;
		/** Optional theme color. Omit to inherit the row foreground. */
		readonly color?: ThemeColor;
	}

	export interface SourceControlHistoryItem {
		/**
		 * Optional identifier text displayed before the subject in the Source Control Graph.
		 * Parts are concatenated without separators. For example, a provider can color
		 * the unique portion of a change ID differently from its remaining characters.
		 * Multiple identifiers can be included, for example a change ID and a commit ID.
		 * This is presentation only: {@link SourceControlHistoryItem.id id},
		 * {@link SourceControlHistoryItem.parentIds parentIds}, and
		 * {@link SourceControlHistoryItem.displayId displayId}
		 * retain their existing meaning for identity, actions, and editor titles.
		 *
		 * Requires the `scmHistoryItemIdentifier` proposal and the user's
		 * `scm.graph.experimental.showIdentifiers` setting. An empty array is ignored.
		 * The workbench may truncate the identifier to fit the available space.
		 */
		readonly identifier?: readonly SourceControlHistoryItemIdentifierPart[];
	}
}
