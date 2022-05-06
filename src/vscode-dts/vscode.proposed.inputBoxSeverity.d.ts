/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/144944

	/**
	 * Impacts the behavior and appearance of the validation message.
	 */
	export enum InputBoxValidationSeverity {
		Info = 1,
		Warning = 2,
		Error = 3
	}

	/**
	 * Object to configure the behavior of the validation message.
	 */
	export interface InputBoxValidationMessage {
		/**
		 * The validation message to display.
		 */
		readonly message: string;

		/**
		 * The severity of the validation message.
		 * NOTE: When using `InputBoxValidationSeverity.Error`, the user will not be allowed to accept (hit ENTER) the input.
		 * `Info` and `Warning` will still allow the InputBox to accept the input.
		 */
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
