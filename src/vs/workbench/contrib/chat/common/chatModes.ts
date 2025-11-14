/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IOffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatAgentService } from './chatAgents.js';
import { ChatContextKeys } from './chatContextKeys.js';
import { ChatModeKind } from './constants.js';
import { IHandOff } from './promptSyntax/promptFileParser.js';
import { IAgentSource, ICustomAgent, IPromptsService, PromptsStorage } from './promptSyntax/service/promptsService.js';

export const IChatModeService = createDecorator<IChatModeService>('chatModeService');
export interface IChatModeService {
	readonly _serviceBrand: undefined;

	// TODO expose an observable list of modes
	readonly onDidChangeChatModes: Event<void>;
	getModes(): { builtin: readonly IChatMode[]; custom: readonly IChatMode[] };
	findModeById(id: string): IChatMode | undefined;
	findModeByName(name: string): IChatMode | undefined;
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

		this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);

		// Load cached modes from storage first
		this.loadCachedModes();

		void this.refreshCustomPromptModes(true);
		this._register(this.promptsService.onDidChangeCustomAgents(() => {
			void this.refreshCustomPromptModes(true);
		}));
		this._register(this.storageService.onWillSaveState(() => this.saveCachedModes()));

		// Ideally we can get rid of the setting to disable agent mode?
		let didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			if (didHaveToolsAgent !== this.chatAgentService.hasToolsAgent) {
				didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
				this._onDidChangeChatModes.fire();
			}
		}));
	}

	private loadCachedModes(): void {
		try {
			const cachedCustomModes = this.storageService.getObject(ChatModeService.CUSTOM_MODES_STORAGE_KEY, StorageScope.WORKSPACE);
			if (cachedCustomModes) {
				this.deserializeCachedModes(cachedCustomModes);
			}
		} catch (error) {
			this.logService.error(error, 'Failed to load cached custom agents');
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
					const customChatMode: ICustomAgent = {
						uri,
						name: cachedMode.name,
						description: cachedMode.description,
						tools: cachedMode.customTools,
						model: cachedMode.model,
						argumentHint: cachedMode.argumentHint,
						agentInstructions: cachedMode.modeInstructions ?? { content: cachedMode.body ?? '', toolReferences: [] },
						handOffs: cachedMode.handOffs,
						target: cachedMode.target,
						source: reviveChatModeSource(cachedMode.source) ?? { storage: PromptsStorage.local }
					};
					const instance = new CustomChatMode(customChatMode);
					this._customModeInstances.set(uri.toString(), instance);
				} catch (error) {
					this.logService.error(error, 'Failed to revive cached custom agent');
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
			this.logService.warn('Failed to save cached custom agents', error);
		}
	}

	private async refreshCustomPromptModes(fireChangeEvent?: boolean): Promise<void> {
		try {
			const customModes = await this.promptsService.getCustomAgents(CancellationToken.None);

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
		} catch (error) {
			this.logService.error(error, 'Failed to load custom agents');
			this._customModeInstances.clear();
			this.hasCustomModes.set(false);
		}
		if (fireChangeEvent) {
			this._onDidChangeChatModes.fire();
		}
	}

	getModes(): { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } {
		return {
			builtin: this.getBuiltinModes(),
			custom: this.getCustomModes(),
		};
	}

	findModeById(id: string | ChatModeKind): IChatMode | undefined {
		return this.getBuiltinModes().find(mode => mode.id === id) ?? this._customModeInstances.get(id);
	}

	findModeByName(name: string): IChatMode | undefined {
		return this.getBuiltinModes().find(mode => mode.name.get() === name) ?? this.getCustomModes().find(mode => mode.name.get() === name);
	}

	private getBuiltinModes(): IChatMode[] {
		const builtinModes: IChatMode[] = [
			ChatMode.Ask,
		];

		if (this.chatAgentService.hasToolsAgent) {
			builtinModes.unshift(ChatMode.Agent);
		}
		builtinModes.push(ChatMode.Edit);
		return builtinModes;
	}

	private getCustomModes(): IChatMode[] {
		return this.chatAgentService.hasToolsAgent ? Array.from(this._customModeInstances.values()) : [];
	}
}

