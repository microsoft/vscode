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

	export interface TreeDataProvider<T> {

		/**
		 * An optional event to provide activity data associated with this tree data.
		 * When this tree data is displayed in the activity view, this activity value will be displayed
		 * as a badge alongside the activity view entry.
		 * To remove the activity data, pass undefined or null.
		 */
		onDidChangeActivity?: Event<NumberBadge | TextBadge | IconBadge | ProgressBadge | undefined | null>;
	}

	export interface WebviewViewProvider {
		/**
		 * An optional event to provide activity data associated with this web view.
		 * When this tree data is displayed in the activity view, this activity value will be displayed
		 * as a badge alongside the activity view entry.
		 * To remove the activity data, pass undefined or null.
		 */
		onDidChangeActivity?: Event<NumberBadge | TextBadge | IconBadge | ProgressBadge | undefined | null>;
	}
}
