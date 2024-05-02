/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable } from 'vs/base/common/observable';
import { observableValue } from 'vs/base/common/observableInternal/base';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ProviderResult } from 'vs/editor/common/languages';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { asJson, IRequestService } from 'vs/platform/request/common/request';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { CONTEXT_CHAT_ENABLED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatProgressResponseContent, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IRawChatCommandContribution, RawChatParticipantLocation } from 'vs/workbench/contrib/chat/common/chatParticipantContribTypes';
import { IChatFollowup, IChatProgress, IChatResponseErrorDetails } from 'vs/workbench/contrib/chat/common/chatService';

//#region agent service, commands etc

export interface IChatAgentHistoryEntry {
	request: IChatAgentRequest;
	response: ReadonlyArray<IChatProgressResponseContent>;
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
	description?: string;
	extensionId: ExtensionIdentifier;
	extensionPublisherId: string;
	extensionPublisherDisplayName?: string;
	extensionDisplayName: string;
	/** The agent invoked when no agent is specified */
	isDefault?: boolean;
	metadata: IChatAgentMetadata;
	slashCommands: IChatAgentCommand[];
	defaultImplicitVariables?: string[];
	locations: ChatAgentLocation[];
}

export interface IChatAgentImplementation {
	invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	provideFollowups?(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]>;
	provideWelcomeMessage?(location: ChatAgentLocation, token: CancellationToken): ProviderResult<(string | IMarkdownString)[] | undefined>;
	provideSampleQuestions?(location: ChatAgentLocation, token: CancellationToken): ProviderResult<IChatFollowup[] | undefined>;
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
	fullName?: string;
	icon?: URI;
	iconDark?: URI;
	themeIcon?: ThemeIcon;
	sampleRequest?: string;
	supportIssueReporting?: boolean;
	followupPlaceholder?: string;
	isSticky?: boolean;
	requester?: IChatRequesterInformation;
}


export interface IChatAgentRequest {
	sessionId: string;
	requestId: string;
	agentId: string;
	command?: string;
	message: string;
	attempt?: number;
	enableCommandDetection?: boolean;
	variables: IChatRequestVariableData;
	location: ChatAgentLocation;
}

export interface IChatAgentResult {
	errorDetails?: IChatResponseErrorDetails;
	timings?: {
		firstProgress?: number;
		totalElapsed: number;
	};
	/** Extra properties that the agent can use to identify a result */
	readonly metadata?: { readonly [key: string]: any };
}

export const IChatAgentService = createDecorator<IChatAgentService>('chatAgentService');

interface IChatAgentEntry {
	data: IChatAgentData;
	impl?: IChatAgentImplementation;
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
	invokeAgent(agent: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]>;
	getAgent(id: string): IChatAgentData | undefined;
	getAgents(): IChatAgentData[];
	getActivatedAgents(): Array<IChatAgent>;
	getAgentsByName(name: string): IChatAgentData[];

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

	private _agents: IChatAgentEntry[] = [];

	private readonly _onDidChangeAgents = new Emitter<IChatAgent | undefined>();
	readonly onDidChangeAgents: Event<IChatAgent | undefined> = this._onDidChangeAgents.event;

