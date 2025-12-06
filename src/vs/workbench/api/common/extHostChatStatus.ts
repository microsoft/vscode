/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';

export class ExtHostChatStatus {

	private readonly _proxy: extHostProtocol.MainThreadChatStatusShape;

	private readonly _items = new Map<string, vscode.ChatStatusItem>();

	constructor(
		mainContext: extHostProtocol.IMainContext
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadChatStatus);
	}

	createChatStatusItem(extension: IExtensionDescription, id: string): vscode.ChatStatusItem {
		const internalId = asChatItemIdentifier(extension.identifier, id);
		if (this._items.has(internalId)) {
			throw new Error(`Chat status item '${id}' already exists`);
		}

		const state: extHostProtocol.ChatStatusItemDto = {
			id: internalId,
			title: '',
			description: '',
			detail: '',
		};

		let disposed = false;
		let visible = false;
		const syncState = () => {
			if (disposed) {
				throw new Error('Chat status item is disposed');
			}

			if (!visible) {
				return;
			}

			this._proxy.$setEntry(id, state);
		};

		const item = Object.freeze<vscode.ChatStatusItem>({
			id: id,

			get title(): string | { label: string; link: string } {
				return state.title;
			},
			set title(value: string | { label: string; link: string }) {
				state.title = value;
				syncState();
			},

			get description(): string {
				return state.description;
			},
			set description(value: string) {
				state.description = value;
				syncState();
			},

			get detail(): string | undefined {
				return state.detail;
			},
			set detail(value: string | undefined) {
				state.detail = value;
				syncState();
			},

			show: () => {
				visible = true;
				syncState();
			},
			hide: () => {
				visible = false;
				this._proxy.$disposeEntry(id);
			},
			dispose: () => {
				disposed = true;
				this._proxy.$disposeEntry(id);
				this._items.delete(internalId);
			},
		});

		this._items.set(internalId, item);
		return item;
	}
}

function asChatItemIdentifier(extension: ExtensionIdentifier, id: string): string {
	return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}

