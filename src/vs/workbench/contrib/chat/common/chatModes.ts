/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { isUriComponents, URI } from '../../../../base/common/uri.js';
import { IOffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatAgentService } from './participants/chatAgents.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { getChatSessionType, LocalChatSessionUri } from './model/chatUri.js';
import { ChatConfiguration, ChatModeKind } from './constants.js';
import { IHandOff } from './promptSyntax/promptFileParser.js';
import { IAgentSource, ICustomAgent, ICustomAgentVisibility, isCustomAgentVisibility, PromptsStorage } from './promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService } from './customizationHarnessService.js';
import { PromptFileSource, Target } from './promptSyntax/promptTypes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { isString } from '../../../../base/common/types.js';
import { isTarget } from './promptSyntax/languageProviders/promptFileAttributes.js';
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { isEqual as isURLEquals } from '../../../../base/common/resources.js';
import { equals as objectEquals } from '../../../../base/common/objects.js';
import { Delayer } from '../../../../base/common/async.js';


export const IChatModeService = createDecorator<IChatModeService>('chatModeService');
export interface IChatModeService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the chat modes available for the given session resource.
	 *
	 * Instances need to be disposed by the caller when no longer needed
	 */
	createModes(sessionResource: URI): IChatModes & IDisposable;

	/**
	 * Returns the local chat modes after awaiting any in-flight refresh.
	 */
	getLocalModes(): Promise<IChatModes>;
}

/**
 * The set of chat modes available for a particular session type, partitioned
 * into builtin and custom modes, with helpers for lookup by id or name.
 */
export interface IChatModes {
	readonly onDidChange: Event<void>;
	readonly builtin: readonly IChatMode[];
	readonly custom: readonly IChatMode[];
	findModeById(id: string): IChatMode | undefined;
	findModeByName(name: string): IChatMode | undefined;

	/**
	 * Awaits the most recently scheduled update of custom prompt modes.
	 * After this resolves, {@link custom} reflects the latest data from the
	 * prompts service.
	 */
	waitForPendingUpdates(): Promise<void>;
}

class ChatModes extends Disposable implements IChatModes {

	private static readonly CUSTOM_MODES_STORAGE_KEY_PREFIX = 'chat.customModes.';

	private readonly hasCustomModes: IContextKey<boolean>;
	private readonly _customModeInstances = new Map<string, CustomChatMode>();
	private readonly _storageKey: string;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	/** Tracks the most recent refresh of custom prompt modes. */
	private _pendingRefresh: Promise<void> = Promise.resolve();

	private _refreshCancellationSource: CancellationTokenSource | undefined;
	private readonly _refreshThrottler = this._register(new Delayer<void>(100));

	constructor(
		private readonly sessionResource: URI,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
	) {
		super();

		const sessionType = getChatSessionType(sessionResource);

		this._storageKey = ChatModes.CUSTOM_MODES_STORAGE_KEY_PREFIX + sessionType;
		this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);

		// Load cached modes from storage first
		this.loadCachedModes();

		this._pendingRefresh = this.triggerRefresh();
		// When the harness service is the source, also react to its change events for our session type.
		this._register(this.customizationHarnessService.onDidChangeCustomAgents(e => {
			if (e.sessionType === sessionType) {
				this._pendingRefresh = this.triggerRefresh();
			}
		}));
		this._register(this.storageService.onWillSaveState(() => this.saveCachedModes()));

