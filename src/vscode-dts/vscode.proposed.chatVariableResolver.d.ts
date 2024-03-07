/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace chat {

		/**
		 * Register a variable which can be used in a chat request to any participant.
		 * @param name The name of the variable, to be used in the chat input as `#name`.
		 * @param description A description of the variable for the chat input suggest widget.
		 * @param resolver Will be called to provide the chat variable's value when it is used.
		 */
		export function registerChatVariableResolver(name: string, description: string, resolver: ChatVariableResolver): Disposable;
	}

	export interface ChatVariableValue {
		/**
		 * The detail level of this chat variable value. If possible, variable resolvers should try to offer shorter values that will consume fewer tokens in an LLM prompt.
		 */
		level: ChatVariableLevel;

		/**
		 * The variable's value, which can be included in an LLM prompt as-is, or the chat participant may decide to read the value and do something else with it.
		 */
		value: string | Uri;

		/**
		 * A description of this value, which could be provided to the LLM as a hint.
		 */
		description?: string;
	}

	// TODO@API align with ChatRequest
	export interface ChatVariableContext {
		/**
		 * The message entered by the user, which includes this variable.
		 */
		// TODO@API AS-IS, variables as types, agent/commands stripped
		prompt: string;

		// readonly variables: readonly ChatResolvedVariable[];
	}

	export interface ChatVariableResolver {
		/**
		 * A callback to resolve the value of a chat variable.
		 * @param name The name of the variable.
		 * @param context Contextual information about this chat request.
		 * @param token A cancellation token.
		 */
		resolve(name: string, context: ChatVariableContext, token: CancellationToken): ProviderResult<ChatVariableValue[]>;
	}

	export namespace chat {
		export function registerSkill(skill: ChatSkill): Disposable;

		export const skills: ReadonlyArray<ChatSkillDescription>;
		// Can non-chat participant AI actions invoke skills, just at any random time?
		// For chat participants, this should be part of the request
		export function invokeSkill(skillName: string, parameters: Object, token: CancellationToken): Thenable<any>;
	}

	export interface ChatSkillDescription {
		name: string;
		description: string;
		parametersSchema: any; // JSON schema
	}

	// Are these just commands with a schema for parameters?
	export interface ChatSkill extends ChatSkillDescription {
		// TODO@API Does it stream?
		// Is output only a string, or can it be structured data?
		// How does it ask for confirmation? This resolver would get some other resolver/accessor object that lets it ask to render some confirm dialog in chat.
		//  - In that case, this needs to be called via the chat participant query, not via the global namespace.
		resolve(parameters: any, token: CancellationToken): ProviderResult<any>;
	}
}
