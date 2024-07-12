/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace chat {

		/**
		 * Register a custom instruction provider that can list available instructions as wel as resolve them.
		 * @param provider An icon to display when selecting context in the picker UI.
		 */
		export function registerCustomInstructionProvider(provider: ChatCustomInstructionProvider): Disposable;
	}

	export interface ChatContext {
		/**
		 * User defined instructions for the LLM
		 */
		customInstructions?: ChatCustomInstruction[];

	}

	export interface ChatCustomInstructionProvider {
		provideCustomInstructions(token: CancellationToken): ProviderResult<ChatCustomInstruction[]>;
	}


	export class ChatCustomInstruction {
		readonly name: string;
		readonly resource: Uri;

		constructor(name: string, resource: Uri);
	}

}