	private readonly _hasDefaultAgent: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		this._hasDefaultAgent = CONTEXT_CHAT_ENABLED.bindTo(this.contextKeyService);
	}

	registerAgent(id: string, data: IChatAgentData): IDisposable {
		const existingAgent = this.getAgent(id);
		if (existingAgent) {
			throw new Error(`Agent already registered: ${JSON.stringify(id)}`);
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
		this._agents.push(entry);
		return toDisposable(() => {
			this._agents = this._agents.filter(a => a !== entry);
			this._onDidChangeAgents.fire(undefined);
		});
	}

	registerAgentImplementation(id: string, agentImpl: IChatAgentImplementation): IDisposable {
		const entry = this._getAgentEntry(id);
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
		const agent = { data, impl: agentImpl };
		this._agents.push(agent);
		this._onDidChangeAgents.fire(new MergedChatAgent(data, agentImpl));

		return toDisposable(() => {
			this._agents = this._agents.filter(a => a !== agent);
			this._onDidChangeAgents.fire(undefined);
		});
	}

	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void {
		const agent = this._getAgentEntry(id);
		if (!agent?.impl) {
			throw new Error(`No activated agent with id ${JSON.stringify(id)} registered`);
		}
		agent.data.metadata = { ...agent.data.metadata, ...updateMetadata };
		this._onDidChangeAgents.fire(new MergedChatAgent(agent.data, agent.impl));
	}

	getDefaultAgent(location: ChatAgentLocation): IChatAgent | undefined {
		return this.getActivatedAgents().find(a => !!a.isDefault && a.locations.includes(location));
	}

	getContributedDefaultAgent(location: ChatAgentLocation): IChatAgentData | undefined {
		return this.getAgents().find(a => !!a.isDefault && a.locations.includes(location));
	}

	getSecondaryAgent(): IChatAgentData | undefined {
		// TODO also static
		return Iterable.find(this._agents.values(), a => !!a.data.metadata.isSecondary)?.data;
	}

	private _getAgentEntry(id: string): IChatAgentEntry | undefined {
		return this._agents.find(a => a.data.id === id);
	}

	getAgent(id: string): IChatAgentData | undefined {
		return this._getAgentEntry(id)?.data;
	}

	/**
	 * Returns all agent datas that exist- static registered and dynamic ones.
	 */
	getAgents(): IChatAgentData[] {
		return this._agents.map(entry => entry.data);
	}

	getActivatedAgents(): IChatAgent[] {
		return Array.from(this._agents.values())
			.filter(a => !!a.impl)
			.map(a => new MergedChatAgent(a.data, a.impl!));
	}

	getAgentsByName(name: string): IChatAgentData[] {
		return this.getAgents().filter(a => a.name === name);
	}

	async invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		const data = this._getAgentEntry(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id ${id}`);
		}

		return await data.impl.invoke(request, progress, history, token);
	}

	async getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {
		const data = this._getAgentEntry(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id ${id}`);
		}

		if (!data.impl?.provideFollowups) {
			return [];
		}

		return data.impl.provideFollowups(request, result, history, token);
	}
}

export class MergedChatAgent implements IChatAgent {
	constructor(
		private readonly data: IChatAgentData,
		private readonly impl: IChatAgentImplementation
	) { }

	get id(): string { return this.data.id; }
	get name(): string { return this.data.name ?? ''; }
	get description(): string { return this.data.description ?? ''; }
	get extensionId(): ExtensionIdentifier { return this.data.extensionId; }
	get extensionPublisherId(): string { return this.data.extensionPublisherId; }
	get extensionPublisherDisplayName() { return this.data.extensionPublisherDisplayName; }
	get extensionDisplayName(): string { return this.data.extensionDisplayName; }
	get isDefault(): boolean | undefined { return this.data.isDefault; }
	get metadata(): IChatAgentMetadata { return this.data.metadata; }
	get slashCommands(): IChatAgentCommand[] { return this.data.slashCommands; }
	get defaultImplicitVariables(): string[] | undefined { return this.data.defaultImplicitVariables; }
	get locations(): ChatAgentLocation[] { return this.data.locations; }

	async invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		return this.impl.invoke(request, progress, history, token);
	}

	async provideFollowups(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {
		if (this.impl.provideFollowups) {
			return this.impl.provideFollowups(request, result, history, token);
		}

		return [];
	}

	provideWelcomeMessage(location: ChatAgentLocation, token: CancellationToken): ProviderResult<(string | IMarkdownString)[] | undefined> {
		if (this.impl.provideWelcomeMessage) {
			return this.impl.provideWelcomeMessage(location, token);
		}

		return undefined;
	}

	provideSampleQuestions(location: ChatAgentLocation, token: CancellationToken): ProviderResult<IChatFollowup[] | undefined> {
		if (this.impl.provideSampleQuestions) {
			return this.impl.provideSampleQuestions(location, token);
		}

		return undefined;
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
	getAgentNameRestriction(chatAgentData: IChatAgentData): IObservable<boolean>;
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

	getAgentNameRestriction(chatAgentData: IChatAgentData): IObservable<boolean> {
		const allowList = this.registry.map<string[] | undefined>(registry => registry[chatAgentData.name.toLowerCase()]);
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
