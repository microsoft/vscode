/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findLast } from '../../../../base/common/arraysFind.js';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { revive } from '../../../../base/common/marshalling.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Command, ProviderResult } from '../../../../editor/common/languages.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { CONTEXT_CHAT_ENABLED, CONTEXT_CHAT_PANEL_PARTICIPANT_REGISTERED } from './chatContextKeys.js';
import { IChatProgressHistoryResponseContent, IChatRequestVariableData, ISerializableChatAgentData } from './chatModel.js';
import { IRawChatCommandContribution, RawChatParticipantLocation } from './chatParticipantContribTypes.js';
import { IChatFollowup, IChatLocationData, IChatProgress, IChatResponseErrorDetails, IChatTaskDto } from './chatService.js';

//#region agent service, commands etc

export interface IChatAgentHistoryEntry {
	request: IChatAgentRequest;
	response: ReadonlyArray<IChatProgressHistoryResponseContent | IChatTaskDto>;
	result: IChatAgentResult;
}

export enum ChatAgentLocation {
	Panel = 'panel',
	Terminal = 'terminal',
	Notebook = 'notebook',
	Editor = 'editor'
}

export namespace ChatAgentLocation {
	export function fromRaw(value: RawChatParticipantLocation | string): ChatAgentLocation {
		switch (value) {
			case 'panel': return ChatAgentLocation.Panel;
			case 'terminal': return ChatAgentLocation.Terminal;
			case 'notebook': return ChatAgentLocation.Notebook;
			case 'editor': return ChatAgentLocation.Editor;
		}
		return ChatAgentLocation.Panel;
	}
}

export interface IChatAgentData {
	id: string;
	name: string;
	fullName?: string;
	description?: string;
	supportsModelPicker?: boolean;
	when?: string;
	extensionId: ExtensionIdentifier;
	extensionPublisherId: string;
	/** This is the extension publisher id, or, in the case of a dynamically registered participant (remote agent), whatever publisher name we have for it */
	publisherDisplayName?: string;
	extensionDisplayName: string;
	/** The agent invoked when no agent is specified */
	isDefault?: boolean;
	/** This agent is not contributed in package.json, but is registered dynamically */
	isDynamic?: boolean;
	metadata: IChatAgentMetadata;
	slashCommands: IChatAgentCommand[];
	locations: ChatAgentLocation[];
	disambiguation: { category: string; description: string; examples: string[] }[];
	supportsToolReferences?: boolean;
}

export interface IChatWelcomeMessageContent {
	icon: ThemeIcon;
	title: string;
	message: IMarkdownString;
}

export function isChatWelcomeMessageContent(obj: any): obj is IChatWelcomeMessageContent {
	return obj &&
		ThemeIcon.isThemeIcon(obj.icon) &&
		typeof obj.title === 'string' &&
		isMarkdownString(obj.message);
}

export interface IChatAgentImplementation {
	invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	provideFollowups?(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]>;
	provideWelcomeMessage?(token: CancellationToken): ProviderResult<IChatWelcomeMessageContent | undefined>;
	provideChatTitle?: (history: IChatAgentHistoryEntry[], token: CancellationToken) => Promise<string | undefined>;
	provideSampleQuestions?(location: ChatAgentLocation, token: CancellationToken): ProviderResult<IChatFollowup[] | undefined>;
}

export interface IChatParticipantDetectionResult {
	participant: string;
	command?: string;
}

export interface IChatParticipantMetadata {
	participant: string;
	command?: string;
	disambiguation: { category: string; description: string; examples: string[] }[];
}

export interface IChatParticipantDetectionProvider {
	provideParticipantDetection(request: IChatAgentRequest, history: IChatAgentHistoryEntry[], options: { location: ChatAgentLocation; participants: IChatParticipantMetadata[] }, token: CancellationToken): Promise<IChatParticipantDetectionResult | null | undefined>;
}

export type IChatAgent = IChatAgentData & IChatAgentImplementation;

export interface IChatAgentCommand extends IRawChatCommandContribution {
	followupPlaceholder?: string;
}

export interface IChatRequesterInformation {
	name: string;

	/**
	 * A full URI for the icon of the requester.
	 */
	icon?: URI;
}

export interface IChatAgentMetadata {
	helpTextPrefix?: string | IMarkdownString;
	helpTextVariablesPrefix?: string | IMarkdownString;
	helpTextPostfix?: string | IMarkdownString;
	isSecondary?: boolean; // Invoked by ctrl/cmd+enter
	icon?: URI;
	iconDark?: URI;
	themeIcon?: ThemeIcon;
	sampleRequest?: string;
	supportIssueReporting?: boolean;
	followupPlaceholder?: string;
	isSticky?: boolean;
	requester?: IChatRequesterInformation;
	supportsSlowVariables?: boolean;
}


