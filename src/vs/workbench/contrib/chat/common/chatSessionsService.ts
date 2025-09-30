/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IRelaxedExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditableData } from '../../../common/views.js';
import { IChatAgentRequest } from './chatAgents.js';
import { IChatProgress } from './chatService.js';

export const enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2
}

export interface IChatSessionCommandContribution {
	name: string;
	description: string;
	when?: string;
}

export interface IChatSessionsExtensionPoint {
	readonly type: string;
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly extensionDescription: IRelaxedExtensionDescription;
	readonly when?: string;
	readonly capabilities?: {
		supportsFileAttachments?: boolean;
		supportsToolAttachments?: boolean;
	};
	readonly commands?: IChatSessionCommandContribution[];
}
export interface IChatSessionItem {
	id: string;
	label: string;
	iconPath?: ThemeIcon;
	description?: string | IMarkdownString;
	status?: ChatSessionStatus;
	tooltip?: string | IMarkdownString;
	timing?: {
		startTime: number;
		endTime?: number;
	};
	statistics?: {
		insertions: number;
		deletions: number;
	};

}

export type IChatSessionHistoryItem = { type: 'request'; prompt: string; participant: string } | { type: 'response'; parts: IChatProgress[]; participant: string };

export interface ChatSession extends IDisposable {
	readonly sessionId: string;
	readonly onWillDispose: Event<void>;
	history: Array<IChatSessionHistoryItem>;
	readonly progressObs?: IObservable<IChatProgress[]>;
	readonly isCompleteObs?: IObservable<boolean>;
	readonly interruptActiveResponseCallback?: () => Promise<boolean>;

	requestHandler?: (
		request: IChatAgentRequest,
		progress: (progress: IChatProgress[]) => void,
		history: any[], // TODO: Nail down types
		token: CancellationToken
	) => Promise<void>;
}

export interface IChatSessionItemProvider {
	readonly chatSessionType: string;
	readonly onDidChangeChatSessionItems: Event<void>;
	provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]>;
	provideNewChatSessionItem?(options: {
		request: IChatAgentRequest;
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem>;
}

export interface IChatSessionContentProvider {
	provideChatSessionContent(sessionId: string, token: CancellationToken): Promise<ChatSession>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;
	readonly onDidChangeAvailability: Event<void>;
	readonly onDidChangeInProgress: Event<void>;

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	getAllChatSessionContributions(): IChatSessionsExtensionPoint[];
	canResolveItemProvider(chatSessionType: string): Promise<boolean>;
	getAllChatSessionItemProviders(): IChatSessionItemProvider[];
	provideNewChatSessionItem(chatSessionType: string, options: {
		request: IChatAgentRequest;
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem>;
	provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]>;
	reportInProgress(chatSessionType: string, count: number): void;
	getInProgress(): { displayName: string; count: number }[];

	registerChatSessionContentProvider(chatSessionType: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveContentProvider(chatSessionType: string): Promise<boolean>;
	provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken): Promise<ChatSession>;

	// Editable session support
	setEditableSession(sessionId: string, data: IEditableData | null): Promise<void>;
	getEditableData(sessionId: string): IEditableData | undefined;
	isEditable(sessionId: string): boolean;

	// Notify providers about session items changes
	notifySessionItemsChanged(chatSessionType: string): void;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
