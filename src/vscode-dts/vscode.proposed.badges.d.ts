/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/62783 @matthewjamesadam

	/**
	 * A badge presenting a number
	 */
	export interface NumberBadge {

		/**
		 * The number to present
		 */
		number: number;

		/**
		 * A label to present in tooltips
		 */
		label: string;
	}

	/**
	 * A badge presenting text
	 */
	export interface TextBadge {

		/**
		 * The text to present
		 */
		text: string;

		/**
		 * A label to present in tooltips
		 */
		label: string;
	}

	/**
	 * A badge presenting an icon
	 */
	export interface IconBadge {

		/**
		 * The icon to present
		 */
		icon: ThemeIcon;

		/**
		 * A label to present in tooltips
		 */
		label: string;
	}

	/**
	 * A badge presenting a progress indicator
	 */
	export interface ProgressBadge {
	}

	export interface ActivityProvider {
		/**
		 * Provide activity indication.
		 * To remove the activity data, pass undefined or null.
		 */
		onDidChangeActivity?: Event<NumberBadge | TextBadge | IconBadge | ProgressBadge | undefined | null>;
	}

	export namespace window {
		/**
		 * Register a {@link ActivityProvider} for the view contributed using the extension point `views`.
		 * This will allow you to contribute activity state for the view.
		 *
		 * @param viewId Id of the view contributed using the extension point `views`.
		 * @param activityProvider A {@link ActivityProvider} that provides activity state for the view
		 */
		export function registerActivityProvider(viewId: string, activityProvider: ActivityProvider): Disposable;

	}
}
