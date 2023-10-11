/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Progress } from 'vs/platform/progress/common/progress';
import { ExtHostChatAgentsShape2, IMainContext, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostChatProvider } from 'vs/workbench/api/common/extHostChatProvider';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { IChatAgentCommand, IChatAgentRequest, IChatAgentResult } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { IChatFollowup } from 'vs/workbench/contrib/chat/common/chatService';
import type * as vscode from 'vscode';

export class ExtHostChatAgents2 implements ExtHostChatAgentsShape2 {

	private static _idPool = 0;

	private readonly _agents = new Map<number, ExtHostChatAgent>();
	private readonly _proxy: MainThreadChatAgentsShape2;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostChatProvider: ExtHostChatProvider,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);
	}

	createChatAgent(extension: ExtensionIdentifier, name: string, description: string, fullName: string | undefined, icon: vscode.Uri | undefined, handler?: vscode.ChatAgentHandler): vscode.ChatAgent2 {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent(extension, name, this._proxy, handle, description, fullName, icon, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, name, { description, fullName, icon, subCommands: [] });
		return agent.apiAgent;
	}

	async $invokeAgent(handle: number, requestId: number, request: IChatAgentRequest, context: { history: IChatMessage[] }, token: CancellationToken): Promise<IChatAgentResult | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
		}

		let done = false;
		function throwIfDone() {
			if (done) {
				throw new Error('Only valid while executing the command');
			}
		}

		const commandExecution = new DeferredPromise<void>();
		token.onCancellationRequested(() => commandExecution.complete());
		setTimeout(() => commandExecution.complete(), 3 * 1000);
		this._extHostChatProvider.allowListExtensionWhile(agent.extension, commandExecution.p);

		const slashCommand = request.command ? agent.slashCommands.find(s => s.name === request.command) : undefined;
		if (request.command && !slashCommand) {
			throw new Error(`Unknown slashCommand: ${request.command}`);
		}

		const task = agent.invoke(
			{ message: request.message, variables: {}, slashCommand },
			{ history: context.history.map(typeConvert.ChatMessage.to) },
			new Progress<vscode.InteractiveProgress>(p => {
				throwIfDone();
				const convertedProgress = typeConvert.ChatResponseProgress.from(p);
				this._proxy.$handleProgressChunk(requestId, convertedProgress);
			}),
			token
		);

		try {
			return await raceCancellation(Promise.resolve(task).then((result) => {
				if (result) {
					// An option would be to call provideFollowups here and send the result back to the renderer, rather than store the result
					// and wait for the renderer to ask for followups
					// agent.provideFollowups(result, token);
					return { errorDetails: result.errorDetails }; // TODO timings here
				}

				return undefined;
			}), token);
		} finally {
			done = true;
			commandExecution.complete();
		}
	}

	async $provideSlashCommands(handle: number, token: CancellationToken): Promise<IChatAgentCommand[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			// this is OK, the agent might have disposed while the request was in flight
			return [];
		}
		return agent.provideSlashCommand(token);
	}

	async $provideFollowups(handle: number, requestId: number, token: CancellationToken): Promise<IChatFollowup[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			// this is OK, the agent might have disposed while the request was in flight
			return [];
		}

		// TODO look up result object based on requestId
		return agent.provideFollowups(null!, token);
	}
}

class ExtHostChatAgent {

	private _slashCommands: vscode.SlashCommand[] = [];
	private _slashCommandProvider: vscode.SlashCommandProvider | undefined;

	private _followupProvider: vscode.FollowupProvider | undefined;

	constructor(
		public readonly extension: ExtensionIdentifier,
		private readonly _id: string,
		private readonly _proxy: MainThreadChatAgentsShape2,
		private readonly _handle: number,
		private _description: string | undefined,
		private _fullName: string | undefined,
		private _icon: vscode.Uri | undefined,
		private readonly _callback?: vscode.ChatAgentHandler,
	) { }

	get slashCommands(): ReadonlyArray<vscode.SlashCommand> {
		return this._slashCommands;
	}

	async provideSlashCommand(token: CancellationToken): Promise<IChatAgentCommand[]> {
		if (!this._slashCommandProvider) {
			return [];
		}
		const result = await this._slashCommandProvider.provideSlashCommands(token);
		if (!result) {
			return [];
		}
		return result.map(c => ({ name: c.name, description: c.description }));
	}

	async provideFollowups(result: vscode.AgentResult, token: CancellationToken): Promise<IChatFollowup[]> {
		if (!this._followupProvider) {
			return [];
		}
		const followups = await this._followupProvider.provideFollowups(result, token);
		if (!followups) {
			return [];
		}
		return followups.map(f => typeConvert.ChatFollowup.from(f));
	}

	get apiAgent(): vscode.ChatAgent2 {
		const that = this;

		return {
			get name() {
				return that._id;
			},
			get description() {
				return that._description ?? '';
			},
			get fullName() {
				return that._fullName;
			},
			get icon() {
				return that._icon;
			},
			// onDidPerformAction
			get slashCommandProvider() {
				return that._slashCommandProvider;
			},
			set slashCommandProvider(v) {
				that._slashCommandProvider = v;
			},
			get followupProvider() {
				return that._followupProvider;
			},
			set followupProvider(v) {
				that._followupProvider = v;
			},
			get slashCommands() { return that._slashCommands; },
			set slashCommands(v) {
				that._slashCommands = v;
				that._proxy.$updateAgent(that._handle, { subCommands: v.map(c => ({ name: c.name, description: c.description })) });
			},
			dispose() {
				that._proxy.$unregisterAgent(that._handle);
			},
		} satisfies vscode.ChatAgent2;
	}

	invoke(request: vscode.AgentRequest, context: vscode.ChatAgentContext, progress: Progress<vscode.InteractiveProgress>, token: CancellationToken): vscode.ProviderResult<vscode.AgentResult> {
		return this._callback?.(request, context, progress, token);
	}
}
