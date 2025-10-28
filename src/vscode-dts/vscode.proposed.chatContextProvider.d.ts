/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/271104 @alexr00

	export namespace workspace {

		// TODO@alexr00 API:
		// selector is confusing
		// id is from `ChatPromptReference`
		export function registerChatContextProvider(selector: DocumentSelector, id: string, provider: ChatContextProvider): Disposable;

	}

	export interface ChatContextItem {
		icon: ThemeIcon;
		label: string;
		modelDescription?: string;
		value?: string;
	}

	export interface ChatContextProvider<T extends ChatContextItem = ChatContextItem> {

		provideChatContext?(options: {}, token: CancellationToken): ProviderResult<T[] | undefined>;

		provideChatContextForResource?(resource: Uri, options: {}, token: CancellationToken): ProviderResult<T | undefined>;
		resolveChatContext(context: T, token: CancellationToken): ProviderResult<ChatContextItem>;
	}

}
