/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { DeferredPromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { Progress } from 'vs/platform/progress/common/progress';
import { ExtHostChatAgentsShape2, IChatAgentCompletionItem, IChatAgentHistoryEntryDto, IMainContext, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostChatProvider } from 'vs/workbench/api/common/extHostChatProvider';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IChatAgentCommand, IChatAgentRequest, IChatAgentResult } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatFollowup, IChatUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { checkProposedApiEnabled, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import type * as vscode from 'vscode';

export class ExtHostChatAgents2 implements ExtHostChatAgentsShape2 {

	private static _idPool = 0;

	private readonly _agents = new Map<number, ExtHostChatAgent<any>>();
	private readonly _proxy: MainThreadChatAgentsShape2;

	private readonly _previousResultMap: Map<string, vscode.ChatAgentResult2> = new Map();
	private readonly _resultsBySessionAndRequestId: Map<string, Map<string, vscode.ChatAgentResult2>> = new Map();

	constructor(
		mainContext: IMainContext,
		private readonly _extHostChatProvider: ExtHostChatProvider,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);
	}

	createChatAgent<TResult extends vscode.ChatAgentResult2>(extension: IExtensionDescription, name: string, handler: vscode.ChatAgentExtendedHandler): vscode.ChatAgent2<TResult> {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent<TResult>(extension, name, this._proxy, handle, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, name, {});
		return agent.apiAgent;
	}

	async $invokeAgent(handle: number, request: IChatAgentRequest, context: { history: IChatAgentHistoryEntryDto[] }, token: CancellationToken): Promise<IChatAgentResult | undefined> {
		// Clear the previous result so that $acceptFeedback or $acceptAction during a request will be ignored.
		// We may want to support sending those during a request.
		this._previousResultMap.delete(request.sessionId);

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
		this._extHostChatProvider.allowListExtensionWhile(agent.extension.identifier, commandExecution.p);

		const slashCommand = request.command
			? await agent.validateSlashCommand(request.command)
			: undefined;

		const stopWatch = StopWatch.create(false);
		let firstProgress: number | undefined;
		try {
			const convertedHistory = await this.prepareHistory(agent, request, context);
			const task = agent.invoke(
				typeConvert.ChatAgentRequest.to(request, slashCommand),
				{ history: convertedHistory },
				new Progress<vscode.ChatAgentExtendedProgress>(progress => {
					throwIfDone();

					// Measure the time to the first progress update with real markdown content
					if (typeof firstProgress === 'undefined' && 'content' in progress) {
						firstProgress = stopWatch.elapsed();
					}

					const convertedProgress = typeConvert.ChatResponseProgress.from(agent.extension, progress);
					if (!convertedProgress) {
						this._logService.error('Unknown progress type: ' + JSON.stringify(progress));
						return;
					}

					if ('placeholder' in progress && 'resolvedContent' in progress) {
						// Ignore for now, this is the deleted Task type
					} else {
						this._proxy.$handleProgressChunk(request.requestId, convertedProgress);
					}
				}),
				token
			);

			return await raceCancellation(Promise.resolve(task).then((result) => {
				if (result) {
					this._previousResultMap.set(request.sessionId, result);
					let sessionResults = this._resultsBySessionAndRequestId.get(request.sessionId);
					if (!sessionResults) {
						sessionResults = new Map();
						this._resultsBySessionAndRequestId.set(request.sessionId, sessionResults);
					}
					sessionResults.set(request.requestId, result);

					const timings = { firstProgress: firstProgress, totalElapsed: stopWatch.elapsed() };
					return { errorDetails: result.errorDetails, timings };
				} else {
					this._previousResultMap.delete(request.sessionId);
				}

				return undefined;
			}), token);

		} catch (e) {
			this._logService.error(e, agent.extension);
			return { errorDetails: { message: localize('errorResponse', "Error from provider: {0}", toErrorMessage(e)), responseIsIncomplete: true } };

		} finally {
			done = true;
			commandExecution.complete();
		}
	}

	private async prepareHistory<T extends vscode.ChatAgentResult2>(agent: ExtHostChatAgent<T>, request: IChatAgentRequest, context: { history: IChatAgentHistoryEntryDto[] }): Promise<vscode.ChatAgentHistoryEntry[]> {
		return coalesce(await Promise.all(context.history
			.map(async h => {
				const result = request.agentId === h.request.agentId && this._resultsBySessionAndRequestId.get(request.sessionId)?.get(h.request.requestId)
					|| h.result;
				return {
					request: typeConvert.ChatAgentRequest.to(h.request, undefined),
					response: coalesce(h.response.map(r => typeConvert.ChatResponseProgress.toProgressContent(r))),
					result
				} satisfies vscode.ChatAgentHistoryEntry;
			})));
	}

	$releaseSession(sessionId: string): void {
		this._previousResultMap.delete(sessionId);
		this._resultsBySessionAndRequestId.delete(sessionId);
	}

	async $provideSlashCommands(handle: number, token: CancellationToken): Promise<IChatAgentCommand[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			// this is OK, the agent might have disposed while the request was in flight
			return [];
		}
		return agent.provideSlashCommand(token);
	}

	$provideFollowups(handle: number, sessionId: string, token: CancellationToken): Promise<IChatFollowup[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return Promise.resolve([]);
		}

		const result = this._previousResultMap.get(sessionId);
		if (!result) {
			return Promise.resolve([]);
		}

		return agent.provideFollowups(result, token);
	}

	$acceptFeedback(handle: number, sessionId: string, requestId: string, vote: InteractiveSessionVoteDirection, reportIssue?: boolean): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}
		const result = this._resultsBySessionAndRequestId.get(sessionId)?.get(requestId);
		if (!result) {
			return;
		}

		let kind: extHostTypes.ChatAgentResultFeedbackKind;
		switch (vote) {
			case InteractiveSessionVoteDirection.Down:
				kind = extHostTypes.ChatAgentResultFeedbackKind.Unhelpful;
				break;
			case InteractiveSessionVoteDirection.Up:
				kind = extHostTypes.ChatAgentResultFeedbackKind.Helpful;
				break;
		}
		agent.acceptFeedback(reportIssue ? Object.freeze({ result, kind, reportIssue }) : Object.freeze({ result, kind }));
	}

	$acceptAction(handle: number, sessionId: string, requestId: string, action: IChatUserActionEvent): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}
		const result = this._resultsBySessionAndRequestId.get(sessionId)?.get(requestId);
		if (!result) {
			return;
		}
		if (action.action.kind === 'vote') {
			// handled by $acceptFeedback
			return;
		}
		agent.acceptAction(Object.freeze({ action: action.action, result }));
	}

	async $invokeCompletionProvider(handle: number, query: string, token: CancellationToken): Promise<IChatAgentCompletionItem[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return [];
		}

		const items = await agent.invokeCompletionProvider(query, token);
		return items.map(typeConvert.ChatAgentCompletionItem.from);
	}
}

