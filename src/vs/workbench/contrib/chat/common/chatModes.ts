/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatAgentService } from './chatAgents.js';
import { ChatContextKeys } from './chatContextKeys.js';
import { ChatMode, modeToString } from './constants.js';
import { ICustomChatMode, IPromptsService } from './promptSyntax/service/promptsService.js';

export const IChatModeService = createDecorator<IChatModeService>('chatModeService');
export interface IChatModeService {
	readonly _serviceBrand: undefined;

	onDidChangeChatModes: Event<void>;
	getModes(): { builtin: readonly IChatMode2[]; custom: readonly IChatMode2[] };
	getModesAsync(): Promise<{ builtin: readonly IChatMode2[]; custom: readonly IChatMode2[] }>;
	findModeById(id: string): IChatMode2 | undefined;
}

export class ChatModeService extends Disposable implements IChatModeService {
	declare readonly _serviceBrand: undefined;

	private static readonly CUSTOM_MODES_STORAGE_KEY = 'chat.customModes';

	private readonly hasCustomModes: IContextKey<boolean>;
	private readonly _customModeInstances = new Map<string, CustomChatMode>();

	private readonly _onDidChangeChatModes = new Emitter<void>();
	public readonly onDidChangeChatModes = this._onDidChangeChatModes.event;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		// Load cached modes from storage first
		this.loadCachedModes();

		void this.refreshCustomPromptModes(true);
		this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);
		this._register(this.promptsService.onDidChangeCustomChatModes(() => {
			void this.refreshCustomPromptModes(true);
		}));
		this._register(this.storageService.onWillSaveState(() => this.saveCachedModes()));
	}

	private loadCachedModes(): void {
		try {
			const cachedCustomModes = this.storageService.getObject(ChatModeService.CUSTOM_MODES_STORAGE_KEY, StorageScope.WORKSPACE);
			if (cachedCustomModes) {
				this.deserializeCachedModes(cachedCustomModes);
			}
		} catch (error) {
			this.logService.error(error, 'Failed to load cached custom chat modes');
		}
	}

	private deserializeCachedModes(cachedCustomModes: any): void {
		if (!Array.isArray(cachedCustomModes)) {
			this.logService.error('Invalid cached custom modes data: expected array');
			return;
		}

		for (const cachedMode of cachedCustomModes) {
			if (isCachedChatModeData(cachedMode) && cachedMode.uri) {
				try {
					const uri = URI.revive(cachedMode.uri);
					const customChatMode: ICustomChatMode = {
						uri,
						name: cachedMode.name,
						description: cachedMode.description,
						tools: cachedMode.customTools,
						body: cachedMode.body || ''
					};
					const instance = new CustomChatMode(customChatMode);
					this._customModeInstances.set(uri.toString(), instance);
				} catch (error) {
					this.logService.error(error, 'Failed to create custom chat mode instance from cached data');
				}
			}
		}

		this.hasCustomModes.set(this._customModeInstances.size > 0);
	}

	private saveCachedModes(): void {
		try {
			const modesToCache = Array.from(this._customModeInstances.values());
			this.storageService.store(ChatModeService.CUSTOM_MODES_STORAGE_KEY, modesToCache, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} catch (error) {
			this.logService.warn('Failed to save cached custom chat modes', error);
		}
	}

	private async refreshCustomPromptModes(fireChangeEvent?: boolean): Promise<void> {
		try {
			const customModes = await this.promptsService.getCustomChatModes(CancellationToken.None);

			// Create a new set of mode instances, reusing existing ones where possible
			const seenUris = new Set<string>();

			for (const customMode of customModes) {
				const uriString = customMode.uri.toString();
				seenUris.add(uriString);

				let modeInstance = this._customModeInstances.get(uriString);
				if (modeInstance) {
					// Update existing instance with new data
					modeInstance.updateData(customMode);
				} else {
					// Create new instance
					modeInstance = new CustomChatMode(customMode);
					this._customModeInstances.set(uriString, modeInstance);
				}
			}

			// Clean up instances for modes that no longer exist
			for (const [uriString] of this._customModeInstances.entries()) {
				if (!seenUris.has(uriString)) {
					this._customModeInstances.delete(uriString);
				}
			}

			this.hasCustomModes.set(this._customModeInstances.size > 0);

			if (fireChangeEvent) {
				this._onDidChangeChatModes.fire();
			}
		} catch (error) {
			this.logService.error(error, 'Failed to load custom chat modes');
			this._customModeInstances.clear();
			this.hasCustomModes.set(false);
		}
	}

	getModes(): { builtin: readonly IChatMode2[]; custom: readonly IChatMode2[] } {
		return { builtin: this.getBuiltinModes(), custom: Array.from(this._customModeInstances.values()) };
	}

	async getModesAsync(): Promise<{ builtin: readonly IChatMode2[]; custom: readonly IChatMode2[] }> {
		await this.refreshCustomPromptModes();
		return { builtin: this.getBuiltinModes(), custom: Array.from(this._customModeInstances.values()) };
	}

	findModeById(id: string): IChatMode2 | undefined {
		const allModes = this.getModes();
		const builtinMode = allModes.builtin.find(mode => mode.id === id);
		if (builtinMode) {
			return builtinMode;
		}
		return allModes.custom.find(mode => mode.id === id);
	}

	private getBuiltinModes(): IChatMode2[] {
		const builtinModes: IChatMode2[] = [
			ChatMode2.Ask,
		];

		if (this.chatAgentService.hasToolsAgent) {
			builtinModes.push(ChatMode2.Agent);
		}
		builtinModes.push(ChatMode2.Edit);
		return builtinModes;
	}
}