		// Builtin mode availability depends on configuration policy and tools-agent availability.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
				this._onDidChange.fire();
			}
		}));
		let didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			if (didHaveToolsAgent !== this.chatAgentService.hasToolsAgent) {
				didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
				this._onDidChange.fire();
			}
		}));
	}

	get builtin(): readonly IChatMode[] {
		return this.getBuiltinModes();
	}

	get custom(): readonly IChatMode[] {
		return this.getCustomModes();
	}

	findModeById(id: string | ChatModeKind): IChatMode | undefined {
		return this.getBuiltinModes().find(mode => mode.id === id) ?? this._customModeInstances.get(id);
	}

	findModeByName(name: string): IChatMode | undefined {
		return this.getBuiltinModes().find(mode => mode.name.get() === name) ?? this.getCustomModes().find(mode => mode.name.get() === name || mode.id === name);
	}

	waitForPendingUpdates(): Promise<void> {
		return this._pendingRefresh;
	}

	private loadCachedModes(): void {
		try {
			const cachedCustomModes = this.storageService.getObject(this._storageKey, StorageScope.WORKSPACE);
			if (cachedCustomModes) {
				this.deserializeCachedModes(cachedCustomModes);
			}
		} catch (error) {
			this.logService.error(error, 'Failed to load cached custom agents');
		}
	}

	private deserializeCachedModes(cachedCustomModes: unknown): void {
		if (!Array.isArray(cachedCustomModes)) {
			this.logService.error('Invalid cached custom modes data: expected array');
			return;
		}

		for (const cachedMode of cachedCustomModes) {
			if (isCachedChatModeData(cachedMode) && cachedMode.uri) {
				try {
					const visibility = cachedMode.visibility ?? { userInvocable: true, agentInvocable: cachedMode.infer !== false };
					if (!visibility.userInvocable) {
						continue;
					}
					const uri = URI.revive(cachedMode.uri);
					const customChatMode: ICustomAgent = {
						id: cachedMode.id,
						uri,
						name: cachedMode.name,
						description: cachedMode.description,
						tools: cachedMode.customTools,
						model: isString(cachedMode.model) ? [cachedMode.model] : cachedMode.model,
						argumentHint: cachedMode.argumentHint,
						agentInstructions: cachedMode.modeInstructions ?? { content: cachedMode.body ?? '', toolReferences: [] },
						handOffs: cachedMode.handOffs,
						target: cachedMode.target ?? Target.Undefined,
						visibility,
						agents: cachedMode.agents,
						sessionTypes: cachedMode.sessionTypes,
						source: reviveChatModeSource(cachedMode.source) ?? { storage: PromptsStorage.local },
						enabled: true
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
			this.storageService.store(this._storageKey, modesToCache, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} catch (error) {
			this.logService.warn('Failed to save cached custom agents', error);
		}
	}

	private triggerRefresh(): Promise<void> {
		this._refreshCancellationSource?.cancel();
		this._refreshCancellationSource?.dispose();
		const refreshCancellationSource = this._refreshCancellationSource = new CancellationTokenSource();
		return this._refreshThrottler.trigger(async () => {
			try {
				await this.refreshCustomPromptModes(refreshCancellationSource.token);
			} finally {
				if (this._refreshCancellationSource === refreshCancellationSource) {
					this._refreshCancellationSource = undefined;
				}
				refreshCancellationSource.dispose();
			}
		});
	}

	override dispose(): void {
		this._refreshCancellationSource?.cancel();
		this._refreshCancellationSource?.dispose();
		this._refreshCancellationSource = undefined;
		super.dispose();
	}

	private async refreshCustomPromptModes(token: CancellationToken): Promise<void> {
		let hasChanges = false;
		try {
			if (token.isCancellationRequested) {
				return;
			}
			const customModes = await this.customizationHarnessService.getCustomAgents(this.sessionResource, token);
			if (token.isCancellationRequested) {
				return;
			}

			// Create a new set of mode instances, reusing existing ones where possible
			const seenUris = new Set<string>();
			for (const customMode of customModes) {
				if (!customMode.visibility.userInvocable || !customMode.enabled) {
					continue;
				}

				const uriString = customMode.uri.toString();
				seenUris.add(uriString);

				let modeInstance = this._customModeInstances.get(uriString);
				if (modeInstance) {
					// Update existing instance with new data
					if (modeInstance.updateData(customMode)) {
						hasChanges = true;
					}
				} else {
					// Create new instance
					modeInstance = new CustomChatMode(customMode);
					this._customModeInstances.set(uriString, modeInstance);
					hasChanges = true;
				}
			}

			// Clean up instances for modes that no longer exist
			for (const [uriString] of this._customModeInstances.entries()) {
				if (!seenUris.has(uriString)) {
					this._customModeInstances.delete(uriString);
					hasChanges = true;
				}
			}

			this.hasCustomModes.set(this._customModeInstances.size > 0);
		} catch (error) {
			this.logService.error(error, 'Failed to load custom agents');
			this._customModeInstances.clear();
			this.hasCustomModes.set(false);
			hasChanges = true;
		}
		if (hasChanges) {
			this._onDidChange.fire();
		}
	}

	private getBuiltinModes(): IChatMode[] {
		const builtinModes: IChatMode[] = [
			ChatMode.Ask,
		];

		// Include Agent mode if:
		// - It's enabled (hasToolsAgent is true), OR
		// - It's disabled by policy (so we can show it with a lock icon)
		// But hide it if the user manually disabled it via settings
		if (this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy()) {
			builtinModes.unshift(ChatMode.Agent);
		}
		builtinModes.push(ChatMode.Edit);
		return builtinModes;
	}

	private getCustomModes(): IChatMode[] {
		// Show custom modes when agent mode is enabled OR when disabled by policy (to show them in the policy-managed group)
		return this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy() ? Array.from(this._customModeInstances.values()) : [];
	}

	private isAgentModeDisabledByPolicy(): boolean {
		return this.configurationService.inspect<boolean>(ChatConfiguration.AgentEnabled).policyValue === false;
	}
}

export class ChatModeService extends Disposable implements IChatModeService {
	declare readonly _serviceBrand: undefined;

	private readonly agentModeDisabledByPolicy: IContextKey<boolean>;
	private localMode: Promise<IChatModes> | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.agentModeDisabledByPolicy = ChatContextKeys.Modes.agentModeDisabledByPolicy.bindTo(contextKeyService);

		// Initialize the policy context key
		this.updateAgentModePolicyContextKey();

		// Listen for configuration changes that affect agent mode policy
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
				this.updateAgentModePolicyContextKey();
			}
		}));
	}

	createModes(sessionResource: URI): IChatModes & IDisposable {
		return this.instantiationService.createInstance(ChatModes, sessionResource);
	}

	async getLocalModes(): Promise<IChatModes> {
		if (!this.localMode) {
			this.localMode = (async () => {
				const modes = this._register(this.createModes(LocalChatSessionUri.getNewSessionUri())); // we make up a new session. Local mdes fall back to the promptService and are not actually tied to the session, so it doesn't matter which one we use here.
				await modes.waitForPendingUpdates();
				return modes;
			})();
		}
		return this.localMode;
	}

	private updateAgentModePolicyContextKey(): void {
		this.agentModeDisabledByPolicy.set(this.isAgentModeDisabledByPolicy());
	}

	private isAgentModeDisabledByPolicy(): boolean {
		return this.configurationService.inspect<boolean>(ChatConfiguration.AgentEnabled).policyValue === false;
	}
}

