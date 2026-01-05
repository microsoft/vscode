/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import * as languages from '../../../editor/common/languages.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostChatInlineCompletionsShape, IMainContext, MainContext, MainThreadChatInlineCompletionsShape } from './extHost.protocol.js';
import * as typeConvert from './extHostTypeConverters.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';

/**
 * Adapter for a single chat inline completion provider.
 * Converts between VS Code API types and internal language service types.
 */
class ChatInlineCompletionAdapter {
	constructor(
		private readonly _provider: vscode.ChatInlineCompletionItemProvider
	) { }

	async provideInlineCompletions(
		input: string,
		position: number,
		token: CancellationToken
	): Promise<languages.InlineCompletions | undefined> {
		const result = await this._provider.provideChatInlineCompletionItems(input, position, token);

		if (!result) {
			return undefined;
		}

		// Normalize result format: VS Code API allows providers to return either
		// an array of items (convenience) or an InlineCompletionList object (with metadata).
		// Both formats are converted to the internal InlineCompletions structure.
		const items = Array.isArray(result) ? result : result.items;

		return {
			items: items.map(item => this._convertInlineCompletionItem(item)),
		};
	}

	/**
	 * Converts VS Code API inline completion item to internal language service format.
	 * Handles both string insertText and SnippetString insertText with optional range.
	 */
	private _convertInlineCompletionItem(item: vscode.InlineCompletionItem): languages.InlineCompletion {
		return {
			insertText: typeof item.insertText === 'string' ? item.insertText : { snippet: item.insertText.value },
			range: item.range ? typeConvert.Range.from(item.range) : undefined,
		};
	}
}

/**
 * Extension host bridge for chat inline completions.
 * Manages providers registered by extensions and converts between VS Code API types
 * and internal language service types. Handles cross-process RPC communication.
 */
export class ExtHostChatInlineCompletions extends Disposable implements ExtHostChatInlineCompletionsShape {
	/**
	 * Auto-incrementing handle pool for provider identification.
	 * Each provider gets a unique numeric ID used for RPC communication across process boundaries.
	 */
	private static _handlePool: number = 0;

	private readonly _proxy: MainThreadChatInlineCompletionsShape;
	private readonly _providers = new Map<number, ChatInlineCompletionAdapter>();

	constructor(
		mainContext: IMainContext,
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatInlineCompletions);
	}

	registerChatInlineCompletionsProvider(extension: IExtensionDescription, provider: vscode.ChatInlineCompletionItemProvider): vscode.Disposable {
		checkProposedApiEnabled(extension, 'chatInlineCompletions');

		const handle = ExtHostChatInlineCompletions._handlePool++;
		const adapter = new ChatInlineCompletionAdapter(provider);
		this._providers.set(handle, adapter);
		this._proxy.$registerChatInlineCompletionsProvider(handle);

		return toDisposable(() => {
			this._providers.delete(handle);
			this._proxy.$unregisterChatInlineCompletionsProvider(handle);
		});
	}

	async $provideChatInlineCompletions(
		handle: number,
		input: string,
		position: number,
		token: CancellationToken
	): Promise<languages.InlineCompletions | undefined> {
		const adapter = this._providers.get(handle);
		if (!adapter) {
			return undefined;
		}

		return adapter.provideInlineCompletions(input, position, token);
	}
}
