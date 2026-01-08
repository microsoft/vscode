/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IChatPromptContentStore = createDecorator<IChatPromptContentStore>('chatPromptContentStore');

/**
 * Service for managing virtual chat prompt content.
 *
 * This store maintains an in-memory map of content indexed by URI.
 * URIs use the vscode-chat-prompt scheme with just the ID in the path,
 * avoiding the need to encode large content in the URI query string.
 */
export interface IChatPromptContentStore {
	readonly _serviceBrand: undefined;

	/**
	 * Registers content for a given URI.
	 * @param uri The URI to associate with the content.
	 * @param content The content to store.
	 * @returns A disposable that removes the content when disposed.
	 */
	registerContent(uri: URI, content: string): { dispose: () => void };

	/**
	 * Retrieves content by URI.
	 * @param uri The URI to look up.
	 * @returns The content if found, or undefined.
	 */
	getContent(uri: URI): string | undefined;
}

export class ChatPromptContentStore extends Disposable implements IChatPromptContentStore {
	readonly _serviceBrand: undefined;

	private readonly _contentMap = new Map<string, string>();

	constructor() {
		super();
	}

	registerContent(uri: URI, content: string): { dispose: () => void } {
		const key = uri.toString();
		this._contentMap.set(key, content);

		const dispose = () => {
			this._contentMap.delete(key);
		};

		return { dispose };
	}

	getContent(uri: URI): string | undefined {
		return this._contentMap.get(uri.toString());
	}

	override dispose(): void {
		this._contentMap.clear();
		super.dispose();
	}
}
