/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/161200

	/**
	 * Impacts the behavior and appearance of the validation message.
	 */
	export enum SourceControlNotificationSeverity {
		Error = 0,
		Warning = 1,
		Information = 2
	}

	export interface SourceControlNotification {

		/**
		 * The notification message to display.
		 */
		readonly message: string | MarkdownString;

		/**
		 * The severity of the notification message.
		 */
		readonly severity: SourceControlNotificationSeverity;
	}

	export interface SourceControl {
		notification?: SourceControlNotification;
	}
}
