/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/129037

declare module 'vscode' {

	enum LanguageStatusSeverity {
		Information = 0,
		Warning = 1,
		Error = 2
	}

	interface LanguageStatusItem {
		readonly id: string;
		selector: DocumentSelector;
		// todo@jrieken replace with boolean ala needsAttention
		severity: LanguageStatusSeverity;
		name: string | undefined;
		text: string;
		detail?: string;
		command: Command | undefined;
		accessibilityInformation?: AccessibilityInformation;
		dispose(): void;
	}

	namespace languages {
		export function createLanguageStatusItem(id: string, selector: DocumentSelector): LanguageStatusItem;
	}
}
