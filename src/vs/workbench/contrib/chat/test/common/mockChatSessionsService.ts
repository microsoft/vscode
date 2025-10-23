/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatAgentAttachmentCapabilities, IChatAgentRequest } from '../../common/chatAgents.js';
import { ChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionProviderOptionGroup, IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { IEditableData } from '../../../../common/views.js';

export class MockChatSessionsService implements IChatSessionsService {
	_serviceBrand: undefined;

	private readonly _onDidChangeItemsProviders = new Emitter<IChatSessionItemProvider>();
	readonly onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;

	private readonly _onDidChangeSessionItems = new Emitter<string>();
	readonly onDidChangeSessionItems = this._onDidChangeSessionItems.event;

	private readonly _onDidChangeAvailability = new Emitter<void>();
	readonly onDidChangeAvailability = this._onDidChangeAvailability.event;

	private readonly _onDidChangeInProgress = new Emitter<void>();
	readonly onDidChangeInProgress = this._onDidChangeInProgress.event;

	private providers = new Map<string, IChatSessionItemProvider>();
	private contentProviders = new Map<string, IChatSessionContentProvider>();
	private contributions: IChatSessionsExtensionPoint[] = [];
	private optionGroups = new Map<string, IChatSessionProviderOptionGroup[]>();
	private sessionOptions = new Map<string, Map<string, string>>();
	private editableData = new Map<string, IEditableData>();
	private inProgress = new Map<string, number>();

	// For testing: allow triggering events
	fireDidChangeItemsProviders(provider: IChatSessionItemProvider): void {
		this._onDidChangeItemsProviders.fire(provider);
	}

	fireDidChangeSessionItems(chatSessionType: string): void {
		this._onDidChangeSessionItems.fire(chatSessionType);
	}

	fireDidChangeAvailability(): void {
		this._onDidChangeAvailability.fire();
	}

	fireDidChangeInProgress(): void {
		this._onDidChangeInProgress.fire();
	}

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable {
		this.providers.set(provider.chatSessionType, provider);
		return {
			dispose: () => {
				this.providers.delete(provider.chatSessionType);
			}
		};
	}

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[] {
		return this.contributions;
	}

	setContributions(contributions: IChatSessionsExtensionPoint[]): void {
		this.contributions = contributions;
	}

	async canResolveItemProvider(chatSessionType: string): Promise<boolean> {
		return this.providers.has(chatSessionType);
	}

	getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return Array.from(this.providers.values());
	}

	getIconForSessionType(chatSessionType: string): ThemeIcon | undefined {
		const contribution = this.contributions.find(c => c.type === chatSessionType);
		return contribution?.icon ? ThemeIcon.fromId(contribution.icon) : undefined;
	}

	getWelcomeTitleForSessionType(chatSessionType: string): string | undefined {
		return this.contributions.find(c => c.type === chatSessionType)?.welcomeTitle;
	}

	getWelcomeMessageForSessionType(chatSessionType: string): string | undefined {
		return this.contributions.find(c => c.type === chatSessionType)?.welcomeMessage;
	}

	getInputPlaceholderForSessionType(chatSessionType: string): string | undefined {
		return this.contributions.find(c => c.type === chatSessionType)?.inputPlaceholder;
	}

	getWelcomeTipsForSessionType(chatSessionType: string): string | undefined {
		return this.contributions.find(c => c.type === chatSessionType)?.welcomeTips;
	}

	async provideNewChatSessionItem(chatSessionType: string, options: { request: IChatAgentRequest; metadata?: unknown }, token: CancellationToken): Promise<IChatSessionItem> {
		const provider = this.providers.get(chatSessionType);
		if (!provider?.provideNewChatSessionItem) {
			throw new Error(`No provider for ${chatSessionType}`);
		}
		return provider.provideNewChatSessionItem(options, token);
	}

	async provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]> {
		const provider = this.providers.get(chatSessionType);
		if (!provider) {
			return [];
		}
		return provider.provideChatSessionItems(token);
	}

	reportInProgress(chatSessionType: string, count: number): void {
		this.inProgress.set(chatSessionType, count);
		this._onDidChangeInProgress.fire();
	}

	getInProgress(): { displayName: string; count: number }[] {
		return Array.from(this.inProgress.entries()).map(([displayName, count]) => ({ displayName, count }));
	}

	registerChatSessionContentProvider(chatSessionType: string, provider: IChatSessionContentProvider): IDisposable {
		this.contentProviders.set(chatSessionType, provider);
		return {
			dispose: () => {
				this.contentProviders.delete(chatSessionType);
			}
		};
	}

	async canResolveContentProvider(chatSessionType: string): Promise<boolean> {
		return this.contentProviders.has(chatSessionType);
	}

	async provideChatSessionContent(chatSessionType: string, id: string, sessionResource: URI, token: CancellationToken): Promise<ChatSession> {
		const provider = this.contentProviders.get(chatSessionType);
		if (!provider) {
			throw new Error(`No content provider for ${chatSessionType}`);
		}
		return provider.provideChatSessionContent(id, sessionResource, token);
	}

	getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined {
		return this.optionGroups.get(chatSessionType);
	}

	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void {
		if (optionGroups) {
			this.optionGroups.set(chatSessionType, optionGroups);
		} else {
			this.optionGroups.delete(chatSessionType);
		}
	}

	private optionsChangeCallback?: (chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>) => Promise<void>;

	setOptionsChangeCallback(callback: (chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>) => Promise<void>): void {
		this.optionsChangeCallback = callback;
	}

	async notifySessionOptionsChange(chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>): Promise<void> {
		if (this.optionsChangeCallback) {
			await this.optionsChangeCallback(chatSessionType, sessionId, updates);
		}
	}

	async setEditableSession(sessionId: string, data: IEditableData | null): Promise<void> {
		if (data) {
			this.editableData.set(sessionId, data);
		} else {
			this.editableData.delete(sessionId);
		}
	}

	getEditableData(sessionId: string): IEditableData | undefined {
		return this.editableData.get(sessionId);
	}

	isEditable(sessionId: string): boolean {
		return this.editableData.has(sessionId);
	}

	notifySessionItemsChanged(chatSessionType: string): void {
		this._onDidChangeSessionItems.fire(chatSessionType);
	}

	getSessionOption(chatSessionType: string, sessionId: string, optionId: string): string | undefined {
		const sessionKey = `${chatSessionType}:${sessionId}`;
		return this.sessionOptions.get(sessionKey)?.get(optionId);
	}

	setSessionOption(chatSessionType: string, sessionId: string, optionId: string, value: string): boolean {
		const sessionKey = `${chatSessionType}:${sessionId}`;
		if (!this.sessionOptions.has(sessionKey)) {
			this.sessionOptions.set(sessionKey, new Map());
		}
		this.sessionOptions.get(sessionKey)!.set(optionId, value);
		return true;
	}

	getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined {
		return this.contributions.find(c => c.type === chatSessionType)?.capabilities;
	}
}