export interface IChatModeData {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly kind: ChatModeKind;
	readonly customTools?: readonly string[];
	readonly model?: readonly string[] | string;
	readonly argumentHint?: string;
	readonly modeInstructions?: IChatModeInstructions;
	readonly body?: string; /* deprecated */
	readonly handOffs?: readonly IHandOff[];
	readonly uri?: URI;
	readonly source?: IChatModeSourceData;
	readonly target?: Target;
	readonly visibility?: ICustomAgentVisibility;
	readonly agents?: readonly string[];
	readonly sessionTypes?: readonly string[];
	readonly infer?: boolean; // deprecated, only available in old cached data
}

export interface IChatMode {
	readonly id: string;
	readonly name: IObservable<string>;
	readonly label: IObservable<string>;
	readonly icon: IObservable<ThemeIcon | undefined>;
	readonly description: IObservable<string | undefined>;
	readonly isBuiltin: boolean;
	readonly kind: ChatModeKind;
	readonly customTools?: IObservable<readonly string[] | undefined>;
	readonly handOffs?: IObservable<readonly IHandOff[] | undefined>;
	readonly model?: IObservable<readonly string[] | undefined>;
	readonly argumentHint?: IObservable<string | undefined>;
	readonly modeInstructions?: IObservable<IChatModeInstructions>;
	readonly uri?: IObservable<URI>;
	readonly source?: IAgentSource;
	readonly target: IObservable<Target>;
	readonly visibility?: IObservable<ICustomAgentVisibility | undefined>;
	readonly agents?: IObservable<readonly string[] | undefined>;
	readonly sessionTypes?: readonly string[];
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

export namespace IChatModeInstructions {
	export function isEquals(a: IChatModeInstructions | undefined, b: IChatModeInstructions | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.content === b.content &&
			objectEquals(a.toolReferences, b.toolReferences) &&
			objectEquals(a.metadata, b.metadata);
	}

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
		(mode.model === undefined || typeof mode.model === 'string' || Array.isArray(mode.model)) &&
		(mode.argumentHint === undefined || typeof mode.argumentHint === 'string') &&
		(mode.handOffs === undefined || Array.isArray(mode.handOffs)) &&
		(mode.uri === undefined || (typeof mode.uri === 'object' && mode.uri !== null)) &&
		(mode.source === undefined || isChatModeSourceData(mode.source)) &&
		(mode.target === undefined || isTarget(mode.target)) &&
		(mode.visibility === undefined || isCustomAgentVisibility(mode.visibility)) &&
		(mode.agents === undefined || Array.isArray(mode.agents)) &&
		(mode.sessionTypes === undefined || Array.isArray(mode.sessionTypes));
}

export class CustomChatMode implements IChatMode {
	private readonly _nameObservable: ISettableObservable<string>;
	private readonly _descriptionObservable: ISettableObservable<string | undefined>;
	private readonly _customToolsObservable: ISettableObservable<readonly string[] | undefined>;
	private readonly _modeInstructions: ISettableObservable<IChatModeInstructions>;
	private readonly _uriObservable: ISettableObservable<URI>;
	private readonly _modelObservable: ISettableObservable<readonly string[] | undefined>;
	private readonly _argumentHintObservable: ISettableObservable<string | undefined>;
	private readonly _handoffsObservable: ISettableObservable<readonly IHandOff[] | undefined>;
	private readonly _targetObservable: ISettableObservable<Target>;
	private readonly _visibilityObservable: ISettableObservable<ICustomAgentVisibility | undefined>;
	private readonly _agentsObservable: ISettableObservable<readonly string[] | undefined>;
	private _source: IAgentSource;
	private _sessionTypes: readonly string[] | undefined;