class ExtHostChatAgent<TResult extends vscode.ChatAgentResult2> {

	private _slashCommandProvider: vscode.ChatAgentSubCommandProvider | undefined;
	private _lastSlashCommands: vscode.ChatAgentSubCommand[] | undefined;
	private _followupProvider: vscode.FollowupProvider<TResult> | undefined;
	private _description: string | undefined;
	private _fullName: string | undefined;
	private _iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon | undefined;
	private _isDefault: boolean | undefined;
	private _helpTextPrefix: string | vscode.MarkdownString | undefined;
	private _helpTextPostfix: string | vscode.MarkdownString | undefined;
	private _sampleRequest?: string;
	private _isSecondary: boolean | undefined;
	private _onDidReceiveFeedback = new Emitter<vscode.ChatAgentResult2Feedback<TResult>>();
	private _onDidPerformAction = new Emitter<vscode.ChatAgentUserActionEvent>();
	private _supportIssueReporting: boolean | undefined;
	private _agentVariableProvider?: { provider: vscode.ChatAgentCompletionItemProvider; triggerCharacters: string[] };

	constructor(
		public readonly extension: IExtensionDescription,
		public readonly id: string,
		private readonly _proxy: MainThreadChatAgentsShape2,
		private readonly _handle: number,
		private readonly _callback: vscode.ChatAgentExtendedHandler,
	) { }

	acceptFeedback(feedback: vscode.ChatAgentResult2Feedback<TResult>) {
		this._onDidReceiveFeedback.fire(feedback);
	}

	acceptAction(event: vscode.ChatAgentUserActionEvent) {
		this._onDidPerformAction.fire(event);
	}

	async invokeCompletionProvider(query: string, token: CancellationToken): Promise<vscode.ChatAgentCompletionItem[]> {
		if (!this._agentVariableProvider) {
			return [];
		}

		return await this._agentVariableProvider.provider.provideCompletionItems(query, token) ?? [];
	}

	async validateSlashCommand(command: string) {
		if (!this._lastSlashCommands) {
			await this.provideSlashCommand(CancellationToken.None);
			assertType(this._lastSlashCommands);
		}
		const result = this._lastSlashCommands.find(candidate => candidate.name === command);
		if (!result) {
			throw new Error(`Unknown slashCommand: ${command}`);

		}
		return result;
	}

	async provideSlashCommand(token: CancellationToken): Promise<IChatAgentCommand[]> {
		if (!this._slashCommandProvider) {
			return [];
		}
		const result = await this._slashCommandProvider.provideSubCommands(token);
		if (!result) {
			return [];
		}
		this._lastSlashCommands = result;
		return result
			.map(c => ({
				name: c.name,
				description: c.description,
				followupPlaceholder: c.followupPlaceholder,
				shouldRepopulate: c.shouldRepopulate,
				sampleRequest: c.sampleRequest
			}));
	}

	async provideFollowups(result: TResult, token: CancellationToken): Promise<IChatFollowup[]> {
		if (!this._followupProvider) {
			return [];
		}
		const followups = await this._followupProvider.provideFollowups(result, token);
		if (!followups) {
			return [];
		}
		return followups.map(f => typeConvert.ChatFollowup.from(f));
	}

