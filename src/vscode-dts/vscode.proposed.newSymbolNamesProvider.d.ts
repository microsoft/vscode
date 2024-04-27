/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/204345 @ulugbekna

declare module 'vscode' {

	export enum NewSymbolNameTag {
		AIGenerated = 1
	}

	export enum NewSymbolNameTriggerKind {
		Invoke = 0,
		Automatic = 1,
	}

	export class NewSymbolName {
		readonly newSymbolName: string;
		readonly tags?: readonly NewSymbolNameTag[];

		constructor(newSymbolName: string, tags?: readonly NewSymbolNameTag[]);
	}

	export interface NewSymbolNamesProvider {

		/**
		 * @default false
		 */
		readonly supportsAutomaticTriggerKind?: Thenable<boolean>;

		/**
		 * Provide possible new names for the symbol at the given range.
		 *
		 * @param document The document in which the symbol is defined.
		 * @param range The range that spans the symbol being renamed.
		 * @param token A cancellation token.
		 * @return A list of new symbol names.
		 */
		provideNewSymbolNames(document: TextDocument, range: Range, triggerKind: NewSymbolNameTriggerKind, token: CancellationToken): ProviderResult<NewSymbolName[]>;
	}

	export namespace languages {
		export function registerNewSymbolNamesProvider(selector: DocumentSelector, provider: NewSymbolNamesProvider): Disposable;
	}
}
