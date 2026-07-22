/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/271104 @alexr00

	export type TabSelector = { uri: DocumentSelector } | { viewType: string };

	export namespace chat {

		/**
		 * Register a chat workspace context provider. Workspace context is automatically included in all chat requests.
		 *
		 * To ensure your extension is activated when chat context is requested, make sure to include the following activations events:
		 * - If your extension implements `provideWorkspaceChatContext` or `provideChatContextForResource`, find an activation event which is a good signal to activate.
		 *   Ex: `onLanguage:<languageId>`, `onWebviewPanel:<viewType>`, etc.`
		 * - If your extension implements `provideChatContextExplicit`, your extension will be automatically activated when the user requests explicit context.
		 *
		 * @param id Unique identifier for the provider.
		* @param provider The chat workspace context provider.
		*/
		export function registerChatWorkspaceContextProvider(id: string, provider: ChatWorkspaceContextProvider): Disposable;

		/**
		 * Register a chat explicit context provider. Explicit context items are shown as options when the user explicitly attaches context use the "Add Context" action in the chat input box.
		 *
		 * Explicit context providers should also be statically contributed in package.json using the `chatContext` contribution point.
		 *
		 * To ensure your extension is activated when chat context is requested, make sure to include the `onChatContextProvider:<id>` activation event in your `package.json`.
		 *
		 * @param id Unique identifier for the provider.
		 * @param provider The chat explicit context provider.
		 */
		export function registerChatAttachContextProvider(id: string, provider: ChatAttachContextProvider): Disposable;

		/**
		 * @deprecated
		 */
		export function registerChatExplicitContextProvider(id: string, provider: any): Disposable;


		/**
		 * Register a chat resource context provider. Resource context is provided for a specific resource.
		 * Make sure to pass a selector that matches the resource you want to provide context for.
		 *
		 * To ensure your extension is activated when chat context is requested, make sure to include the `onChatContextProvider:<id>` activation event in your `package.json`.
		 *
		 * @param selector Document selector to filter which resources the provider is called for.
		 * @param id Unique identifier for the provider.
		 * @param provider The chat resource context provider.
		 */
		export function registerChatTabContextProvider(selector: TabSelector, id: string, provider: ChatTabContextProvider): Disposable;

		/**
		 * @deprecated
		 */
		export function registerChatResourceContextProvider(selector: DocumentSelector, id: string, provider: any): Disposable;

	}

	export interface ChatContextItem {
		/**
		 * Icon for the context item.
		 * - If `iconPath` is not defined, no icon is shown.
		 * - If `iconPath` is a file or folder {@link ThemeIcon theme icon}, the icon is derived from {@link resourceUri} if `resourceUri` is defined.
		 * - Otherwise, `iconPath` is used.
		 */
		iconPath?: IconPath;
		/**
		 * Human readable label for the context item.
		 * If not set, the label is derived from {@link resourceUri}.
		 */
		label?: string;
		/**
		 * A resource URI for the context item.
		 * Used to derive the {@link label} and {@link icon} if they are not set.
		 */
		resourceUri?: Uri;
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
	//@api should we rename to ChatGlobalContextProvider?
	export interface ChatWorkspaceContextProvider<T extends ChatContextItem = ChatContextItem> {

		/**
		 * An optional event that should be fired when the workspace chat context has changed.
		 */
		onDidChangeWorkspaceChatContext?: Event<void>;

		/**
		 * Provide a list of chat context items to be included as workspace context for all chat requests.
		 * This should be used very sparingly to avoid providing useless context and to avoid using up the context window.
		 * A good example use case is to provide information about which branch the user is working on in a source control context.
		 *
		 * @param token A cancellation token.
		 */
		provideWorkspaceChatContext(token: CancellationToken): ProviderResult<T[]>;
	}

	export interface ChatAttachContextProvider<T extends ChatContextItem = ChatContextItem> {

		/**
		 * Provide a list of chat context items that a user can choose from. These context items are shown as options when the user explicitly attaches context.
		 * Chat context items can be provided without a `value`, as the `value` can be resolved later using `resolveChatContext`.
		 * `resolveChatContext` is only called for items that do not have a `value`.
		 *
		 * @param token A cancellation token.
		 */
		provideAttachChatContext(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * If a chat context item is provided without a `value`, this method is called to resolve the `value` for the item.
		 *
		 * @param context The context item to resolve.
		 * @param token A cancellation token.
		 */
		resolveAttachChatContext(context: T, token: CancellationToken): ProviderResult<ChatContextItem>;
	}

	export interface ChatTabContextProvider<T extends ChatContextItem = ChatContextItem> {

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
		// Can use active editor?\
		// Rename ChatTab to be consistent
		provideChatTabContext(options: { tab: Tab }, token: CancellationToken): ProviderResult<T | undefined>;

		/**
		 * If a chat context item is provided without a `value`, this method is called to resolve the `value` for the item.
		 *
		 * @param context The context item to resolve.
		 * @param token A cancellation token.
		 */
		resolveChatTabContext(context: T, token: CancellationToken): ProviderResult<ChatContextItem>;
	}
}
