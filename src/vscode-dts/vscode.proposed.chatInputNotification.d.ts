/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Severity level of a chat input notification.
	 */
	export enum ChatInputNotificationSeverity {
		/**
		 * Informational notification (e.g., approaching a usage threshold).
		 */
		Info = 0,

		/**
		 * Warning notification (e.g., close to a usage limit).
		 */
		Warning = 1,

		/**
		 * Error notification (e.g., quota exhausted).
		 */
		Error = 2,
	}

	/**
	 * An action button displayed in a chat input notification.
	 */
	export interface ChatInputNotificationAction {
		/**
		 * The label of the action button.
		 */
		label: string;

		/**
		 * The command to execute when the action is clicked.
		 */
		commandId: string;

		/**
		 * Optional arguments to pass to the command.
		 */
		commandArgs?: unknown[];
	}

	/**
	 * A notification banner displayed above the chat input area.
	 *
	 * Notifications have a severity level that controls their visual styling
	 * (info, warning, or error), a message, optional action buttons, and
	 * configurable dismiss behavior.
	 */
	export interface ChatInputNotification {
		/**
		 * The unique identifier of this notification.
		 */
		readonly id: string;

		/**
		 * The severity of the notification.
		 */
		severity: ChatInputNotificationSeverity;

		/**
		 * The title to display. Plain text only. Rendered in bold.
		 */
		message: string;

		/**
		 * Optional description text displayed below the title.
		 * Plain text only.
		 */
		description: string | undefined;

		/**
		 * Optional action buttons to display.
		 */
		actions: ChatInputNotificationAction[];

		/**
		 * Whether the notification can be dismissed by the user. Defaults to `true`.
		 */
		dismissible: boolean;

		/**
		 * Whether the notification should be automatically dismissed when the user
		 * sends their next chat message. Defaults to `false`.
		 */
		autoDismissOnMessage: boolean;

		/**
		 * Shows the notification in the chat input area.
		 */
		show(): void;

		/**
		 * Hides the notification from the chat input area.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	namespace chat {
		/**
		 * Create a new chat input notification.
		 *
		 * @param id The unique identifier of the notification.
		 * @returns A new chat input notification.
		 */
		export function createInputNotification(id: string): ChatInputNotification;
	}
}