export interface IChatModeData {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly kind: ChatModeKind;
	readonly customTools?: readonly string[];
	readonly model?: string;
	readonly argumentHint?: string;
	readonly modeInstructions?: IChatModeInstructions;
	readonly body?: string; /* deprecated */
	readonly handOffs?: readonly IHandOff[];
	readonly uri?: URI;
	readonly source?: IChatModeSourceData;
	readonly target?: string;
}

export interface IChatMode {
	readonly id: string;
	readonly name: IObservable<string>;
	readonly label: IObservable<string>;
	readonly description: IObservable<string | undefined>;
	readonly isBuiltin: boolean;
	readonly kind: ChatModeKind;
	readonly customTools?: IObservable<readonly string[] | undefined>;
	readonly handOffs?: IObservable<readonly IHandOff[] | undefined>;
	readonly model?: IObservable<string | undefined>;
	readonly argumentHint?: IObservable<string | undefined>;
	readonly modeInstructions?: IObservable<IChatModeInstructions>;
	readonly uri?: IObservable<URI>;
	readonly source?: IAgentSource;
	readonly target?: IObservable<string | undefined>;
}

export interface IVariableReference {
	readonly name: string;
	readonly range: IOffsetRange;
}

export interface IChatModeInstructions {
	readonly content: string;
	readonly toolReferences: readonly IVariableReference[];
	readonly metadata?: Record<string, boolean | string | number>;
}

function isCachedChatModeData(data: unknown): data is IChatModeData {
	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const mode = data as IChatModeData;
	return typeof mode.id === 'string' &&
		typeof mode.name === 'string' &&
		typeof mode.kind === 'string' &&
		(mode.description === undefined || typeof mode.description === 'string') &&
		(mode.customTools === undefined || Array.isArray(mode.customTools)) &&
		(mode.modeInstructions === undefined || (typeof mode.modeInstructions === 'object' && mode.modeInstructions !== null)) &&
		(mode.model === undefined || typeof mode.model === 'string') &&
		(mode.argumentHint === undefined || typeof mode.argumentHint === 'string') &&
		(mode.handOffs === undefined || Array.isArray(mode.handOffs)) &&
		(mode.uri === undefined || (typeof mode.uri === 'object' && mode.uri !== null)) &&
		(mode.source === undefined || isChatModeSourceData(mode.source)) &&
		(mode.target === undefined || typeof mode.target === 'string');
}

export class CustomChatMode implements IChatMode {
	private readonly _nameObservable: ISettableObservable<string>;
	private readonly _descriptionObservable: ISettableObservable<string | undefined>;
	private readonly _customToolsObservable: ISettableObservable<readonly string[] | undefined>;
	private readonly _modeInstructions: ISettableObservable<IChatModeInstructions>;
	private readonly _uriObservable: ISettableObservable<URI>;
	private readonly _modelObservable: ISettableObservable<string | undefined>;
	private readonly _argumentHintObservable: ISettableObservable<string | undefined>;
	private readonly _handoffsObservable: ISettableObservable<readonly IHandOff[] | undefined>;
	private readonly _targetObservable: ISettableObservable<string | undefined>;
	private _source: IAgentSource;

	public readonly id: string;

	get name(): IObservable<string> {
		return this._nameObservable;
	}

	get description(): IObservable<string | undefined> {
		return this._descriptionObservable;
	}

	public get isBuiltin(): boolean {
		return isBuiltinChatMode(this);
	}

	get customTools(): IObservable<readonly string[] | undefined> {
		return this._customToolsObservable;
	}

	get model(): IObservable<string | undefined> {
		return this._modelObservable;
	}

	get argumentHint(): IObservable<string | undefined> {
		return this._argumentHintObservable;
	}

	get modeInstructions(): IObservable<IChatModeInstructions> {
		return this._modeInstructions;
	}

	get uri(): IObservable<URI> {
		return this._uriObservable;
	}

	get label(): IObservable<string> {
		return this.name;
	}

	get handOffs(): IObservable<readonly IHandOff[] | undefined> {
		return this._handoffsObservable;
	}

	get source(): IAgentSource {
		return this._source;
	}

	get target(): IObservable<string | undefined> {
		return this._targetObservable;
	}

	public readonly kind = ChatModeKind.Agent;

