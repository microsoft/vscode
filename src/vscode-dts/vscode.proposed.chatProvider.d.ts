/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

declare module 'vscode' {

	/**
	 * The provider version of {@linkcode LanguageModelChatRequestOptions}
	 */
	export interface LanguageModelChatRequestHandleOptions {

		/**
		 * What extension initiated the request to the language model
		 */
		readonly requestInitiator: string;

		/**
		 * A set of options that control the behavior of the language model. These options are specific to the language model
		 * and need to be looked up in the respective documentation.
		 */
		readonly modelOptions: { readonly [name: string]: any };

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
		readonly tools?: readonly LanguageModelChatTool[];

		/**
		 * 	The tool-selecting mode to use. {@link LanguageModelChatToolMode.Auto} by default.
		 */
		readonly toolMode?: LanguageModelChatToolMode;
	}

	/**
	 * All the information representing a single language model contributed by a {@linkcode LanguageModelChatProvider}.
	 */
	export interface LanguageModelChatInformation {

		/**
		 * Unique identifier for the language model. Must be unique per provider, but not required to be globally unique.
		 */
		readonly id: string;

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
		 * The tooltip to render when hovering the model
		 */
		readonly tooltip?: string;

		/**
		 * An optional, human-readable string which will be rendered alongside the model.
		 */
		readonly detail?: string;

		/**
		 * Opaque version string of the model. This is defined by the extension contributing the language model
		 * and subject to change while the identifier is stable.
		 */
		readonly version: string;

		/**
		 * The maximum number of tokens the model can accept as input.
		 */
		readonly maxInputTokens: number;

		/**
		 * The maximum number of tokens the model is capable of producing.
		 */
		readonly maxOutputTokens: number;

		/**
		 * When present, this gates the use of `requestLanguageModelAccess` behind an authorization flow where
		 * the user must approve of another extension accessing the models contributed by this extension.
		 * Additionally, the extension can provide a label that will be shown in the UI.
		 */
		requiresAuthorization?: true | { label: string };


		readonly capabilities?: {

			/**
			 * Whether image input is supported by the model.
			 * Common supported images are jpg and png, but each model will vary in supported mimetypes.
			 */
			readonly imageInput?: boolean;

			/**
			 * Whether tool calling is supported by the model.
			 * If a number is provided, that is the maximum number of tools a model can call.
			 */
			readonly toolCalling?: boolean | number;
		};

		/**
		 * Whether or not this will be selected by default in the model picker
		 * NOT BEING FINALIZED
		 */
		readonly isDefault?: boolean;

		/**
		 * Whether or not the model will show up in the model picker immediately upon being made known via {@linkcode LanguageModelChatProvider.prepareLanguageModelChatInformation}.
		 * NOT BEING FINALIZED
		 */
		readonly isUserSelectable?: boolean;

		/**
		 * Optional category to group models by in the model picker.
		 * The lower the order, the higher the category appears in the list.
		 * Has no effect if `isUserSelectable` is `false`.
		 *
		 * WONT BE FINALIZED
		 */
		readonly category?: { label: string; order: number };
	}

	/**
	 * The provider version of {@linkcode LanguageModelChatMessage}.
	 */
	export interface LanguageModelChatRequestMessage {
		/**
		 * The role of this message.
		 */
		readonly role: LanguageModelChatMessageRole;

		/**
		 * A string or heterogeneous array of things that a message can contain as content. Some parts may be message-type
		 * specific for some models.
		 */
		readonly content: ReadonlyArray<LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | unknown>;

		/**
		 * The optional name of a user for this message.
		 */
		readonly name: string | undefined;
	}

	export type LanguageModelResponsePart = LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart;

	/**
	 * Represents a Language model chat provider. This provider provides multiple models in a 1 provider to many model relationship
	 * An example of this would be how an OpenAI provider would provide models like gpt-5, o3, etc.
	 */
	export interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {

		/**
		 * Signals a change from the provider to the editor so that {@linkcode prepareLanguageModelChatInformation} is called again
		 */
		readonly onDidChangeLanguageModelInformation?: Event<void>;

		/**
		 * Get the list of available language models contributed by this provider
		 * @param options Options which specify the calling context of this function
		 * @param token A cancellation token which signals if the user cancelled the request or not
		 * @returns A promise that resolves to the list of available language models
		 */
		prepareLanguageModelChatInformation(options: PrepareLanguageModelChatModelOptions, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Returns the response for a chat request, passing the results to the progress callback
		 * @param model The language model to use
		 * @param messages The messages to include in the request
		 * @param options Options for the request
		 * @param progress The progress to emit the streamed response chunks to
		 * @param token A cancellation token for the request
		 * @returns A promise that resolves when the response is complete. Results are actually passed to the progress callback.
		 */
		provideLanguageModelChatResponse(model: T, messages: readonly LanguageModelChatRequestMessage[], options: LanguageModelChatRequestHandleOptions, progress: Progress<LanguageModelResponsePart>, token: CancellationToken): Thenable<void>;

		/**
		 * Returns the number of tokens for a given text using the model specific tokenizer logic
		 * @param model The language model to use
		 * @param text The text to count tokens for
		 * @param token A cancellation token for the request
		 * @returns A promise that resolves to the number of tokens
		 */
		provideTokenCount(model: T, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Thenable<number>;
	}

	export namespace lm {

		/**
		 * Registers a {@linkcode LanguageModelChatProvider}
		 * @param vendor The vendor for this provider. Must be globally unique
		 * @param provider The provider to register
		 * @returns A disposable that unregisters the provider when disposed
		 */
		export function registerLanguageModelChatProvider(vendor: string, provider: LanguageModelChatProvider): Disposable;
	}

	/**
	 * The list of options passed into {@linkcode LanguageModelChatProvider.prepareLanguageModelChatInformation}
	 */
	export interface PrepareLanguageModelChatModelOptions {
		/**
		 * Whether or not the user should be prompted via some UI flow, or if models should be attempted to be resolved silently.
		 * If silent is true, all models may not be resolved due to lack of info such as API keys.
		 */
		readonly silent: boolean;
	}
}
