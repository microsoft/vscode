/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Disposable, DisposableStore, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { IChatFollowup, IChatResponseProgressFileTreeData } from 'vs/workbench/contrib/chat/common/chatService';
import { IExtensionService, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

//#region extension point

const agentItem: IJSONSchema = {
	type: 'object',
	required: ['agent', 'detail'],
	properties: {
		agent: {
			type: 'string',
			markdownDescription: localize('agent', "The name of the agent which will be used as prefix.")
		},
		detail: {
			type: 'string',
			markdownDescription: localize('details', "The details of the agent.")
		},
	}
};

const agentItems: IJSONSchema = {
	description: localize('vscode.extension.contributes.slashes', "Contributes agents to chat"),
	oneOf: [
		agentItem,
		{
			type: 'array',
			items: agentItem
		}
	]
};

export const agentsExtPoint = ExtensionsRegistry.registerExtensionPoint<IChatAgentData | IChatAgentData[]>({
	extensionPoint: 'agents',
	jsonSchema: agentItems
});

//#region agent service, commands etc

export interface IChatAgentData {
	id: string;
	metadata: IChatAgentMetadata;
}

function isAgentData(data: any): data is IChatAgentData {
	return typeof data === 'object' && data &&
		typeof data.id === 'string' &&
		typeof data.detail === 'string';
	// (typeof data.sortText === 'undefined' || typeof data.sortText === 'string') &&
	// (typeof data.executeImmediately === 'undefined' || typeof data.executeImmediately === 'boolean');
}

export interface IChatAgentFragment {
	content: string | { treeData: IChatResponseProgressFileTreeData };
}

export interface IChatAgentCommand {
	name: string;
	description: string;
}

export interface IChatAgentMetadata {
	description: string;
	subCommands: IChatAgentCommand[];
	requireCommand?: boolean; // Do some agents not have a default action?
	isImplicit?: boolean; // Only @workspace. slash commands get promoted to the top-level and this agent is invoked when those are used
	fullName?: string;
	icon?: URI;
}

export type IChatAgentCallback = { (prompt: string, progress: IProgress<IChatAgentFragment>, history: IChatMessage[], token: CancellationToken): Promise<{ followUp: IChatFollowup[] } | void> };

export const IChatAgentService = createDecorator<IChatAgentService>('chatAgentService');

export interface IChatAgentService {
	_serviceBrand: undefined;
	readonly onDidChangeAgents: Event<void>;
	registerAgentData(data: IChatAgentData): IDisposable;
	registerAgentCallback(id: string, callback: IChatAgentCallback): IDisposable;
	registerAgent(data: IChatAgentData, callback: IChatAgentCallback): IDisposable;
	invokeAgent(id: string, prompt: string, progress: IProgress<IChatAgentFragment>, history: IChatMessage[], token: CancellationToken): Promise<{ followUp: IChatFollowup[] } | void>;
	getAgents(): Array<IChatAgentData>;
	getAgent(id: string): IChatAgentData | undefined;
	hasAgent(id: string): boolean;
}

type Tuple = { data: IChatAgentData; callback?: IChatAgentCallback };

export class ChatAgentService extends Disposable implements IChatAgentService {

	public static readonly AGENT_LEADER = '@';

	declare _serviceBrand: undefined;

	private readonly _agents = new Map<string, Tuple>();

	private readonly _onDidChangeAgents = this._register(new Emitter<void>());
	readonly onDidChangeAgents: Event<void> = this._onDidChangeAgents.event;

	constructor(@IExtensionService private readonly _extensionService: IExtensionService) {
		super();
	}

	override dispose(): void {
		super.dispose();
		this._agents.clear();
	}

	registerAgentData(data: IChatAgentData): IDisposable {
		if (this._agents.has(data.id)) {
			throw new Error(`Already registered an agent with id ${data.id}}`);
		}
		this._agents.set(data.id, { data });
		this._onDidChangeAgents.fire();

		return toDisposable(() => {
			if (this._agents.delete(data.id)) {
				this._onDidChangeAgents.fire();
			}
		});
	}

	registerAgentCallback(id: string, agentCallback: IChatAgentCallback): IDisposable {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id} registered`);
		}
		data.callback = agentCallback;
		return toDisposable(() => data.callback = undefined);
	}

	registerAgent(data: IChatAgentData, callback: IChatAgentCallback): IDisposable {
		return combinedDisposable(
			this.registerAgentData(data),
			this.registerAgentCallback(data.id, callback)
		);
	}

	getAgents(): Array<IChatAgentData> {
		return Array.from(this._agents.values(), v => v.data);
	}

	hasAgent(id: string): boolean {
		return this._agents.has(id);
	}

	getAgent(id: string): IChatAgentData | undefined {
		const data = this._agents.get(id);
		return data?.data;
	}

	async invokeAgent(id: string, prompt: string, progress: IProgress<IChatAgentFragment>, history: IChatMessage[], token: CancellationToken): Promise<{ followUp: IChatFollowup[] } | void> {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error('No agent with id ${id} NOT registered');
		}
		if (!data.callback) {
			await this._extensionService.activateByEvent(`onChatAgent:${id}`);
		}
		if (!data.callback) {
			throw new Error(`No agent with id ${id} NOT resolved`);
		}

		return await data.callback(prompt, progress, history, token);
	}
}

class ChatAgentContribution implements IWorkbenchContribution {
	constructor(@IChatAgentService chatAgentService: IChatAgentService) {
		const contributions = new DisposableStore();

		agentsExtPoint.setHandler(extensions => {
			contributions.clear();

			for (const entry of extensions) {
				if (!isProposedApiEnabled(entry.description, 'chatAgents')) {
					entry.collector.error(`The ${agentsExtPoint.name} is proposed API`);
					continue;
				}

				const { value } = entry;

				for (const candidate of Iterable.wrap(value)) {

					if (!isAgentData(candidate)) {
						entry.collector.error(localize('invalid', "Invalid {0}: {1}", agentsExtPoint.name, JSON.stringify(candidate)));
						continue;
					}

					contributions.add(chatAgentService.registerAgentData({ ...candidate }));
				}
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ChatAgentContribution, LifecyclePhase.Restored);