	public readonly id: string;

	get name(): IObservable<string> {
		return this._nameObservable;
	}

	get description(): IObservable<string | undefined> {
		return this._descriptionObservable;
	}

	get icon(): IObservable<ThemeIcon | undefined> {
		return constObservable(undefined);
	}

	public get isBuiltin(): boolean {
		return isBuiltinChatMode(this);
	}

	get customTools(): IObservable<readonly string[] | undefined> {
		return this._customToolsObservable;
	}

	get model(): IObservable<readonly string[] | undefined> {
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

	get target(): IObservable<Target> {
		return this._targetObservable;
	}

	get visibility(): IObservable<ICustomAgentVisibility | undefined> {
		return this._visibilityObservable;
	}

	get agents(): IObservable<readonly string[] | undefined> {
		return this._agentsObservable;
	}

	get sessionTypes(): readonly string[] | undefined {
		return this._sessionTypes;
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
		this._visibilityObservable = observableValue('visibility', customChatMode.visibility);
		this._agentsObservable = observableValue('agents', customChatMode.agents);
		this._modeInstructions = observableValue('_modeInstructions', customChatMode.agentInstructions);
		this._uriObservable = observableValue('uri', customChatMode.uri);
		this._source = customChatMode.source;
		this._sessionTypes = customChatMode.sessionTypes;
	}

	/**
	 * Updates the underlying data and triggers observable changes
	 */
	updateData(newData: ICustomAgent): boolean {
		let hasChanges = false;

		transaction(tx => {
			const update = <T>(observable: ISettableObservable<T | undefined>, newValue: T | undefined, equals: (a: T | undefined, b: T | undefined) => boolean = (a, b) => a === b) => {
				if (!equals(observable.get(), newValue)) {
					observable.set(newValue, tx);
					hasChanges = true;
				}
			};
			update(this._nameObservable, newData.name);
			update(this._descriptionObservable, newData.description);
			update(this._customToolsObservable, newData.tools, arraysEqual);
			update(this._modelObservable, newData.model, arraysEqual);
			update(this._argumentHintObservable, newData.argumentHint);
			update(this._modeInstructions, newData.agentInstructions, IChatModeInstructions.isEquals);
			update(this._uriObservable, newData.uri, isURLEquals);
			update(this._handoffsObservable, newData.handOffs, objectEquals);
			update(this._targetObservable, newData.target);
			update(this._visibilityObservable, newData.visibility, objectEquals);
			update(this._agentsObservable, newData.agents, arraysEqual);
			if (!IAgentSource.isEquals(this._source, newData.source)) {
				this._source = newData.source;
				hasChanges = true;
			}
			if (!arraysEqual(this._sessionTypes, newData.sessionTypes)) {
				this._sessionTypes = newData.sessionTypes;
				hasChanges = true;
			}
		});
		return hasChanges;
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
			target: this.target.get(),
			visibility: this.visibility.get(),
			agents: this.agents.get(),
			sessionTypes: this.sessionTypes,
		};
	}
}

type IChatModeSourceData =
	| { readonly storage: PromptsStorage.extension; readonly extensionId: string; type?: PromptFileSource.ExtensionContribution | PromptFileSource.ExtensionAPI }
	| { readonly storage: PromptsStorage.local | PromptsStorage.user }
	| { readonly storage: PromptsStorage.plugin; readonly pluginUri: URI };

function isChatModeSourceData(value: unknown): value is IChatModeSourceData {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const data = value as { storage?: unknown; extensionId?: unknown; pluginUri?: unknown };
	if (data.storage === PromptsStorage.extension) {
		return typeof data.extensionId === 'string';
	}
	if (data.storage === PromptsStorage.plugin) {
		return isUriComponents(data.pluginUri);
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
	if (source.storage === PromptsStorage.plugin) {
		return { storage: PromptsStorage.plugin, pluginUri: source.pluginUri };
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
	if (data.storage === PromptsStorage.plugin) {
		return { storage: PromptsStorage.plugin, pluginUri: URI.revive(data.pluginUri) };
	}
	return { storage: data.storage };
}

export class BuiltinChatMode implements IChatMode {
	public readonly name: IObservable<string>;
	public readonly label: IObservable<string>;
	public readonly description: IObservable<string>;
	public readonly icon: IObservable<ThemeIcon>;
	public readonly target: IObservable<Target>;

	constructor(
		public readonly kind: ChatModeKind,
		label: string,
		description: string,
		icon: ThemeIcon,
	) {
		this.name = constObservable(kind);
		this.label = constObservable(label);
		this.description = observableValue('description', description);
		this.icon = constObservable(icon);
		this.target = constObservable(Target.Undefined);
	}

	public get isBuiltin(): boolean {
		return isBuiltinChatMode(this);
	}

	get id(): string {
		// Need a differentiator?
		return this.kind;
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
	export const Ask = new BuiltinChatMode(ChatModeKind.Ask, 'Ask', localize('chatDescription', "Explore and understand your code"), Codicon.question);
	export const Edit = new BuiltinChatMode(ChatModeKind.Edit, 'Edit', localize('editsDescription', "Edit or refactor selected code"), Codicon.edit);
	export const Agent = new BuiltinChatMode(ChatModeKind.Agent, 'Agent', localize('agentDescription', "Describe what to build"), Codicon.agent);
}

export function isBuiltinChatMode(mode: IChatMode): boolean {
	return mode.id === ChatMode.Ask.id ||
		mode.id === ChatMode.Edit.id ||
		mode.id === ChatMode.Agent.id;
}

/**
 * Returns a telemetry-safe mode name. User/local mode names are hashed
 * to avoid leaking PII; builtin and extension mode names are returned as-is.
 */
export function getModeNameForTelemetry(mode: IChatMode): string {
	const modeStorage = mode.source?.storage;
	if (modeStorage === PromptsStorage.local || modeStorage === PromptsStorage.user) {
		return String(hash(mode.name.get()));
	}
	return mode.name.get();
}

/**
 * Generates a stable identifier for a handoff by combining the target agent
 * name with a slugified version of the display label.
 *
 * Within a single source agent, the combination of `agent` + `label` must be
 * unique for IDs to be unambiguous.
 *
 * @example
 * ```
 * getHandoffId({ agent: 'agent', label: 'Continue', prompt: '...' })
 * // => 'agent:continue'
 * ```
 */
export function getHandoffId(handoff: IHandOff): string {
	const slug = handoff.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	return `${handoff.agent}:${slug}`;
}

/**
 * Describes a single handoff defined in a custom agent's `.agent.md` file.
 */
export interface IHandoffInfo {
	/** Stable identifier for programmatic matching (format: `<agent>:<slugified-label>`). */
	readonly id: string;
	readonly label: string;
	readonly agent: string;
	readonly prompt: string;
	readonly send?: boolean;
	readonly showContinueOn?: boolean;
	readonly model?: string;
}

/**
 * Describes a custom agent (or built-in mode) and the handoffs it defines.
 */
export interface ICustomAgentInfo {
	readonly id: string;
	readonly name: string;
	readonly isBuiltin: boolean;
	readonly visibility: {
		readonly userInvocable: boolean;
		readonly agentInvocable: boolean;
	};
	readonly handoffs: IHandoffInfo[];
}

/**
 * Builds an array of {@link ICustomAgentInfo} with handoff metadata for the given agents/modes.
 *
 * @param modes - The set of agents/modes to include. Pass all modes to get a
 *   complete picture, or a filtered subset to scope the result.
 * @returns One entry per agent/mode, each containing the agent's metadata and
 *   its declared handoffs.
 */
export function buildCustomAgentHandoffsInfo(modes: readonly IChatMode[]): ICustomAgentInfo[] {
	return modes.map(mode => {
		const handoffs = mode.handOffs?.get() ?? [];
		const visibility = mode.visibility?.get();
		return {
			id: mode.id,
			name: mode.name.get(),
			isBuiltin: mode.isBuiltin,
			visibility: {
				userInvocable: visibility?.userInvocable ?? true,
				agentInvocable: visibility?.agentInvocable ?? true,
			},
			handoffs: handoffs.map(h => ({
				id: getHandoffId(h),
				label: h.label,
				agent: h.agent,
				prompt: h.prompt,
				...(h.send !== undefined ? { send: h.send } : {}),
				...(h.showContinueOn !== undefined ? { showContinueOn: h.showContinueOn } : {}),
				...(h.model !== undefined ? { model: h.model } : {}),
			})),
		};
	});
}
