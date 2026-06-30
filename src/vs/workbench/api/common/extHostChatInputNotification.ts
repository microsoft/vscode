/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';

export class ExtHostChatInputNotification {

	private readonly _proxy: extHostProtocol.MainThreadChatInputNotificationShape;

	private readonly _items = new Map<string, vscode.ChatInputNotification>();

	constructor(
		mainContext: extHostProtocol.IMainContext
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadChatInputNotification);
	}

	createInputNotification(extension: IExtensionDescription, id: string): vscode.ChatInputNotification {
		const internalId = asNotificationIdentifier(extension.identifier, id);
		if (this._items.has(internalId)) {
			throw new Error(`Chat input notification '${id}' already exists`);
		}

		const state: extHostProtocol.ChatInputNotificationDto = {
			id: internalId,
			severity: extHostProtocol.ChatInputNotificationSeverityDto.Info,
			message: '',
			description: undefined,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
		};

		let disposed = false;
		let visible = false;
		const syncState = () => {
			if (disposed) {
				throw new Error('Chat input notification is disposed');
			}

			if (!visible) {
				return;
			}

			this._proxy.$setNotification({ ...state });
		};

		const item = Object.freeze<vscode.ChatInputNotification>({
			id,

			get severity(): vscode.ChatInputNotificationSeverity {
				return state.severity as number as vscode.ChatInputNotificationSeverity;
			},
			set severity(value: vscode.ChatInputNotificationSeverity) {
				state.severity = value as number as extHostProtocol.ChatInputNotificationSeverityDto;
				syncState();
			},

			get message(): string {
				return state.message;
			},
			set message(value: string) {
				state.message = value;
				syncState();
			},

			get description(): string | undefined {
				return state.description;
			},
			set description(value: string | undefined) {
				state.description = value;
				syncState();
			},

			get actions(): vscode.ChatInputNotificationAction[] {
				return state.actions;
			},
			set actions(value: vscode.ChatInputNotificationAction[]) {
				state.actions = value.map(a => ({ label: a.label, commandId: a.commandId, commandArgs: a.commandArgs }));
				syncState();
			},

			get dismissible(): boolean {
				return state.dismissible;
			},
			set dismissible(value: boolean) {
				state.dismissible = value;
				syncState();
			},

			get autoDismissOnMessage(): boolean {
				return state.autoDismissOnMessage;
			},
			set autoDismissOnMessage(value: boolean) {
				state.autoDismissOnMessage = value;
				syncState();
			},

			show: () => {
				visible = true;
				syncState();
			},
			hide: () => {
				if (disposed) {
					return;
				}
				visible = false;
				this._proxy.$disposeNotification(internalId);
			},
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				visible = false;
				this._proxy.$disposeNotification(internalId);
				this._items.delete(internalId);
			},
		});

		this._items.set(internalId, item);
		return item;
	}
}

function asNotificationIdentifier(extension: ExtensionIdentifier, id: string): string {
	return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
