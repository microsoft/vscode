/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

export interface IChatSessionsExtensionPoint {
	id: string;
	name: string;
	displayName: string;
	description: string;
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

export interface IChatSessionItemProvider {
	readonly chatSessionType: string;
	readonly label: string;
	provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;
	registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable;
	getChatSessionProviders(): IChatSessionsExtensionPoint[];
	getChatSessionItemProviders(): IChatSessionItemProvider[];
	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	hasChatSessionItemProviders: boolean;
	provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]>;
	notifySessionItemsChange(chatSessionType: string): void;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');

export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;
	private _itemsProviders: Map<string, IChatSessionItemProvider> = new Map();

	private readonly _onDidChangeItemsProviders = this._register(new Emitter<IChatSessionItemProvider>());
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider> = this._onDidChangeItemsProviders.event;
	private readonly _onDidChangeSessionItems = this._register(new Emitter<string>());
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;

	private _contributions: Map<string, IChatSessionsExtensionPoint> = new Map();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	public registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable {
		if (this._contributions.has(contribution.id)) {
			this._logService.warn(`Chat session contribution with id '${contribution.id}' is already registered.`);
			return { dispose: () => { } };
		}
		this._contributions.set(contribution.id, contribution);
		// const dynamicAgentDisposable = this.registerDynamicAgent(contribution);
		return {
			dispose: () => {
				this._contributions.delete(contribution.id);
				// dynamicAgentDisposable.dispose();
			}
		};
	}

	getChatSessionProviders(): IChatSessionsExtensionPoint[] {
		return Array.from(this._contributions.values());
	}

	getChatSessionItemProviders(): IChatSessionItemProvider[] {
		return [...this._itemsProviders.values()];
	}

	async canResolve(chatViewType: string) {
		if (this._itemsProviders.has(chatViewType)) {
			return true;
		}

		await this._extensionService.whenInstalledExtensionsRegistered();
		await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);

		return this._itemsProviders.has(chatViewType);
	}

	public notifySessionItemsChange(chatSessionType: string): void {
		this._onDidChangeSessionItems.fire(chatSessionType);
	}

	public async provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]> {
		if (!(await this.canResolve(chatSessionType))) {
			throw Error(`Can not find provider for ${chatSessionType}`);
		}

		const provider = this._itemsProviders.get(chatSessionType);

		if (provider?.provideChatSessionItems) {
			const sessions = await provider.provideChatSessionItems(token);
			return sessions;
		}

		return [];
	}

	public registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable {
		const chatSessionType = provider.chatSessionType;
		this._itemsProviders.set(chatSessionType, provider);
		this._onDidChangeItemsProviders.fire(provider);

		return {
			dispose: () => {
				const provider = this._itemsProviders.get(chatSessionType);
				if (provider) {
					this._itemsProviders.delete(chatSessionType);
					this._onDidChangeItemsProviders.fire(provider);
				}
			}
		};
	}

	public get hasChatSessionItemProviders(): boolean {
		return this._itemsProviders.size > 0;
	}
}

registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);

