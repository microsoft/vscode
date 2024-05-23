/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace chat {

		/**
		 * Register a variable which can be used in a chat request to any participant.
		 * TODO@API these would also have static registration and most of these props would be in the package.json
		 * @param id A unique ID for the variable.
		 * @param name The name of the variable, to be used in the chat input as `#name`.
		 * @param fullName The full name of the variable when selecting context in the picker UI.
		 * @param userDescription A description of the variable for the chat input suggest widget.
		 * @param icon An icon to display when selecting context in the picker UI.
		 * @param resolver Will be called to provide the chat variable's value when it is used.
		 */
		export function registerChatReferenceResolver(id: string, name: string, fullName: string, userDescription: string, icon: ThemeIcon | undefined, resolver: ChatVariableResolver): Disposable;

		/**
		 * Attaches a chat context with the specified name, value, and location.
		 *
		 * @param name - The name of the chat context.
		 * @param value - The value of the chat context.
		 * @param location - The location of the chat context.
		 */
		export function attachContext(name: string, value: string | Uri | Location | unknown, location: ChatLocation.Panel): void;
	}

	export interface ChatVariableValue {
		/**
		 * The variable's value, which can be included in a prompt as-is, or the chat participant may decide to read the value and do something else with it.
		 */
		value: string | Uri | Location;

		/**
		 * A description of this value, which could be provided to the language model as a hint.
		 * TODO@API this drives `ChatPromptReference.modelDescription`
		 */
		description?: string;

		/**
		 * An optional string representation of the value which could be provided to the language model.
		 * TODO@API is it really needed? Participants can choose to resolve 'value' at the moment they receive the prompt.
		 */
		stringValue?: string;
	}

	export interface ChatPromptReference {
		stringValue?: string;
	}

	export interface ChatVariableResolver {
		/**
		 * A callback to resolve the value of a chat variable.
		 * @param token A cancellation token.
		 */
		resolve(token: CancellationToken): ProviderResult<ChatVariableValue>;
	}
}
