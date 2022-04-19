/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/144944

	export enum InputBoxValidationSeverity {
		Info = 1,
		Warning = 2,
		Error = 3
	}

	export interface InputBoxValidationMessage {
		readonly message: string;
		readonly severity: InputBoxValidationSeverity;
	}

	export interface InputBoxOptions {
		/**
		 * The validation message to display. This will become the new {@link InputBoxOptions#validateInput} upon finalization.
		 */
		validateInput2?(value: string): string | InputBoxValidationMessage | undefined | null |
			Thenable<string | InputBoxValidationMessage | undefined | null>;
	}

	export interface InputBox {
		/**
		 * The validation message to display. This will become the new {@link InputBox#validationMessage} upon finalization.
		 */
		validationMessage2: string | InputBoxValidationMessage | undefined;
	}
}