export interface IChatAgentRequest {
	sessionId: string;
	requestId: string;
	agentId: string;
	command?: string;
	message: string;
	attempt?: number;
	enableCommandDetection?: boolean;
	isParticipantDetected?: boolean;
	variables: IChatRequestVariableData;
	location: ChatAgentLocation;
	locationData?: IChatLocationData;
	acceptedConfirmationData?: any[];
	rejectedConfirmationData?: any[];
	userSelectedModelId?: string;
}

export interface IChatQuestion {
	readonly prompt: string;
	readonly participant?: string;
	readonly command?: string;
}

export interface IChatAgentResultTimings {
	firstProgress?: number;
	totalElapsed: number;
}

export interface IChatAgentResult {
	errorDetails?: IChatResponseErrorDetails;
	timings?: IChatAgentResultTimings;
	/** Extra properties that the agent can use to identify a result */
	readonly metadata?: { readonly [key: string]: any };
	nextQuestion?: IChatQuestion;
}

export const IChatAgentService = createDecorator<IChatAgentService>('chatAgentService');

interface IChatAgentEntry {
	data: IChatAgentData;
	impl?: IChatAgentImplementation;
}

export interface IChatAgentCompletionItem {
	id: string;
	name?: string;
	fullName?: string;
	icon?: ThemeIcon;
	value: unknown;
	command?: Command;
}

export interface IChatAgentService {
	_serviceBrand: undefined;
	/**
	 * undefined when an agent was removed IChatAgent
	 */
	readonly onDidChangeAgents: Event<IChatAgent | undefined>;
	registerAgent(id: string, data: IChatAgentData): IDisposable;
	registerAgentImplementation(id: string, agent: IChatAgentImplementation): IDisposable;
	registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation): IDisposable;
	registerAgentCompletionProvider(id: string, provider: (query: string, token: CancellationToken) => Promise<IChatAgentCompletionItem[]>): IDisposable;
	getAgentCompletionItems(id: string, query: string, token: CancellationToken): Promise<IChatAgentCompletionItem[]>;
	registerChatParticipantDetectionProvider(handle: number, provider: IChatParticipantDetectionProvider): IDisposable;
	detectAgentOrCommand(request: IChatAgentRequest, history: IChatAgentHistoryEntry[], options: { location: ChatAgentLocation }, token: CancellationToken): Promise<{ agent: IChatAgentData; command?: IChatAgentCommand } | undefined>;
	hasChatParticipantDetectionProviders(): boolean;
	invokeAgent(agent: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]>;
	getChatTitle(id: string, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<string | undefined>;
	getAgent(id: string): IChatAgentData | undefined;
	getAgentByFullyQualifiedId(id: string): IChatAgentData | undefined;
	getAgents(): IChatAgentData[];
	getActivatedAgents(): Array<IChatAgent>;
	getAgentsByName(name: string): IChatAgentData[];
	agentHasDupeName(id: string): boolean;

	/**
	 * Get the default agent (only if activated)
	 */
	getDefaultAgent(location: ChatAgentLocation): IChatAgent | undefined;

	/**
	 * Get the default agent data that has been contributed (may not be activated yet)
	 */
	getContributedDefaultAgent(location: ChatAgentLocation): IChatAgentData | undefined;
	getSecondaryAgent(): IChatAgentData | undefined;
	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void;
}

export class ChatAgentService implements IChatAgentService {

	public static readonly AGENT_LEADER = '@';

	declare _serviceBrand: undefined;

	private _agents = new Map<string, IChatAgentEntry>();

	private readonly _onDidChangeAgents = new Emitter<IChatAgent | undefined>();
	readonly onDidChangeAgents: Event<IChatAgent | undefined> = this._onDidChangeAgents.event;

