/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/91555

	export enum StandardTokenType {
		Other = 0,
		Comment = 1,
		String = 2,
		RegEx = 3
	}

	export interface TokenInformation {
		type: StandardTokenType;
		range: Range;
	}

	export namespace languages {
		/** @deprecated */
		export function getTokenInformationAtPosition(document: TextDocument, position: Position): Thenable<TokenInformation>;
	}
}
