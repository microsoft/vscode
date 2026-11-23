/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// Annotations on a chat session's timeline, e.g. progress digests written while it ran.

	/**
	 * A note at a moment of a chat session, shown on its prompt timeline between the prompts
	 * sent before and after it.
	 */
	export interface ChatSessionAnnotation {
		/**
		 * Unique among this extension's annotations on the session.
		 */
		readonly id: string;
		/**
		 * When the note was written, in milliseconds since the epoch: it follows the session's
		 * requests made before then.
		 */
		readonly timestamp: number;
		/**
		 * A one-line summary.
		 */
		readonly label: string;
		/**
		 * The note in full, shown when it is expanded. Command links run only when the string is
		 * trusted for them.
		 */
		readonly detail?: MarkdownString;
		readonly icon?: ThemeIcon;
	}

	export namespace chat {
		/**
		 * Replaces this extension's annotations on a session's timeline.
		 *
		 * @param session The session's resource.
		 * @param annotations The annotations; an empty array removes them.
		 */
		export function setChatSessionAnnotations(session: Uri, annotations: readonly ChatSessionAnnotation[]): void;

		/**
		 * Opens a session and reveals the prompt its timeline shows a note written at `timestamp`
		 * under (the last request made by then), as choosing that prompt on the timeline does.
		 *
		 * @param session The session's resource.
		 * @param timestamp When the note was written, in milliseconds since the epoch.
		 */
		export function revealChatSessionPromptAt(session: Uri, timestamp: number): Thenable<void>;

		/**
		 * What a chat transcript shows when the user hovers a link to each of the given targets: a
		 * rich link's tooltip (a pull request's, for example), a file's path, a web page's address;
		 * an empty string for a command. For links shown outside chat that should read the same.
		 *
		 * @param hrefs The links' targets, such as `file:` URIs and web addresses.
		 * @returns One tooltip per target, in order.
		 */
		export function getChatLinkTooltips(hrefs: readonly string[]): Thenable<string[]>;
	}
}