	get apiAgent(): vscode.ChatAgent2<TResult> {
		let disposed = false;
		let updateScheduled = false;
		const updateMetadataSoon = () => {
			if (disposed) {
				return;
			}
			if (updateScheduled) {
				return;
			}
			updateScheduled = true;
			queueMicrotask(() => {
				this._proxy.$updateAgent(this._handle, {
					description: this._description ?? '',
					fullName: this._fullName,
					icon: !this._iconPath ? undefined :
						this._iconPath instanceof URI ? this._iconPath :
							'light' in this._iconPath ? this._iconPath.light :
								undefined,
					iconDark: !this._iconPath ? undefined :
						'dark' in this._iconPath ? this._iconPath.dark :
							undefined,
					themeIcon: this._iconPath instanceof extHostTypes.ThemeIcon ? this._iconPath : undefined,
					hasSlashCommands: this._slashCommandProvider !== undefined,
					hasFollowups: this._followupProvider !== undefined,
					isDefault: this._isDefault,
					isSecondary: this._isSecondary,
					helpTextPrefix: (!this._helpTextPrefix || typeof this._helpTextPrefix === 'string') ? this._helpTextPrefix : typeConvert.MarkdownString.from(this._helpTextPrefix),
					helpTextPostfix: (!this._helpTextPostfix || typeof this._helpTextPostfix === 'string') ? this._helpTextPostfix : typeConvert.MarkdownString.from(this._helpTextPostfix),
					sampleRequest: this._sampleRequest,
					supportIssueReporting: this._supportIssueReporting
				});
				updateScheduled = false;
			});
		};

		const that = this;
		return {
			get name() {
				return that.id;
			},
			get description() {
				return that._description ?? '';
			},
			set description(v) {
				that._description = v;
				updateMetadataSoon();
			},
			get fullName() {
				return that._fullName ?? that.extension.displayName ?? that.extension.name;
			},
			set fullName(v) {
				that._fullName = v;
				updateMetadataSoon();
			},
			get iconPath() {
				return that._iconPath;
			},
			set iconPath(v) {
				that._iconPath = v;
				updateMetadataSoon();
			},
			get subCommandProvider() {
				return that._slashCommandProvider;
			},
			set subCommandProvider(v) {
				that._slashCommandProvider = v;
				updateMetadataSoon();
			},
			get followupProvider() {
				return that._followupProvider;
			},
			set followupProvider(v) {
				that._followupProvider = v;
				updateMetadataSoon();
			},
			get isDefault() {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				return that._isDefault;
			},
			set isDefault(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				that._isDefault = v;
				updateMetadataSoon();
			},
			get helpTextPrefix() {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				return that._helpTextPrefix;
			},
			set helpTextPrefix(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				if (!that._isDefault) {
					throw new Error('helpTextPrefix is only available on the default chat agent');
				}

				that._helpTextPrefix = v;
				updateMetadataSoon();
			},
			get helpTextPostfix() {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				return that._helpTextPostfix;
			},
			set helpTextPostfix(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				if (!that._isDefault) {
					throw new Error('helpTextPostfix is only available on the default chat agent');
				}

				that._helpTextPostfix = v;
				updateMetadataSoon();
			},
			get isSecondary() {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				return that._isSecondary;
			},
			set isSecondary(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatAgent');
				that._isSecondary = v;
				updateMetadataSoon();
			},
			get sampleRequest() {
				return that._sampleRequest;
			},
			set sampleRequest(v) {
				that._sampleRequest = v;
				updateMetadataSoon();
			},
			get supportIssueReporting() {
				checkProposedApiEnabled(that.extension, 'chatAgents2Additions');
				return that._supportIssueReporting;
			},
			set supportIssueReporting(v) {
				checkProposedApiEnabled(that.extension, 'chatAgents2Additions');
				that._supportIssueReporting = v;
				updateMetadataSoon();
			},
			get onDidReceiveFeedback() {
				return that._onDidReceiveFeedback.event;
			},
			set agentVariableProvider(v) {
				that._agentVariableProvider = v;
				if (v) {
					if (!v.triggerCharacters.length) {
						throw new Error('triggerCharacters are required');
					}

					that._proxy.$registerAgentCompletionsProvider(that._handle, v.triggerCharacters);
				} else {
					that._proxy.$unregisterAgentCompletionsProvider(that._handle);
				}
			},
			get agentVariableProvider() {
				return that._agentVariableProvider;
			},
			onDidPerformAction: !isProposedApiEnabled(this.extension, 'chatAgents2Additions')
				? undefined!
				: this._onDidPerformAction.event
			,
			dispose() {
				disposed = true;
				that._slashCommandProvider = undefined;
				that._followupProvider = undefined;
				that._onDidReceiveFeedback.dispose();
				that._proxy.$unregisterAgent(that._handle);
			},
		} satisfies vscode.ChatAgent2<TResult>;
	}

	invoke(request: vscode.ChatAgentRequest, context: vscode.ChatAgentContext, progress: Progress<vscode.ChatAgentExtendedProgress>, token: CancellationToken): vscode.ProviderResult<vscode.ChatAgentResult2> {
		return this._callback(request, context, progress, token);
	}
}
