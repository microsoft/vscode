/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// Calling the user to a chat session for something an extension prepared while it ran,
	// e.g. a draft to review or a progress update.

	/**
	 * A mark on a session's row in the sessions lists.
	 */
	export interface ChatSessionAttention {
		readonly icon: ThemeIcon;
		/**
		 * What waits in the session, shown on hover.
		 */
		readonly tooltip: string;
	}

	/**
	 * An OS notification about a session.
	 */
	export interface ChatSessionNotification {
		/**
		 * The session's title; defaults to the loaded chat's.
		 */
		readonly title?: string;
		/**
		 * One line on what is ready.
		 */
		readonly body: string;
	}

	/**
	 * Why an OS notification about a session wasn't shown.
	 */
	export enum ChatSessionNotificationSkipReason {
		/**
		 * The session's window has focus.
		 */
		WindowFocused = 1,
		/**
		 * `chat.notifyWindowOnConfirmation` is `off`.
		 */
		Off = 2
	}

	export interface ChatSessionNotificationResult {
		/**
		 * Whether it was shown: only while the session's window isn't focused (always, when
		 * `chat.notifyWindowOnConfirmation` is `always`), and never when that setting is `off`.
		 */
		readonly shown: boolean;
		/**
		 * Why it wasn't shown.
		 */
		readonly reason?: ChatSessionNotificationSkipReason;
		/**
		 * Resolves once the notification is gone: whether the user clicked it, which opens the
		 * session. A notification the OS keeps may never resolve.
		 */
		readonly clicked: Thenable<boolean>;
	}

	export namespace chat {
		/**
		 * Marks a session's row in the sessions lists until cleared with `undefined`. One mark per
		 * extension and session.
		 */
		export function setChatSessionAttention(session: Uri, attention: ChatSessionAttention | undefined): void;

		/**
		 * Calls the user to a session from outside the editor, the way a session that needs input
		 * does: the window flashes, the application icon shows its attention badge, and an OS
		 * notification opens the session when clicked. Resolves as soon as it is shown or skipped.
		 */
		export function notifyChatSession(session: Uri, notification: ChatSessionNotification): Thenable<ChatSessionNotificationResult>;
	}
}
