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
import { IMarkdownString } from '../../../../base/common/htmlContent.js';

export const enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2
}

export interface IChatSessionsExtensionPoint {
	readonly id: string;
	readonly type: string;
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly extensionDescription: IRelaxedExtensionDescription;
	readonly when?: string;
}
export interface IChatSessionItem {
	id: string;
	label: string;
	iconPath?: URI | {
		light: URI;
		dark: URI;
	} | ThemeIcon;
	description?: string | IMarkdownString;
	status?: ChatSessionStatus;
	tooltip?: string | IMarkdownString;
}

export interface ChatSession extends IDisposable {
	readonly id: string;
	readonly onWillDispose: Event<void>;

	history: Array<
		| { type: 'request'; prompt: string }
		| { type: 'response'; parts: IChatProgress[] }>;

	readonly progressEvent?: Event<IChatProgress[]>;
	readonly interruptActiveResponseCallback?: () => Promise<boolean>;

	requestHandler?: (
		request: IChatAgentRequest,
		progress: (progress: IChatProgress[]) => void,
		history: [],
		token: CancellationToken
	) => Promise<void>;
}


export interface IChatSessionItemProvider {
	readonly chatSessionType: string;
	readonly onDidChangeChatSessionItems: Event<void>;
	provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]>;
}

export interface IChatSessionContentProvider {
	provideChatSessionContent(sessionId: string, token: CancellationToken): Promise<ChatSession>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;
	readonly onDidChangeAvailability: Event<void>;

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	getAllChatSessionContributions(): IChatSessionsExtensionPoint[];
	canResolveItemProvider(chatSessionType: string): Promise<boolean>;
	getAllChatSessionItemProviders(): IChatSessionItemProvider[];
	provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]>;

	registerChatSessionContentProvider(chatSessionType: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveContentProvider(chatSessionType: string): Promise<boolean>;
	provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken): Promise<ChatSession>;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
