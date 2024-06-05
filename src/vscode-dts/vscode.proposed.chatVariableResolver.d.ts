/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace chat {

		/**
		 * Register a variable which can be used in a chat request to any participant.
		 * @param id A unique ID for the variable.
		 * @param name The name of the variable, to be used in the chat input as `#name`.
		 * @param userDescription A description of the variable for the chat input suggest widget.
		 * @param modelDescription A description of the variable for the model.
		 * @param isSlow Temp, to limit access to '#codebase' which is not a 'reference' and will fit into a tools API later.
		 * @param resolver Will be called to provide the chat variable's value when it is used.
		 * @param fullName The full name of the variable when selecting context in the picker UI.
		 * @param icon An icon to display when selecting context in the picker UI.
		 */
		export function registerChatVariableResolver(id: string, name: string, userDescription: string, modelDescription: string | undefined, isSlow: boolean | undefined, resolver: ChatVariableResolver, fullName?: string, icon?: ThemeIcon): Disposable;
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

		/**
		 * A callback to resolve the value of a chat variable.
		 * @param name The name of the variable.
		 * @param context Contextual information about this chat request.
		 * @param token A cancellation token.
		*/
		resolve2?(name: string, context: ChatVariableContext, stream: ChatVariableResolverResponseStream, token: CancellationToken): ProviderResult<ChatVariableValue[]>;
	}


	/**
	 * The detail level of this chat variable value.
	 */
	export enum ChatVariableLevel {
		Short = 1,
		Medium = 2,
		Full = 3
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

	export interface ChatVariableResolverResponseStream {
		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		 *
		 * @param value
		 * @returns This stream.
		 */
		progress(value: string): ChatVariableResolverResponseStream;

		/**
		 * Push a reference to this stream. Short-hand for
		 * `push(new ChatResponseReferencePart(value))`.
		 *
		 * *Note* that the reference is not rendered inline with the response.
		 *
		 * @param value A uri or location
		 * @returns This stream.
		 */
		reference(value: Uri | Location): ChatVariableResolverResponseStream;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: ChatVariableResolverResponsePart): ChatVariableResolverResponseStream;
	}

	export type ChatVariableResolverResponsePart = ChatResponseProgressPart | ChatResponseReferencePart;
}
