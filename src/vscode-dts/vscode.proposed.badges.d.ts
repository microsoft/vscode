/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/62783 @matthewjamesadam


	export abstract class Badge {
		/**
		 * A label to present in tooltips
		 */
		label: string;
	}

	/**
	 * A badge presenting a number
	 */
	export class NumberBadge extends Badge {

		/**
		 * @param number The number to present
		 * @param label A label to present in tooltips
		 */
		constructor(number: number, label: string);

		/**
		 * The number to present
		 */
		readonly number: number;
	}

	/**
	 * A badge presenting text
	 */
	export class TextBadge extends Badge {

		/**
		 * @param text The text to present
		 * @param label The label to present in tooltips
		 */
		constructor(text: string, label: string)

		/**
		 * The text to present
		 */
		readonly text: string;
	}

	/**
	 * A badge presenting an icon
	 */
	export class IconBadge extends Badge {

		/**
		 * @param icon The icon to present
		 * @param label The label to present in tooltips
		 */
		constructor(icon: ThemeIcon, label: string);

		/**
		 * The icon to present
		 */
		icon: ThemeIcon;
	}

	/**
	 * A badge presenting a progress indicator
	 */
	export class ProgressBadge extends Badge {
		/**
		 * @param label The label to present in tooltips
		 */
		constructor(label: string);
	}

	export interface ActivityProvider {
		/**
		 * Provide activity indication.
		 * To remove the activity data, pass undefined or null.
		 */
		onDidChangeActivity?: Event<Badge | undefined | null>;
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
