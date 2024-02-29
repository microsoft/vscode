/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ProviderResult } from 'vs/editor/common/languages';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatModel, IChatProgressResponseContent, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatFollowup, IChatProgress, IChatResponseErrorDetails } from 'vs/workbench/contrib/chat/common/chatService';

//#region agent service, commands etc

export interface IChatAgentHistoryEntry {
	request: IChatAgentRequest;
	response: ReadonlyArray<IChatProgressResponseContent>;
	result: IChatAgentResult;
}

export interface IChatAgentData {
	id: string;
	extensionId: ExtensionIdentifier;
	metadata: IChatAgentMetadata;
}

export interface IChatAgent extends IChatAgentData {
	invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	provideFollowups?(request: IChatAgentRequest, result: IChatAgentResult, token: CancellationToken): Promise<IChatFollowup[]>;
	getLastSlashCommands(model: IChatModel): IChatAgentCommand[] | undefined;
	provideSlashCommands(model: IChatModel | undefined, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentCommand[]>;
	provideWelcomeMessage?(token: CancellationToken): ProviderResult<(string | IMarkdownString)[] | undefined>;
	provideSampleQuestions?(token: CancellationToken): ProviderResult<IChatFollowup[] | undefined>;
}

export interface IChatAgentCommand {
	name: string;
	description: string;

	/**
	 * Whether the command should execute as soon
	 * as it is entered. Defaults to `false`.
	 */
	executeImmediately?: boolean;

	/**
	 * Whether executing the command puts the
	 * chat into a persistent mode, where the
	 * slash command is prepended to the chat input.
	 */
	isSticky?: boolean;

	/**
	 * Placeholder text to render in the chat input
	 * when the slash command has been repopulated.
	 * Has no effect if `shouldRepopulate` is `false`.
	 */
	followupPlaceholder?: string;

	sampleRequest?: string;
}

export interface IChatAgentMetadata {
	description?: string;
	isDefault?: boolean; // The agent invoked when no agent is specified
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
}


export interface IChatAgentRequest {
	sessionId: string;
	requestId: string;
	agentId: string;
	command?: string;
	message: string;
	variables: IChatRequestVariableData;
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

export interface IChatAgentService {
	_serviceBrand: undefined;
	/**
	 * undefined when an agent was removed
	 */
	readonly onDidChangeAgents: Event<IChatAgent | undefined>;
	registerAgent(agent: IChatAgent): IDisposable;
	invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, token: CancellationToken): Promise<IChatFollowup[]>;
	getAgents(): Array<IChatAgent>;
	getAgent(id: string): IChatAgent | undefined;
	getDefaultAgent(): IChatAgent | undefined;
	getSecondaryAgent(): IChatAgent | undefined;
	hasAgent(id: string): boolean;
	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void;
}

export class ChatAgentService extends Disposable implements IChatAgentService {

	public static readonly AGENT_LEADER = '@';

	declare _serviceBrand: undefined;

	private readonly _agents = new Map<string, { agent: IChatAgent }>();

	private readonly _onDidChangeAgents = this._register(new Emitter<IChatAgent | undefined>());
	readonly onDidChangeAgents: Event<IChatAgent | undefined> = this._onDidChangeAgents.event;

	override dispose(): void {
		super.dispose();
		this._agents.clear();
	}

	registerAgent(agent: IChatAgent): IDisposable {
		if (this._agents.has(agent.id)) {
			throw new Error(`Already registered an agent with id ${agent.id}`);
		}
		this._agents.set(agent.id, { agent });
		this._onDidChangeAgents.fire(agent);

		return toDisposable(() => {
			if (this._agents.delete(agent.id)) {
				this._onDidChangeAgents.fire(undefined);
			}
		});
	}

	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id} registered`);
		}
		data.agent.metadata = { ...data.agent.metadata, ...updateMetadata };
		this._onDidChangeAgents.fire(data.agent);
	}

	getDefaultAgent(): IChatAgent | undefined {
		return Iterable.find(this._agents.values(), a => !!a.agent.metadata.isDefault)?.agent;
	}

	getSecondaryAgent(): IChatAgent | undefined {
		return Iterable.find(this._agents.values(), a => !!a.agent.metadata.isSecondary)?.agent;
	}

	getAgents(): Array<IChatAgent> {
		return Array.from(this._agents.values(), v => v.agent);
	}

	hasAgent(id: string): boolean {
		return this._agents.has(id);
	}

	getAgent(id: string): IChatAgent | undefined {
		const data = this._agents.get(id);
		return data?.agent;
	}

	async invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id}`);
		}

		return await data.agent.invoke(request, progress, history, token);
	}

	async getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, token: CancellationToken): Promise<IChatFollowup[]> {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id}`);
		}

		if (!data.agent.provideFollowups) {
			return [];
		}

		return data.agent.provideFollowups(request, result, token);
	}
}
