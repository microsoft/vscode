/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/129037

declare module 'vscode' {

	/**
	 * Represents the severity of a language status item.
	 */
	export enum LanguageStatusSeverity {
		Information = 0,
		Warning = 1,
		Error = 2
	}

	/**
	 * A language status item is the preferred way to present language status reports for the active text editors,
	 * such as selected linter or notifying about a configuration problem.
	 */
	export interface LanguageStatusItem {

		/**
		 * The identifier of this item.
		 */
		readonly id: string;

		/**
		 * The short name of this item, like 'Java Language Status', etc.
		 */
		name: string | undefined;

		/**
		 * A {@link DocumentSelector selector} that defines for what editors
		 * this item shows.
		 */
		selector: DocumentSelector;

		/**
		 * The severity of this item.
		 *
		 * Defaults to {@link LanguageStatusSeverity.Information information}. You can use this property to
		 * signal to users that there is a problem that needs attention, like a missing executable or an
		 * invalid configuration.
		 */
		severity: LanguageStatusSeverity;

		/**
		 * The text to show for the entry. You can embed icons in the text by leveraging the syntax:
		 *
		 * `My text $(icon-name) contains icons like $(icon-name) this one.`
		 *
		 * Where the icon-name is taken from the ThemeIcon [icon set](https://code.visualstudio.com/api/references/icons-in-labels#icon-listing), e.g.
		 * `light-bulb`, `thumbsup`, `zap` etc.
		 */
		text: string;

		/**
		 * Optional, human-readable details for this item.
		 */
		detail?: string;

		/**
		 * Controls whether the item is shown as "busy". Defaults to `false`.
		 */
		busy: boolean;

		/**
		 * A {@linkcode Command command} for this item.
		 */
		command: Command | undefined;

		/**
		 * Accessibility information used when a screen reader interacts with this item
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	namespace languages {
		/**
		 * Creates a new {@link LanguageStatusItem language status item}.
		 *
		 * @param id The identifier of the item.
		 * @param selector The document selector that defines for what editors the item shows.
		 */
		export function createLanguageStatusItem(id: string, selector: DocumentSelector): LanguageStatusItem;
	}
}
