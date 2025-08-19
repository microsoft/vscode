/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	// TODO@API name scheme
	export interface LanguageModelChatRequestHandleOptions {

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

	export interface LanguageModelChatInformation {

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

		readonly maxInputTokens: number;

		readonly maxOutputTokens: number;

		/**
		 * When present, this gates the use of `requestLanguageModelAccess` behind an authorization flow where
		 * the user must approve of another extension accessing the models contributed by this extension.
		 * Additionally, the extension can provide a label that will be shown in the UI.
		 */
		auth?: true | { label: string };

		// TODO@API maybe an enum, LanguageModelChatProviderPickerAvailability?
		// TODO@API isPreselected proposed
		readonly isDefault?: boolean;

		// TODO@API nuke
		readonly isUserSelectable?: boolean;

		readonly capabilities?: {

			// TODO@API have mimeTypes that you support
			readonly vision?: boolean;

			// TODO@API should be `boolean | number` so extensions can express how many tools they support
			readonly toolCalling?: boolean | number;

		};

		/**
		 * Optional category to group models by in the model picker.
		 * The lower the order, the higher the category appears in the list.
		 * Has no effect if `isUserSelectable` is `false`.
		 */
		readonly category?: { label: string; order: number };
	}

	/**
	 * The provider version of @link {LanguageModelChatMessage}.
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
		readonly content: Array<LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | unknown>;

		/**
		 * The optional name of a user for this message.
		 */
		readonly name: string | undefined;
	}

	export interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {

		// signals a change from the provider to the editor so that prepareLanguageModelChat is called again
		onDidChangeLanguageModelInformation?: Event<void>;

		// NOT cacheable (between reloads)
		prepareLanguageModelChatInformation(options: PrepareLMChatModelOptions, token: CancellationToken): ProviderResult<T[]>;

		provideLanguageModelChatResponse(model: T, messages: Array<LanguageModelChatRequestMessage>, options: LanguageModelChatRequestHandleOptions, progress: Progress<LanguageModelTextPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart>, token: CancellationToken): Thenable<any>;

		provideTokenCount(model: T, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Thenable<number>;
	}

	export namespace lm {

		export function registerLanguageModelChatProvider(vendor: string, provider: LanguageModelChatProvider): Disposable;
	}

	export interface PrepareLMChatModelOptions {
		silent: boolean;
	}
}
