/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatResponseFragment {
		index: number;
		part: string;
	}

	// @API extension ship a d.ts files for their options

	/**
	 * Represents a large language model that accepts ChatML messages and produces a streaming response
	 */
	export interface ChatResponseProvider {

		onDidReceiveLanguageModelResponse2?: Event<{ readonly extensionId: string; readonly participant?: string; readonly tokenCount?: number }>;

		provideLanguageModelResponse(messages: LanguageModelChatMessage[], options: { [name: string]: any }, extensionId: string, progress: Progress<ChatResponseFragment>, token: CancellationToken): Thenable<any>;

		provideTokenCount(text: string | LanguageModelChatMessage, token: CancellationToken): Thenable<number>;
	}

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
	}

	export interface ChatResponseProviderMetadata {
		// limit this provider to some extensions
		extensions?: string[];
	}

	export namespace chat {

		/**
		 * Register a LLM as chat response provider to the editor.
		 *
		 *
		 * @param id
		 * @param provider
		 * @param metadata
		 */
		export function registerChatResponseProvider(id: string, provider: ChatResponseProvider, metadata: ChatResponseProviderMetadata): Disposable;
	}

}
