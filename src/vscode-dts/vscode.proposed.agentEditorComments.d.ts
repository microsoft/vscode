/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A comment anchored to a range of a resource, sourced from the workbench's
	 * agent/session comment store (the same store the built-in code editor renders
	 * its session comments from).
	 */
	export interface AgentEditorComment {
		/** Stable identity of the comment within its provider. */
		readonly id: string;
		/** The range the comment is anchored to. */
		readonly range: Range;
		/** The comment text. */
		readonly body: string;
		/** Display name of the author, if any. */
		readonly author?: string;
	}

	/**
	 * A live, disposable view of the agent/session comments for a resource that is
	 * not necessarily shown in a {@link TextEditor} (for example a document rendered
	 * by a custom editor).
	 *
	 * The comments are backed by the same workbench store the code editor uses, so
	 * comments added here are visible in the code editor and vice versa.
	 */
	export interface AgentEditorCommentsProvider extends Disposable {
		/**
		 * The current comments for the resource. Empty when the resource has no
		 * comments or is not in scope for any session.
		 */
		readonly comments: readonly AgentEditorComment[];

		/**
		 * An event that fires whenever {@link comments} changes.
		 */
		readonly onDidChange: Event<void>;

		/**
		 * Add a comment for the resource at the given range. No-op when the resource
		 * is not in scope for a session.
		 *
		 * @param range The range to anchor the comment to.
		 * @param body The comment text.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		addComment(range: Range, body: string): void;
	}

	export namespace window {
		/**
		 * Observe (and contribute to) the agent/session comments for a resource.
		 *
		 * The resource only needs to be backed by an open {@link TextDocument}; it does
		 * not need to be shown in a {@link TextEditor}. This is useful for custom
		 * editors, which render their document in a webview rather than a text editor.
		 *
		 * The returned provider must be disposed once it is no longer needed.
		 *
		 * @param uri The resource to observe.
		 * @returns A live, disposable view of the resource's comments.
		 */
		export function createAgentEditorComments(uri: Uri): AgentEditorCommentsProvider;
	}

}