export interface IChatMode {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly kind: ChatMode;
	readonly customTools?: readonly string[];
	readonly body?: string;
	readonly uri?: URI;
}

export interface IChatModeData {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly kind: ChatMode;
	readonly customTools?: readonly string[];
	readonly body?: string;
	readonly uri?: URI;
}

export interface IChatMode2 {
	readonly id: string;
	readonly name: IObservable<string>;
	readonly description?: IObservable<string | undefined>;
	readonly kind: ChatMode;
	readonly customTools?: IObservable<readonly string[] | undefined>;
	readonly body?: IObservable<string>;
	readonly uri?: IObservable<URI>;
}

export function isIChatMode(mode: unknown): mode is IChatMode {
	if (typeof mode === 'object' && mode !== null) {
		const chatMode = mode as IChatMode;
		return typeof chatMode.id === 'string' &&
			typeof chatMode.kind === 'string';
	}

	return false;
}

function isCachedChatModeData(data: unknown): data is IChatModeData {
	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const mode = data as any;
	return typeof mode.id === 'string' &&
		typeof mode.name === 'string' &&
		typeof mode.kind === 'string' &&
		(mode.description === undefined || typeof mode.description === 'string') &&
		(mode.customTools === undefined || Array.isArray(mode.customTools)) &&
		(mode.body === undefined || typeof mode.body === 'string') &&
		(mode.uri === undefined || (typeof mode.uri === 'object' && mode.uri !== null));
}

export class CustomChatMode implements IChatMode2 {
	private readonly _nameObservable: ISettableObservable<string>;
	private readonly _descriptionObservable: ISettableObservable<string | undefined>;
	private readonly _customToolsObservable: ISettableObservable<readonly string[] | undefined>;
	private readonly _bodyObservable: ISettableObservable<string>;
	private readonly _uriObservable: ISettableObservable<URI>;

	public readonly id: string;

	get name(): IObservable<string> {
		return this._nameObservable;
	}

	get description(): IObservable<string | undefined> {
		return this._descriptionObservable;
	}

	get customTools(): IObservable<readonly string[] | undefined> {
		return this._customToolsObservable;
	}

	get body(): IObservable<string> {
		return this._bodyObservable;
	}

	get uri(): IObservable<URI> {
		return this._uriObservable;
	}

	public readonly kind = ChatMode.Agent;

	constructor(
		customChatMode: ICustomChatMode
	) {
		this.id = customChatMode.uri.toString();
		this._nameObservable = observableValue('name', customChatMode.name);
		this._descriptionObservable = observableValue('description', customChatMode.description);
		this._customToolsObservable = observableValue('customTools', customChatMode.tools);
		this._bodyObservable = observableValue('body', customChatMode.body);
		this._uriObservable = observableValue('uri', customChatMode.uri);
	}

	/**
	 * Updates the underlying data and triggers observable changes
	 */
	updateData(newData: ICustomChatMode): void {
		transaction(tx => {
			this._nameObservable.set(newData.name, tx);
			this._descriptionObservable.set(newData.description, tx);
			this._customToolsObservable.set(newData.tools, tx);
			this._bodyObservable.set(newData.body, tx);
			this._uriObservable.set(newData.uri, tx);
		});
	}

	toJSON(): IChatModeData {
		return {
			id: this.id,
			name: this.name.get(),
			description: this.description.get(),
			kind: this.kind,
			customTools: this.customTools.get(),
			body: this.body.get(),
			uri: this.uri.get()
		};
	}
}

export class BuiltinChatMode implements IChatMode2 {
	public readonly description: IObservable<string>;

	constructor(
		public readonly kind: ChatMode,
		description: string
	) {
		this.description = observableValue('description', description);
	}

	get id(): string {
		// Need a differentiator?
		return this.kind;
	}

	get name(): IObservable<string> {
		return observableValue('name', modeToString(this.kind));
	}

	/**
	 * Getters are not json-stringified
	 */
	toJSON(): IChatMode {
		return {
			id: this.id,
			name: this.name.get(),
			description: this.description.get(),
			kind: this.kind
		};
	}
}

export namespace ChatMode2 {
	export const Ask = new BuiltinChatMode(ChatMode.Ask, localize('chatDescription', "Ask Copilot"));
	export const Edit = new BuiltinChatMode(ChatMode.Edit, localize('editsDescription', "Edit files in your workspace"));
	export const Agent = new BuiltinChatMode(ChatMode.Agent, localize('agentDescription', "Edit files in your workspace in agent mode"));
}

export function validateChatMode2(mode: unknown): IChatMode | undefined {
	switch (mode) {
		case ChatMode.Ask:
			return ChatMode2.Ask.toJSON();
		case ChatMode.Edit:
			return ChatMode2.Edit.toJSON();
		case ChatMode.Agent:
			return ChatMode2.Agent.toJSON();
		default:
			if (isIChatMode(mode)) {
				return mode;
			}
			return undefined;
	}
}

export function isBuiltinChatMode(mode: IChatMode): boolean {
	return mode.id === ChatMode2.Ask.id ||
		mode.id === ChatMode2.Edit.id ||
		mode.id === ChatMode2.Agent.id;
}
