/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IChatProgress } from './chatService.js';
import { IChatAgentRequest } from './chatAgents.js';
import { IRelaxedExtensionDescription } from '../../../../platform/extensions/common/extensions.js';

export interface IChatSessionsExtensionPoint {
	id: string;
	name: string;
	displayName: string;
	description: string;
	extensionDescription: IRelaxedExtensionDescription;
	when?: string;
}
export interface IChatSessionItem {

	id: string;
	label: string;
	iconPath?: URI | {
		light: URI;
		dark: URI;
	} | ThemeIcon;
}

export interface ChatSession extends IDisposable {
	readonly id: string;

	history: Array<
		| { type: 'request'; prompt: string }
		| { type: 'response'; parts: IChatProgress[] }>;

	readonly progressEvent?: Event<IChatProgress[]>;

	requestHandler?: (
		request: IChatAgentRequest,
		progress: (progress: IChatProgress[]) => void,
		history: [],
		token: CancellationToken
	) => Promise<void>;
}


export interface IChatSessionItemProvider {
	readonly chatSessionType: string;
	readonly label: string;
	provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]>;
}

export interface IChatSessionContentProvider {
	readonly chatSessionType: string;
	provideChatSessionContent(id: string, token: CancellationToken): Promise<ChatSession>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;
	readonly onDidChangeAvailability: Event<void>;
	registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable;
	getChatSessionContributions(): IChatSessionsExtensionPoint[];
	canResolveItemProvider(chatSessionType: string): Promise<boolean>;
	canResolveContentProvider(chatSessionType: string): Promise<boolean>;
	getChatSessionItemProviders(): IChatSessionItemProvider[];
	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	registerChatSessionContentProvider(provider: IChatSessionContentProvider): IDisposable;
	hasChatSessionItemProviders: boolean;
	provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]>;
	notifySessionItemsChange(chatSessionType: string): void;
	provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken): Promise<ChatSession>;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
