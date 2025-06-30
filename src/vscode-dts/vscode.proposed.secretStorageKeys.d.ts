/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/196616

	export interface SecretStorage {
		/**
		 * Retrieve the keys of all the secrets stored by this extension.
		 */
		keys(): Thenable<string[] | undefined>;
	}
}
