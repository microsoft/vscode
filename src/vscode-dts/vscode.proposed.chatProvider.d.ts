/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {


	// @API extension ship a d.ts files for their options

	// @API the LanguageModelChatProvider2 is an alternative that combines a source, like ollama etc, with
	// concrete models. The `provideLanguageModelChatData` would do the discovery and auth dances and later
	// the model data is passed to the concrete function for making a requested or counting token


	// TODO@API name scheme
	export interface LanguageModelChatResponseOptions {

		// initiator
		readonly extensionId: string;

		/**
		 * A set of options that control the behavior of the language model. These options are specific to the language model
		 * and need to be looked up in the respective documentation.
		 */
		readonly modelOptions: { [name: string]: any };

		/**
		 * An optional list of tools that are available to the language model. These could be registered tools available via
		 * {@link lm.tools}, or private tools that are just implemented within the calling extension.
		 *
		 * If the LLM requests to call one of these tools, it will return a {@link LanguageModelToolCallPart} in
		 * {@link LanguageModelChatResponse.stream}. It's the caller's responsibility to invoke the tool. If it's a tool
		 * registered in {@link lm.tools}, that means calling {@link lm.invokeTool}.
		 *
		 * Then, the tool result can be provided to the LLM by creating an Assistant-type {@link LanguageModelChatMessage} with a
		 * {@link LanguageModelToolCallPart}, followed by a User-type message with a {@link LanguageModelToolResultPart}.
		 */
		tools?: LanguageModelChatTool[];

		/**
		 * 	The tool-selecting mode to use. {@link LanguageModelChatToolMode.Auto} by default.
		 */
		toolMode?: LanguageModelChatToolMode;
	}

	export interface LanguageModelChatData {
		// like ChatResponseProviderMetadata
	}

	export interface LanguageModelChatProvider2 {

		provideLanguageModelChatData(options: { force: boolean }, token: CancellationToken): ProviderResult<LanguageModelChatData[]>;

		provideResponse(model: LanguageModelChatData, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: LanguageModelChatResponseOptions, progress: Progress<LanguageModelTextPart | LanguageModelToolCallPart>, token: CancellationToken): Thenable<any>;

		provideTokenCount(model: LanguageModelChatData, text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token: CancellationToken): Thenable<number>;
	}



	export interface ChatResponseFragment2 {
		index: number;
		part: LanguageModelTextPart | LanguageModelToolCallPart;
	}


	/**
	 * Represents a large language model that accepts ChatML messages and produces a streaming response
	*/
	export interface LanguageModelChatProvider {

		// TODO@API remove or keep proposed?
		onDidReceiveLanguageModelResponse2?: Event<{ readonly extensionId: string; readonly participant?: string; readonly tokenCount?: number }>;

		// TODO@API
		// have dedicated options, don't reuse the LanguageModelChatRequestOptions so that consumer and provider part of the API can develop independently
		provideLanguageModelResponse(messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: LanguageModelChatRequestOptions, extensionId: string, progress: Progress<ChatResponseFragment2>, token: CancellationToken): Thenable<any>;

		provideTokenCount(text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token: CancellationToken): Thenable<number>;
	}

	export type ChatResponseProvider = LanguageModelChatProvider;

	export interface ChatResponseProviderMetadata {

		readonly vendor: string;

		/**
		 * Human-readable name of the language model.
		 */
		readonly name: string;
		/**
		 * Opaque family-name of the language model. Values might be `gpt-3.5-turbo`, `gpt4`, `phi2`, or `llama`
		 * but they are defined by extensions contributing languages and subject to change.
		 */
		readonly family: string;

		/**
		 * An optional, human-readable description of the language model.
		 */
		readonly description?: string;

		/**
		 * An optional, human-readable string representing the cost of using the language model.
		 */
		readonly cost?: string;

		/**
		 * Opaque version string of the model. This is defined by the extension contributing the language model
		 * and subject to change while the identifier is stable.
		 */
		readonly version: string;

		readonly maxInputTokens: number;

		readonly maxOutputTokens: number;

		/**
		 * When present, this gates the use of `requestLanguageModelAccess` behind an authorization flow where
		 * the user must approve of another extension accessing the models contributed by this extension.
		 * Additionally, the extension can provide a label that will be shown in the UI.
		 */
		auth?: true | { label: string };

		// TODO@API maybe an enum, LanguageModelChatProviderPickerAvailability?
		readonly isDefault?: boolean;
		readonly isUserSelectable?: boolean;

		readonly capabilities?: {
			readonly vision?: boolean;

			// TODO@API should be `boolean | number` so extensions can express how many tools they support
			readonly toolCalling?: boolean;

			// TODO@API WHY is agentMode a capability? This seems wrong?
			readonly agentMode?: boolean;

			// TODO@API support prompt TSX style messages
			// readonly promptTsx?:boolean
		};

		/**
		 * Optional category to group models by in the model picker.
		 * The lower the order, the higher the category appears in the list.
		 * Has no effect if `isUserSelectable` is `false`.
		 * If not specified, the model will appear in the "Other Models" category.
		 */
		readonly category?: { label: string; order: number };
	}

	export interface ChatResponseProviderMetadata {
		// limit this provider to some extensions
		// TODO@API remove? unused?
		extensions?: string[];
	}

	export namespace lm {

		export function registerChatModelProvider(id: string, provider: LanguageModelChatProvider, metadata: ChatResponseProviderMetadata): Disposable;
	}

}
