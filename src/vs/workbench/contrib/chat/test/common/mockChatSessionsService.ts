/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { AsyncEmitter, Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatNewSessionRequest, IChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionOptionsWillNotifyExtensionEvent, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsExtensionPoint, IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../common/chatSessionsService.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatAgentAttachmentCapabilities } from '../../common/participants/chatAgents.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';

export class MockChatSessionsService implements IChatSessionsService {
	_serviceBrand: undefined;

	private readonly _onDidChangeSessionOptions = new Emitter<URI>();
	readonly onDidChangeSessionOptions = this._onDidChangeSessionOptions.event;
	private readonly _onDidChangeItemsProviders = new Emitter<{ readonly chatSessionType: string }>();
	readonly onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;

	private readonly _onDidChangeSessionItems = new Emitter<IChatSessionItemsDelta>();
	readonly onDidChangeSessionItems = this._onDidChangeSessionItems.event;

	private readonly _onDidChangeAvailability = new Emitter<void>();
	readonly onDidChangeAvailability = this._onDidChangeAvailability.event;

	private readonly _onDidChangeInProgress = new Emitter<void>();
	readonly onDidChangeInProgress = this._onDidChangeInProgress.event;

	private readonly _onDidChangeContentProviderSchemes = new Emitter<{ readonly added: string[]; readonly removed: string[] }>();
	readonly onDidChangeContentProviderSchemes = this._onDidChangeContentProviderSchemes.event;

	private readonly _onDidChangeOptionGroups = new Emitter<string>();
	readonly onDidChangeOptionGroups = this._onDidChangeOptionGroups.event;

	private readonly _onRequestNotifyExtension = new AsyncEmitter<IChatSessionOptionsWillNotifyExtensionEvent>();
	readonly onRequestNotifyExtension = this._onRequestNotifyExtension.event;

	private sessionItemControllers = new Map<string, { readonly controller: IChatSessionItemController; readonly initialRefresh: Promise<void> }>();
	private contentProviders = new Map<string, IChatSessionContentProvider>();
	private contributions: IChatSessionsExtensionPoint[] = [];
	private optionGroups = new Map<string, IChatSessionProviderOptionGroup[]>();
	private sessionOptions = new ResourceMap<Map<string, string>>();
	private inProgress = new Map<string, number>();

	// For testing: allow triggering events
	fireDidChangeItemsProviders(event: { chatSessionType: string }): void {
		this._onDidChangeItemsProviders.fire(event);
	}

	fireDidChangeSessionItems(event: IChatSessionItemsDelta): void {
		this._onDidChangeSessionItems.fire(event);
	}

	fireDidChangeAvailability(): void {
		this._onDidChangeAvailability.fire();
	}

	fireDidChangeInProgress(): void {
		this._onDidChangeInProgress.fire();
	}

	registerChatSessionItemController(chatSessionType: string, controller: IChatSessionItemController): IDisposable {
		this.sessionItemControllers.set(chatSessionType, { controller, initialRefresh: controller.refresh(CancellationToken.None) });
		return {
			dispose: () => {
				this.sessionItemControllers.delete(chatSessionType);
			}
		};
	}

	getAllChatSessionContributions(): ResolvedChatSessionsExtensionPoint[] {
		return this.contributions.map(contribution => this.resolveContribution(contribution));
	}

	getChatSessionContribution(chatSessionType: string): ResolvedChatSessionsExtensionPoint | undefined {
		const contribution = this.contributions.find(c => c.type === chatSessionType);
		if (!contribution) {
			return undefined;
		}

		return this.resolveContribution(contribution);
	}

	private resolveContribution(contribution: IChatSessionsExtensionPoint): ResolvedChatSessionsExtensionPoint {
		return {
			...contribution,
			icon: contribution.icon && typeof contribution.icon === 'string' ? ThemeIcon.fromId(contribution.icon) : undefined,
		};
	}

	setContributions(contributions: IChatSessionsExtensionPoint[]): void {
		this.contributions = contributions;
	}

	async activateChatSessionItemProvider(chatSessionType: string): Promise<void> {
		// Noop, nothing to activate
	}

	async *getChatSessionItems(providerTypeFilter: readonly string[] | undefined, token: CancellationToken): AsyncIterable<{ readonly chatSessionType: string; readonly items: readonly IChatSessionItem[] }> {
		for (const [chatSessionType, controllerEntry] of this.sessionItemControllers.entries()) {
			if (!providerTypeFilter || providerTypeFilter.includes(chatSessionType)) {
				await controllerEntry.initialRefresh; // ensure initial refresh is done
				yield {
					chatSessionType: chatSessionType,
					items: controllerEntry.controller.items
				};
			}
		}
	}

	async refreshChatSessionItems(providerTypeFilter: readonly string[] | undefined, token: CancellationToken): Promise<void> {
		await Promise.all(
			Array.from(this.sessionItemControllers.entries())
				.filter(([chatSessionType]) => !providerTypeFilter || providerTypeFilter.includes(chatSessionType))
				.map(async ([_chatSessionType, controllerEntry]) => {
					await controllerEntry.controller.refresh(token);
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

	async canResolveChatSession(sessionType: string): Promise<boolean> {
		return this.contentProviders.has(sessionType);
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

	getNewSessionOptionsForSessionType(_chatSessionType: string): Record<string, string | IChatSessionProviderOptionItem> | undefined {
		return undefined;
	}

	setNewSessionOptionsForSessionType(_chatSessionType: string, _options: Record<string, string | IChatSessionProviderOptionItem>): void {
		// noop
	}

	async notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>): Promise<void> {
		await this._onRequestNotifyExtension.fireAsync({ sessionResource, updates }, CancellationToken.None);
	}

	getSessionOptions(sessionResource: URI): Map<string, string> | undefined {
		const options = this.sessionOptions.get(sessionResource);
		return options && options.size > 0 ? options : undefined;
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

	getCustomAgentTargetForSessionType(chatSessionType: string): Target {
		return this.contributions.find(c => c.type === chatSessionType)?.customAgentTarget ?? Target.Undefined;
	}

	requiresCustomModelsForSessionType(chatSessionType: string): boolean {
		return this.contributions.find(c => c.type === chatSessionType)?.requiresCustomModels ?? false;
	}

	getContentProviderSchemes(): string[] {
		return Array.from(this.contentProviders.keys());
	}

	getInProgressSessionDescription(chatModel: IChatModel): string | undefined {
		return undefined;
	}

	async createNewChatSessionItem(_chatSessionType: string, _request: IChatNewSessionRequest, _token: CancellationToken): Promise<IChatSessionItem | undefined> {
		return undefined;
	}

	registerSessionResourceAlias(_untitledResource: URI, _realResource: URI): void {
		// noop
	}

	registerChatSessionContribution(contribution: IChatSessionsExtensionPoint): IDisposable {
		this.contributions.push(contribution);
		return {
			dispose: () => {
				const idx = this.contributions.indexOf(contribution);
				if (idx >= 0) {
					this.contributions.splice(idx, 1);
				}
			}
		};
	}
}
