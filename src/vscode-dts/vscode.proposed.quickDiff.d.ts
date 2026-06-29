/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/169012

	export namespace window {
		/**
		 * Observe the quick diff (source control change) information for a resource.
		 *
		 * The returned {@link QuickDiffInformation.changes changes} are the same
		 * added/modified/deleted line changes that the built-in editor paints in its
		 * gutter, aggregated from the primary quick diff provider (e.g. git). The
		 * information updates live as the document or the underlying source control
		 * state changes; subscribe to {@link QuickDiffInformation.onDidChange} to be
		 * notified.
		 *
		 * The returned object must be disposed once it is no longer needed.
		 *
		 * @param uri The resource to observe. Must be backed by an open text document.
		 * @returns A live, disposable view of the resource's quick diff changes.
		 */
		export function createQuickDiffInformation(uri: Uri): QuickDiffInformation;
	}

	/**
	 * A live, disposable view of the quick diff (source control) changes of a resource.
	 */
	export interface QuickDiffInformation extends Disposable {
		/**
		 * The current quick diff changes, in source (modified document) order.
		 *
		 * Empty until the first {@link onDidChange} fires, since the diff is computed
		 * asynchronously.
		 */
		readonly changes: readonly QuickDiffChange[];

		/**
		 * The {@link TextDocument.version version} of the document that the current
		 * {@link changes} were computed against.
		 *
		 * The diff is computed asynchronously, so by the time {@link onDidChange}
		 * fires the document may already have been edited further. Compare this value
		 * against the {@link TextDocument.version version} of the document content you
		 * are about to decorate and discard the changes when they differ, otherwise
		 * the line/character positions in {@link changes} may not line up with your
		 * content. A subsequent {@link onDidChange} will deliver changes for the newer
		 * version.
		 */
		readonly documentVersion: number;

		/**
		 * An event that fires whenever {@link changes} changes.
		 */
		readonly onDidChange: Event<void>;
	}

	/**
	 * A single quick diff change: a contiguous region of the modified document that
	 * was added, modified or deleted relative to the source control original.
	 *
	 * Line numbers are 1-based. For an {@link QuickDiffChangeKind.Added added} change
	 * the original lines collapse to a single boundary (`originalEndLineNumber` is
	 * `0`); for a {@link QuickDiffChangeKind.Deleted deleted} change the modified
	 * lines collapse to a single boundary (`modifiedEndLineNumber` is `0`).
	 */
	export interface QuickDiffChange {
		/**
		 * The kind of change.
		 */
		readonly kind: QuickDiffChangeKind;

		/**
		 * The first changed line in the original (source control) document.
		 */
		readonly originalStartLineNumber: number;

		/**
		 * The last changed line in the original (source control) document, or `0`
		 * for an {@link QuickDiffChangeKind.Added added} change.
		 */
		readonly originalEndLineNumber: number;

		/**
		 * The first changed line in the modified (current) document.
		 */
		readonly modifiedStartLineNumber: number;

		/**
		 * The last changed line in the modified (current) document, or `0` for a
		 * {@link QuickDiffChangeKind.Deleted deleted} change.
		 */
		readonly modifiedEndLineNumber: number;
	}

	/**
	 * The kind of a {@link QuickDiffChange}, mirroring the three states a source
	 * control diff distinguishes.
	 */
	export enum QuickDiffChangeKind {
		/**
		 * Content was inserted that is not present in the original.
		 */
		Added = 1,
		/**
		 * Existing content was edited.
		 */
		Modified = 2,
		/**
		 * Content present in the original was removed.
		 */
		Deleted = 3,
	}
}
