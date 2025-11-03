/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/271104 @alexr00

	export namespace chat {

		// TODO@alexr00 API:
		// selector is confusing
		export function registerChatContextProvider(selector: DocumentSelector, id: string, provider: ChatContextProvider): Disposable;

	}

	export interface ChatContextItem {
		icon: ThemeIcon;
		label: string;
		modelDescription?: string;
		value?: string;
	}

	export interface ChatContextProvider<T extends ChatContextItem = ChatContextItem> {

		/**
		 * Provide a list of chat context items that a user can choose from. These context items are shown as options when the user explicitly attaches context.
		 * Chat context items can be provided without a `value`, as the `value` can be resolved later using `resolveChatContext`.
		 * `resolveChatContext` is only called for items that do not have a `value`.
		 *
		 * @param options
		 * @param token
		 */
		provideChatContextExplicit?(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given a particular resource, provide a chat context item for it. This is used for implicit context (see the settings `chat.implicitContext.enabled` and `chat.implicitContext.suggestedContext`).
		 * Chat context items can be provided without a `value`, as the `value` can be resolved later using `resolveChatContext`.
		 * `resolveChatContext` is only called for items that do not have a `value`.
		 *
		 * @param resource
		 * @param options
		 * @param token
		 */
		provideChatContextForResource?(options: { resource: Uri }, token: CancellationToken): ProviderResult<T | undefined>;

		/**
		 * If a chat context item is provided without a `value`, from either of the `provide` methods, this method is called to resolve the `value` for the item.
		 *
		 * @param context
		 * @param token
		 */
		resolveChatContext(context: T, token: CancellationToken): ProviderResult<ChatContextItem>;
	}

}
