/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatPromptReference {
		/**
		 * The value of this reference. The `string | Uri | Location` types are used today, but this could expand in the future.
		 */
		readonly value: string | Uri | Location | ChatReferenceDiagnostic | unknown;
	}

	export class ChatReferenceDiagnostic {
		/**
		 * All attached diagnostics. An array of uri-diagnostics tuples or an empty array.
		 */
		readonly diagnostics: [Uri, Diagnostic[]][];

		protected constructor(diagnostics: [Uri, Diagnostic[]][]);
	}
}
