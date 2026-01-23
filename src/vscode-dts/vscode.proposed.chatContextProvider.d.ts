/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/271104 @alexr00

	export namespace chat {

		/**
		 * Register a chat context provider. Chat context can be provided:
		 * - For a resource. Make sure to pass a selector that matches the resource you want to provide context for.
		 *   Providers registered without a selector will not be called for resource-based context.
		 * - Explicitly. These context items are shown as options when the user explicitly attaches context.
		 *
		 * To ensure your extension is activated when chat context is requested, make sure to include the following activations events:
		 * - If your extension implements `provideWorkspaceChatContext` or `provideChatContextForResource`, find an activation event which is a good signal to activate.
		 *   Ex: `onLanguage:<languageId>`, `onWebviewPanel:<viewType>`, etc.`
		 * - If your extension implements `provideChatContextExplicit`, your extension will be automatically activated when the user requests explicit context.
		 *
		 * @param selector Optional document selector to filter which resources the provider is called for. If omitted, the provider will only be called for explicit context requests.
		 * @param id Unique identifier for the provider.
		 * @param provider The chat context provider.
		 */
		export function registerChatContextProvider(selector: DocumentSelector | undefined, id: string, provider: ChatContextProvider): Disposable;

	}

	export interface ChatContextItem {
		/**
		 * Icon for the context item.
		 */
		icon: ThemeIcon;
		/**
		 * Human readable label for the context item.
		 */
		label: string;
		/**
		 * An optional description of the context item, e.g. to describe the item to the language model.
		 */
		modelDescription?: string;
		/**
		 * An optional tooltip to show when hovering over the context item in the UI.
		 */
		tooltip?: MarkdownString;
		/**
		 * The value of the context item. Can be omitted when returned from one of the `provide` methods if the provider supports `resolveChatContext`.
		 */
		value?: string;
		/**
		 * An optional command that is executed when the context item is clicked.
		 * The original context item will be passed as the first argument to the command.
		 */
		command?: Command;
	}

	export interface ChatContextProvider<T extends ChatContextItem = ChatContextItem> {

		/**
		 * An optional event that should be fired when the workspace chat context has changed.
		 */
		onDidChangeWorkspaceChatContext?: Event<void>;

		/**
		 * TODO @API: should this be a separate provider interface?
		 *
		 * Provide a list of chat context items to be included as workspace context for all chat requests.
		 * This should be used very sparingly to avoid providing useless context and to avoid using up the context window.
		 * A good example use case is to provide information about which branch the user is working on in a source control context.
		 *
		 * @param token A cancellation token.
		 */
		provideWorkspaceChatContext?(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Provide a list of chat context items that a user can choose from. These context items are shown as options when the user explicitly attaches context.
		 * Chat context items can be provided without a `value`, as the `value` can be resolved later using `resolveChatContext`.
		 * `resolveChatContext` is only called for items that do not have a `value`.
		 *
		 * @param token A cancellation token.
		 */
		provideChatContextExplicit?(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given a particular resource, provide a chat context item for it. This is used for implicit context (see the settings `chat.implicitContext.enabled` and `chat.implicitContext.suggestedContext`).
		 * Chat context items can be provided without a `value`, as the `value` can be resolved later using `resolveChatContext`.
		 * `resolveChatContext` is only called for items that do not have a `value`.
		 *
		 * Called when the resource is a webview or a text editor.
		 *
		 * @param options Options include the resource for which to provide context.
		 * @param token A cancellation token.
		 */
		provideChatContextForResource?(options: { resource: Uri }, token: CancellationToken): ProviderResult<T | undefined>;

		/**
		 * If a chat context item is provided without a `value`, from either of the `provide` methods, this method is called to resolve the `value` for the item.
		 *
		 * @param context The context item to resolve.
		 * @param token A cancellation token.
		 */
		resolveChatContext(context: T, token: CancellationToken): ProviderResult<ChatContextItem>;
	}

}