	constructor(
		customChatMode: ICustomAgent
	) {
		this.id = customChatMode.uri.toString();
		this._nameObservable = observableValue('name', customChatMode.name);
		this._descriptionObservable = observableValue('description', customChatMode.description);
		this._customToolsObservable = observableValue('customTools', customChatMode.tools);
		this._modelObservable = observableValue('model', customChatMode.model);
		this._argumentHintObservable = observableValue('argumentHint', customChatMode.argumentHint);
		this._handoffsObservable = observableValue('handOffs', customChatMode.handOffs);
		this._targetObservable = observableValue('target', customChatMode.target);
		this._modeInstructions = observableValue('_modeInstructions', customChatMode.agentInstructions);
		this._uriObservable = observableValue('uri', customChatMode.uri);
		this._source = customChatMode.source;
	}

	/**
	 * Updates the underlying data and triggers observable changes
	 */
	updateData(newData: ICustomAgent): void {
		transaction(tx => {
			this._nameObservable.set(newData.name, tx);
			this._descriptionObservable.set(newData.description, tx);
			this._customToolsObservable.set(newData.tools, tx);
			this._modelObservable.set(newData.model, tx);
			this._argumentHintObservable.set(newData.argumentHint, tx);
			this._handoffsObservable.set(newData.handOffs, tx);
			this._targetObservable.set(newData.target, tx);
			this._modeInstructions.set(newData.agentInstructions, tx);
			this._uriObservable.set(newData.uri, tx);
			this._source = newData.source;
		});
	}

	toJSON(): IChatModeData {
		return {
			id: this.id,
			name: this.name.get(),
			description: this.description.get(),
			kind: this.kind,
			customTools: this.customTools.get(),
			model: this.model.get(),
			argumentHint: this.argumentHint.get(),
			modeInstructions: this.modeInstructions.get(),
			uri: this.uri.get(),
			handOffs: this.handOffs.get(),
			source: serializeChatModeSource(this._source),
			target: this.target.get()
		};
	}
}

type IChatModeSourceData =
	| { readonly storage: PromptsStorage.extension; readonly extensionId: string }
	| { readonly storage: PromptsStorage.local | PromptsStorage.user };

function isChatModeSourceData(value: unknown): value is IChatModeSourceData {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const data = value as { storage?: unknown; extensionId?: unknown };
	if (data.storage === PromptsStorage.extension) {
		return typeof data.extensionId === 'string';
	}
	return data.storage === PromptsStorage.local || data.storage === PromptsStorage.user;
}

function serializeChatModeSource(source: IAgentSource | undefined): IChatModeSourceData | undefined {
	if (!source) {
		return undefined;
	}
	if (source.storage === PromptsStorage.extension) {
		return { storage: PromptsStorage.extension, extensionId: source.extensionId.value };
	}
	return { storage: source.storage };
}

function reviveChatModeSource(data: IChatModeSourceData | undefined): IAgentSource | undefined {
	if (!data) {
		return undefined;
	}
	if (data.storage === PromptsStorage.extension) {
		return { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(data.extensionId) };
	}
	return { storage: data.storage };
}

export class BuiltinChatMode implements IChatMode {
	public readonly name: IObservable<string>;
	public readonly label: IObservable<string>;
	public readonly description: IObservable<string>;

	constructor(
		public readonly kind: ChatModeKind,
		label: string,
		description: string
	) {
		this.name = constObservable(kind);
		this.label = constObservable(label);
		this.description = observableValue('description', description);
	}

	public get isBuiltin(): boolean {
		return isBuiltinChatMode(this);
	}

	get id(): string {
		// Need a differentiator?
		return this.kind;
	}

	get target(): IObservable<string | undefined> {
		return observableValue('target', undefined);
	}

	/**
	 * Getters are not json-stringified
	 */
	toJSON(): IChatModeData {
		return {
			id: this.id,
			name: this.name.get(),
			description: this.description.get(),
			kind: this.kind
		};
	}
}

export namespace ChatMode {
	export const Ask = new BuiltinChatMode(ChatModeKind.Ask, 'Ask', localize('chatDescription', "Explore and understand your code"));
	export const Edit = new BuiltinChatMode(ChatModeKind.Edit, 'Edit', localize('editsDescription', "Edit or refactor selected code"));
	export const Agent = new BuiltinChatMode(ChatModeKind.Agent, 'Agent', localize('agentDescription', "Describe what to build next"));
}

export function isBuiltinChatMode(mode: IChatMode): boolean {
	return mode.id === ChatMode.Ask.id ||
		mode.id === ChatMode.Edit.id ||
		mode.id === ChatMode.Agent.id;
}
