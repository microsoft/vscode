/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IMessageStore = createDecorator<IMessageStore>('messageStore');

export interface IMessageStore {
	readonly _serviceBrand: undefined;

	addMessageWithId(message: any): void;
	getMessage(id: number): any | undefined;
	updateMessage(id: number, updates: any): boolean;
	deleteMessage(id: number): boolean;
	getAllMessages(): any[];
	getMessages(limit?: number, offset?: number): any[];
	getMessageCount(): number;
	clear(): void;
	loadMessages(messages: any[]): void;
}