	private readonly _hasDefaultAgent: IContextKey<boolean>;
	private readonly _defaultAgentRegistered: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		this._hasDefaultAgent = CONTEXT_CHAT_ENABLED.bindTo(this.contextKeyService);
		this._defaultAgentRegistered = CONTEXT_CHAT_PANEL_PARTICIPANT_REGISTERED.bindTo(this.contextKeyService);
	}

	registerAgent(id: string, data: IChatAgentData): IDisposable {
		const existingAgent = this.getAgent(id);
		if (existingAgent) {
			throw new Error(`Agent already registered: ${JSON.stringify(id)}`);
		}

		if (data.isDefault) {
			this._defaultAgentRegistered.set(true);
		}

		const that = this;
		const commands = data.slashCommands;
		data = {
			...data,
			get slashCommands() {
				return commands.filter(c => !c.when || that.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(c.when)));
			}
		};
		const entry = { data };
		this._agents.set(id, entry);
		this._onDidChangeAgents.fire(undefined);
		return toDisposable(() => {
			this._agents.delete(id);
			if (data.isDefault) {
				this._defaultAgentRegistered.set(false);
			}

			this._onDidChangeAgents.fire(undefined);
		});
	}

	registerAgentImplementation(id: string, agentImpl: IChatAgentImplementation): IDisposable {
		const entry = this._agents.get(id);
		if (!entry) {
			throw new Error(`Unknown agent: ${JSON.stringify(id)}`);
		}

		if (entry.impl) {
			throw new Error(`Agent already has implementation: ${JSON.stringify(id)}`);
		}

		if (entry.data.isDefault) {
			this._hasDefaultAgent.set(true);
		}

		entry.impl = agentImpl;
		this._onDidChangeAgents.fire(new MergedChatAgent(entry.data, agentImpl));

		return toDisposable(() => {
			entry.impl = undefined;
			this._onDidChangeAgents.fire(undefined);

			if (entry.data.isDefault) {
				this._hasDefaultAgent.set(false);
			}
		});
	}

	registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation): IDisposable {
		data.isDynamic = true;
		const agent = { data, impl: agentImpl };
		this._agents.set(data.id, agent);
		this._onDidChangeAgents.fire(new MergedChatAgent(data, agentImpl));

		return toDisposable(() => {
			this._agents.delete(data.id);
			this._onDidChangeAgents.fire(undefined);
		});
	}

	private _agentCompletionProviders = new Map<string, (query: string, token: CancellationToken) => Promise<IChatAgentCompletionItem[]>>();

	registerAgentCompletionProvider(id: string, provider: (query: string, token: CancellationToken) => Promise<IChatAgentCompletionItem[]>) {
		this._agentCompletionProviders.set(id, provider);
		return {
			dispose: () => { this._agentCompletionProviders.delete(id); }
		};
	}

	async getAgentCompletionItems(id: string, query: string, token: CancellationToken) {
		return await this._agentCompletionProviders.get(id)?.(query, token) ?? [];
	}

	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void {
		const agent = this._agents.get(id);
		if (!agent?.impl) {
			throw new Error(`No activated agent with id ${JSON.stringify(id)} registered`);
		}
		agent.data.metadata = { ...agent.data.metadata, ...updateMetadata };
		this._onDidChangeAgents.fire(new MergedChatAgent(agent.data, agent.impl));
	}

	getDefaultAgent(location: ChatAgentLocation): IChatAgent | undefined {
		return findLast(this.getActivatedAgents(), a => !!a.isDefault && a.locations.includes(location));
	}

	getContributedDefaultAgent(location: ChatAgentLocation): IChatAgentData | undefined {
		return this.getAgents().find(a => !!a.isDefault && a.locations.includes(location));
	}

	getSecondaryAgent(): IChatAgentData | undefined {
		// TODO also static
		return Iterable.find(this._agents.values(), a => !!a.data.metadata.isSecondary)?.data;
	}

	getAgent(id: string): IChatAgentData | undefined {
		if (!this._agentIsEnabled(id)) {
			return;
		}

		return this._agents.get(id)?.data;
	}

	private _agentIsEnabled(id: string): boolean {
		const entry = this._agents.get(id);
		return !entry?.data.when || this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(entry.data.when));
	}

	getAgentByFullyQualifiedId(id: string): IChatAgentData | undefined {
		const agent = Iterable.find(this._agents.values(), a => getFullyQualifiedId(a.data) === id)?.data;
		if (agent && !this._agentIsEnabled(agent.id)) {
			return;
		}

		return agent;
	}

	/**
	 * Returns all agent datas that exist- static registered and dynamic ones.
	 */
	getAgents(): IChatAgentData[] {
		return Array.from(this._agents.values())
			.map(entry => entry.data)
			.filter(a => this._agentIsEnabled(a.id));
	}

	getActivatedAgents(): IChatAgent[] {
		return Array.from(this._agents.values())
			.filter(a => !!a.impl)
			.filter(a => this._agentIsEnabled(a.data.id))
			.map(a => new MergedChatAgent(a.data, a.impl!));
	}

	getAgentsByName(name: string): IChatAgentData[] {
		return this.getAgents().filter(a => a.name === name);
	}

	agentHasDupeName(id: string): boolean {
		const agent = this.getAgent(id);
		if (!agent) {
			return false;
		}

		return this.getAgentsByName(agent.name)
			.filter(a => a.extensionId.value !== agent.extensionId.value).length > 0;
	}

	async invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		const data = this._agents.get(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id "${id}"`);
		}

		return await data.impl.invoke(request, progress, history, token);
	}

	async getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {
		const data = this._agents.get(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id "${id}"`);
		}

		if (!data.impl?.provideFollowups) {
			return [];
		}

		return data.impl.provideFollowups(request, result, history, token);
	}

	async getChatTitle(id: string, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<string | undefined> {
		const data = this._agents.get(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id "${id}"`);
		}

		if (!data.impl?.provideChatTitle) {
			return undefined;
		}

		return data.impl.provideChatTitle(history, token);
	}

	private _chatParticipantDetectionProviders = new Map<number, IChatParticipantDetectionProvider>();
	registerChatParticipantDetectionProvider(handle: number, provider: IChatParticipantDetectionProvider) {
		this._chatParticipantDetectionProviders.set(handle, provider);
		return toDisposable(() => {
			this._chatParticipantDetectionProviders.delete(handle);
		});
	}

	hasChatParticipantDetectionProviders() {
		return this._chatParticipantDetectionProviders.size > 0;
	}

	async detectAgentOrCommand(request: IChatAgentRequest, history: IChatAgentHistoryEntry[], options: { location: ChatAgentLocation }, token: CancellationToken): Promise<{ agent: IChatAgentData; command?: IChatAgentCommand } | undefined> {
		// TODO@joyceerhl should we have a selector to be able to narrow down which provider to use
		const provider = Iterable.first(this._chatParticipantDetectionProviders.values());
		if (!provider) {
			return;
		}

		const participants = this.getAgents().reduce<IChatParticipantMetadata[]>((acc, a) => {
			acc.push({ participant: a.id, disambiguation: a.disambiguation ?? [] });
			for (const command of a.slashCommands) {
				acc.push({ participant: a.id, command: command.name, disambiguation: command.disambiguation ?? [] });
			}
			return acc;
		}, []);

		const result = await provider.provideParticipantDetection(request, history, { ...options, participants }, token);
		if (!result) {
			return;
		}

		const agent = this.getAgent(result.participant);
		if (!agent) {
			// Couldn't find a participant matching the participant detection result
			return;
		}

		if (!result.command) {
			return { agent };
		}

		const command = agent?.slashCommands.find(c => c.name === result.command);
		if (!command) {
			// Couldn't find a slash command matching the participant detection result
			return;
		}

		return { agent, command };
	}
}

export class MergedChatAgent implements IChatAgent {
	constructor(
		private readonly data: IChatAgentData,
		private readonly impl: IChatAgentImplementation
	) { }
	when?: string | undefined;
	publisherDisplayName?: string | undefined;
	isDynamic?: boolean | undefined;

	get id(): string { return this.data.id; }
	get name(): string { return this.data.name ?? ''; }
	get fullName(): string { return this.data.fullName ?? ''; }
	get description(): string { return this.data.description ?? ''; }
	get extensionId(): ExtensionIdentifier { return this.data.extensionId; }
	get extensionPublisherId(): string { return this.data.extensionPublisherId; }
	get extensionPublisherDisplayName() { return this.data.publisherDisplayName; }
	get extensionDisplayName(): string { return this.data.extensionDisplayName; }
	get isDefault(): boolean | undefined { return this.data.isDefault; }
	get metadata(): IChatAgentMetadata { return this.data.metadata; }
	get slashCommands(): IChatAgentCommand[] { return this.data.slashCommands; }
	get locations(): ChatAgentLocation[] { return this.data.locations; }
	get disambiguation(): { category: string; description: string; examples: string[] }[] { return this.data.disambiguation; }

	async invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		return this.impl.invoke(request, progress, history, token);
	}

	async provideFollowups(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {
		if (this.impl.provideFollowups) {
			return this.impl.provideFollowups(request, result, history, token);
		}

		return [];
	}

	provideWelcomeMessage(token: CancellationToken): ProviderResult<IChatWelcomeMessageContent | undefined> {
		if (this.impl.provideWelcomeMessage) {
			return this.impl.provideWelcomeMessage(token);
		}

		return undefined;
	}

	provideSampleQuestions(location: ChatAgentLocation, token: CancellationToken): ProviderResult<IChatFollowup[] | undefined> {
		if (this.impl.provideSampleQuestions) {
			return this.impl.provideSampleQuestions(location, token);
		}

		return undefined;
	}

	toJSON(): IChatAgentData {
		return this.data;
	}
}

export const IChatAgentNameService = createDecorator<IChatAgentNameService>('chatAgentNameService');

type IChatParticipantRegistry = { [name: string]: string[] };

interface IChatParticipantRegistryResponse {
	readonly version: number;
	readonly restrictedChatParticipants: IChatParticipantRegistry;
}

export interface IChatAgentNameService {
	_serviceBrand: undefined;
	getAgentNameRestriction(chatAgentData: IChatAgentData): boolean;
}

export class ChatAgentNameService implements IChatAgentNameService {

	private static readonly StorageKey = 'chat.participantNameRegistry';

	declare _serviceBrand: undefined;

	private readonly url!: string;
	private registry = observableValue<IChatParticipantRegistry>(this, Object.create(null));
	private disposed = false;

	constructor(
		@IProductService productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		if (!productService.chatParticipantRegistry) {
			return;
		}

		this.url = productService.chatParticipantRegistry;

		const raw = storageService.get(ChatAgentNameService.StorageKey, StorageScope.APPLICATION);

		try {
			this.registry.set(JSON.parse(raw ?? '{}'), undefined);
		} catch (err) {
			storageService.remove(ChatAgentNameService.StorageKey, StorageScope.APPLICATION);
		}

		this.refresh();
	}

	private refresh(): void {
		if (this.disposed) {
			return;
		}

		this.update()
			.catch(err => this.logService.warn('Failed to fetch chat participant registry', err))
			.then(() => timeout(5 * 60 * 1000)) // every 5 minutes
			.then(() => this.refresh());
	}

	private async update(): Promise<void> {
		const context = await this.requestService.request({ type: 'GET', url: this.url }, CancellationToken.None);

		if (context.res.statusCode !== 200) {
			throw new Error('Could not get extensions report.');
		}

		const result = await asJson<IChatParticipantRegistryResponse>(context);

		if (!result || result.version !== 1) {
			throw new Error('Unexpected chat participant registry response.');
		}

		const registry = result.restrictedChatParticipants;
		this.registry.set(registry, undefined);
		this.storageService.store(ChatAgentNameService.StorageKey, JSON.stringify(registry), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	/**
	 * Returns true if the agent is allowed to use this name
	 */
	getAgentNameRestriction(chatAgentData: IChatAgentData): boolean {
		// TODO would like to use observables here but nothing uses it downstream and I'm not sure how to combine these two
		const nameAllowed = this.checkAgentNameRestriction(chatAgentData.name, chatAgentData).get();
		const fullNameAllowed = !chatAgentData.fullName || this.checkAgentNameRestriction(chatAgentData.fullName.replace(/\s/g, ''), chatAgentData).get();
		return nameAllowed && fullNameAllowed;
	}

	private checkAgentNameRestriction(name: string, chatAgentData: IChatAgentData): IObservable<boolean> {
		// Registry is a map of name to an array of extension publisher IDs or extension IDs that are allowed to use it.
		// Look up the list of extensions that are allowed to use this name
		const allowList = this.registry.map<string[] | undefined>(registry => registry[name.toLowerCase()]);
		return allowList.map(allowList => {
			if (!allowList) {
				return true;
			}

			return allowList.some(id => equalsIgnoreCase(id, id.includes('.') ? chatAgentData.extensionId.value : chatAgentData.extensionPublisherId));
		});
	}

	dispose() {
		this.disposed = true;
	}
}

export function getFullyQualifiedId(chatAgentData: IChatAgentData): string {
	return `${chatAgentData.extensionId.value}.${chatAgentData.id}`;
}

export function reviveSerializedAgent(raw: ISerializableChatAgentData): IChatAgentData {
	const agent = 'name' in raw ?
		raw :
		{
			...(raw as any),
			name: (raw as any).id,
		};

	// Fill in required fields that may be missing from old data
	if (!('extensionPublisherId' in agent)) {
		agent.extensionPublisherId = agent.extensionPublisher ?? '';
	}

	if (!('extensionDisplayName' in agent)) {
		agent.extensionDisplayName = '';
	}

	if (!('extensionId' in agent)) {
		agent.extensionId = new ExtensionIdentifier('');
	}

	return revive(agent);
}
