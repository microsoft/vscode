/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatAgentAttachmentCapabilities } from '../../common/participants/chatAgents.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionProviderOptionGroup, IChatSessionsExtensionPoint, IChatSessionsService, SessionOptionsChangedCallback } from '../../common/chatSessionsService.js';

export class MockChatSessionsService implements IChatSessionsService {
	_serviceBrand: undefined;

	private readonly _onDidChangeSessionOptions = new Emitter<URI>();
	readonly onDidChangeSessionOptions = this._onDidChangeSessionOptions.event;
	private readonly _onDidChangeItemsProviders = new Emitter<IChatSessionItemProvider>();
	readonly onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;

	private readonly _onDidChangeSessionItems = new Emitter<string>();
	readonly onDidChangeSessionItems = this._onDidChangeSessionItems.event;

	private readonly _onDidChangeAvailability = new Emitter<void>();
	readonly onDidChangeAvailability = this._onDidChangeAvailability.event;

	private readonly _onDidChangeInProgress = new Emitter<void>();
	readonly onDidChangeInProgress = this._onDidChangeInProgress.event;

	private readonly _onDidChangeContentProviderSchemes = new Emitter<{ readonly added: string[]; readonly removed: string[] }>();
	readonly onDidChangeContentProviderSchemes = this._onDidChangeContentProviderSchemes.event;

	private readonly _onDidChangeOptionGroups = new Emitter<string>();
	readonly onDidChangeOptionGroups = this._onDidChangeOptionGroups.event;

	private sessionItemProviders = new Map<string, IChatSessionItemProvider>();
	private contentProviders = new Map<string, IChatSessionContentProvider>();
	private contributions: IChatSessionsExtensionPoint[] = [];
	private optionGroups = new Map<string, IChatSessionProviderOptionGroup[]>();
	private sessionOptions = new ResourceMap<Map<string, string>>();
	private inProgress = new Map<string, number>();
	private onChange = () => { };

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
		this.sessionItemProviders.set(provider.chatSessionType, provider);
		return {
			dispose: () => {
				this.sessionItemProviders.delete(provider.chatSessionType);
			}
		};
	}

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[] {
		return this.contributions;
	}

	getChatSessionContribution(chatSessionType: string): IChatSessionsExtensionPoint | undefined {
		return this.contributions.find(contrib => contrib.type === chatSessionType);
	}

	setContributions(contributions: IChatSessionsExtensionPoint[]): void {
		this.contributions = contributions;
	}

	async activateChatSessionItemProvider(chatSessionType: string): Promise<IChatSessionItemProvider | undefined> {
		return this.sessionItemProviders.get(chatSessionType);
	}

	getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return Array.from(this.sessionItemProviders.values());
	}

	getIconForSessionType(chatSessionType: string): ThemeIcon | URI | undefined {
		const contribution = this.contributions.find(c => c.type === chatSessionType);
		return contribution?.icon && typeof contribution.icon === 'string' ? ThemeIcon.fromId(contribution.icon) : undefined;
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

	getAllChatSessionItems(token: CancellationToken): Promise<Array<{ readonly chatSessionType: string; readonly items: IChatSessionItem[] }>> {
		return Promise.all(Array.from(this.sessionItemProviders.values(), async provider => {
			return {
				chatSessionType: provider.chatSessionType,
				items: await provider.provideChatSessionItems(token),
			};
		}));
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
		this._onDidChangeContentProviderSchemes.fire({ added: [chatSessionType], removed: [] });
		return {
			dispose: () => {
				this.contentProviders.delete(chatSessionType);
			}
		};
	}

	async canResolveContentProvider(chatSessionType: string): Promise<boolean> {
		return this.contentProviders.has(chatSessionType);
	}

	async getOrCreateChatSession(sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
		const provider = this.contentProviders.get(sessionResource.scheme);
		if (!provider) {
			throw new Error(`No content provider for ${sessionResource.scheme}`);
		}
		return provider.provideChatSessionContent(sessionResource, token);
	}

	async canResolveChatSession(chatSessionResource: URI): Promise<boolean> {
		return this.contentProviders.has(chatSessionResource.scheme);
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

	private optionsChangeCallback?: SessionOptionsChangedCallback;

	setOptionsChangeCallback(callback: SessionOptionsChangedCallback): void {
		this.optionsChangeCallback = callback;
	}

	async notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string }>): Promise<void> {
		await this.optionsChangeCallback?.(sessionResource, updates);
	}

	notifySessionItemsChanged(chatSessionType: string): void {
		this._onDidChangeSessionItems.fire(chatSessionType);
	}

	getSessionOption(sessionResource: URI, optionId: string): string | undefined {
		return this.sessionOptions.get(sessionResource)?.get(optionId);
	}

	setSessionOption(sessionResource: URI, optionId: string, value: string): boolean {
		if (!this.sessionOptions.has(sessionResource)) {
			this.sessionOptions.set(sessionResource, new Map());
		}
		this.sessionOptions.get(sessionResource)!.set(optionId, value);
		return true;
	}

	hasAnySessionOptions(resource: URI): boolean {
		return this.sessionOptions.has(resource) && this.sessionOptions.get(resource)!.size > 0;
	}

	getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined {
		return this.contributions.find(c => c.type === chatSessionType)?.capabilities;
	}

	getContentProviderSchemes(): string[] {
		return Array.from(this.contentProviders.keys());
	}

	getInProgressSessionDescription(chatModel: IChatModel): string | undefined {
		return undefined;
	}

	registerChatModelChangeListeners(chatService: IChatService, chatSessionType: string, onChange: () => void): IDisposable {
		// Store the emitter so tests can trigger it
		this.onChange = onChange;
		return {
			dispose: () => {
			}
		};
	}

	// Helper method for tests to trigger progress events
	triggerProgressEvent(): void {
		if (this.onChange) {
			this.onChange();
		}
	}
}
