/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/62783 @matthewjamesadam

	/**
	 * Base class for badges
	 */
	export abstract class Badge {
		/**
		 * A label to present in tooltips
		 */
		readonly label: string;
	}

	/**
	 * A badge presenting a number
	 */
	export class NumberBadge extends Badge {

		/**
		 * Creates a new number badge.
		 *
		 * @param number The number to present
		 * @param label The label to present in tooltips
		 */
		constructor(number: number, label: string);

		/**
		 * The number to present
		 */
		readonly number: number;
	}

	export interface TreeView<T> {
		/**
		 * The badge to display for this TreeView.
		 * To remove the badge, set to undefined or null.
		 */
		badge?: Badge | undefined | null;
	}

	export interface WebviewView {
		/**
		 * The badge to display for this webview view.
		 * To remove the badge, set to undefined or null.
		 */
		badge?: Badge | undefined | null;
	}
}
