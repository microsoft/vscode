/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableMap, DisposableStore } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatAgentsShape2, IChatAgentCompletionItem, IChatAgentHistoryEntryDto, IMainContext, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostChatProvider } from 'vs/workbench/api/common/extHostChatProvider';
import { CommandsConverter, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IChatAgentCommand, IChatAgentRequest, IChatAgentResult } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatFollowup, IChatProgress, IChatUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { checkProposedApiEnabled, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { Dto } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import type * as vscode from 'vscode';

class ChatAgentResponseStream {

	private _stopWatch = StopWatch.create(false);
	private _isClosed: boolean = false;
	private _firstProgress: number | undefined;
	private _apiObject: vscode.ChatAgentExtendedResponseStream | undefined;

	constructor(
		private readonly _extension: IExtensionDescription,
		private readonly _request: IChatAgentRequest,
		private readonly _proxy: MainThreadChatAgentsShape2,
		private readonly _logService: ILogService,
		private readonly _commandsConverter: CommandsConverter,
		private readonly _sessionDisposables: DisposableStore
	) { }

	close() {
		this._isClosed = true;
	}

	get timings() {
		return {
			firstProgress: this._firstProgress,
			totalElapsed: this._stopWatch.elapsed()
		};
	}

	get apiObject() {

		if (!this._apiObject) {

			const that = this;
			this._stopWatch.reset();

			function throwIfDone(source: Function | undefined) {
				if (that._isClosed) {
					const err = new Error('Response stream has been closed');
					Error.captureStackTrace(err, source);
					throw err;
				}
			}

			const _report = (progress: Dto<IChatProgress>) => {
				// Measure the time to the first progress update with real markdown content
				if (typeof this._firstProgress === 'undefined' && 'content' in progress) {
					this._firstProgress = this._stopWatch.elapsed();
				}
				this._proxy.$handleProgressChunk(this._request.requestId, progress);
			};

			this._apiObject = {
				text(value) {
					throwIfDone(this.text);
					this.markdown(new MarkdownString().appendText(value));
					return this;
				},
				markdown(value) {
					throwIfDone(this.markdown);
					const part = new extHostTypes.ChatResponseMarkdownPart(value);
					const dto = typeConvert.ChatResponseMarkdownPart.to(part);
					_report(dto);
					return this;
				},
				filetree(value, baseUri) {
					throwIfDone(this.filetree);
					const part = new extHostTypes.ChatResponseFileTreePart(value, baseUri);
					const dto = typeConvert.ChatResponseFilesPart.to(part);
					_report(dto);
					return this;
				},
				anchor(value, title?: string) {
					throwIfDone(this.anchor);
					const part = new extHostTypes.ChatResponseAnchorPart(value, title);
					const dto = typeConvert.ChatResponseAnchorPart.to(part);
					_report(dto);
					return this;
				},
				button(value) {
					throwIfDone(this.anchor);
					const part = new extHostTypes.ChatResponseCommandButtonPart(value);
					const dto = typeConvert.ChatResponseCommandButtonPart.to(part, that._commandsConverter, that._sessionDisposables);
					_report(dto);
					return this;
				},
				progress(value) {
					throwIfDone(this.progress);
					const part = new extHostTypes.ChatResponseProgressPart(value);
					const dto = typeConvert.ChatResponseProgressPart.to(part);
					_report(dto);
					return this;
				},
				reference(value) {
					throwIfDone(this.reference);
					const part = new extHostTypes.ChatResponseReferencePart(value);
					const dto = typeConvert.ChatResponseReferencePart.to(part);
					_report(dto);
					return this;
				},
				push(part) {
					throwIfDone(this.push);
					const dto = typeConvert.ChatResponsePart.to(part);
					_report(dto);
					return this;
				},
				report(progress) {
					throwIfDone(this.report);
					if ('placeholder' in progress && 'resolvedContent' in progress) {
						// Ignore for now, this is the deleted Task type
						return;
					}

					const value = typeConvert.ChatResponseProgress.from(that._extension, progress);
					if (!value) {
						that._logService.error('Unknown progress type: ' + JSON.stringify(progress));
						return;
					}

					_report(value);
					return this;
				}
			};
		}

		return this._apiObject;
	}
}

export class ExtHostChatAgents2 implements ExtHostChatAgentsShape2 {

	private static _idPool = 0;

	private readonly _agents = new Map<number, ExtHostChatAgent>();
	private readonly _proxy: MainThreadChatAgentsShape2;

	private readonly _sessionDisposables: DisposableMap<string, DisposableStore> = new DisposableMap();

	constructor(
		mainContext: IMainContext,
		private readonly _extHostChatProvider: ExtHostChatProvider,
		private readonly _logService: ILogService,
		private readonly commands: ExtHostCommands,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);
	}

	createChatAgent(extension: IExtensionDescription, name: string, handler: vscode.ChatAgentExtendedHandler): vscode.ChatAgent2 {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent(extension, name, this._proxy, handle, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, name, {});
		return agent.apiAgent;
	}

	async $invokeAgent(handle: number, request: IChatAgentRequest, context: { history: IChatAgentHistoryEntryDto[] }, token: CancellationToken): Promise<IChatAgentResult | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
		}

		this._extHostChatProvider.$updateAccesslist([{ extension: agent.extension.identifier, enabled: true }]);

		// Init session disposables
		let sessionDisposables = this._sessionDisposables.get(request.sessionId);
		if (!sessionDisposables) {
			sessionDisposables = new DisposableStore();
			this._sessionDisposables.set(request.sessionId, sessionDisposables);
		}

		const stream = new ChatAgentResponseStream(agent.extension, request, this._proxy, this._logService, this.commands.converter, sessionDisposables);
		try {
			const convertedHistory = await this.prepareHistory(request, context);
			const task = agent.invoke(
				typeConvert.ChatAgentRequest.to(request),
				{ history: convertedHistory },
				stream.apiObject,
				token
			);

			return await raceCancellation(Promise.resolve(task).then((result) => {
				if (result?.metadata) {
					try {
						JSON.stringify(result.metadata);
					} catch (err) {
						const msg = `result.metadata MUST be JSON.stringify-able. Got error: ${err.message}`;
						this._logService.error(`[${agent.extension.identifier.value}] [@${agent.id}] ${msg}`, agent.extension);
						return { errorDetails: { message: msg }, timings: stream.timings };
					}
				}
				return { errorDetails: result?.errorDetails, timings: stream.timings, metadata: result?.metadata };
			}), token);

		} catch (e) {
			this._logService.error(e, agent.extension);
			return { errorDetails: { message: localize('errorResponse', "Error from provider: {0}", toErrorMessage(e)), responseIsIncomplete: true } };

		} finally {
			stream.close();
			this._extHostChatProvider.$updateAccesslist([{ extension: agent.extension.identifier, enabled: false }]);
		}
	}

	private async prepareHistory(request: IChatAgentRequest, context: { history: IChatAgentHistoryEntryDto[] }): Promise<vscode.ChatAgentHistoryEntry[]> {
		return coalesce(await Promise.all(context.history
			.map(async h => {
				const ehResult = typeConvert.ChatAgentResult.to(h.result);
				const result: vscode.ChatAgentResult2 = request.agentId === h.request.agentId ?
					ehResult :
					{ ...ehResult, metadata: undefined };
				return {
					request: typeConvert.ChatAgentRequest.to(h.request),
					response: coalesce(h.response.map(r => typeConvert.ChatResponsePart.from(r, this.commands.converter))),
					result,
				} satisfies vscode.ChatAgentHistoryEntry;
			})));
	}

	$releaseSession(sessionId: string): void {
		this._sessionDisposables.deleteAndDispose(sessionId);
	}

	async $provideSlashCommands(handle: number, token: CancellationToken): Promise<IChatAgentCommand[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			// this is OK, the agent might have disposed while the request was in flight
			return [];
		}
		return agent.provideSlashCommands(token);
	}

	$provideFollowups(handle: number, result: IChatAgentResult, token: CancellationToken): Promise<IChatFollowup[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return Promise.resolve([]);
		}

		const ehResult = typeConvert.ChatAgentResult.to(result);
		return agent.provideFollowups(ehResult, token);
	}

	$acceptFeedback(handle: number, result: IChatAgentResult, vote: InteractiveSessionVoteDirection, reportIssue?: boolean): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		const ehResult = typeConvert.ChatAgentResult.to(result);
		let kind: extHostTypes.ChatAgentResultFeedbackKind;
		switch (vote) {
			case InteractiveSessionVoteDirection.Down:
				kind = extHostTypes.ChatAgentResultFeedbackKind.Unhelpful;
				break;
			case InteractiveSessionVoteDirection.Up:
				kind = extHostTypes.ChatAgentResultFeedbackKind.Helpful;
				break;
		}
		agent.acceptFeedback(reportIssue ?
			Object.freeze({ result: ehResult, kind, reportIssue }) :
			Object.freeze({ result: ehResult, kind }));
	}

	$acceptAction(handle: number, result: IChatAgentResult, action: IChatUserActionEvent): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}
		if (action.action.kind === 'vote') {
			// handled by $acceptFeedback
			return;
		}

		const ehResult = typeConvert.ChatAgentResult.to(result);
		if (action.action.kind === 'command') {
			const commandAction: vscode.ChatAgentCommandAction = { kind: 'command', commandButton: typeConvert.ChatResponseProgress.toProgressContent(action.action.commandButton, this.commands.converter) as vscode.ChatAgentCommandButton };
			agent.acceptAction(Object.freeze({ action: commandAction, result: ehResult }));
			return;
		} else {
			agent.acceptAction(Object.freeze({ action: action.action, result: ehResult }));
		}
	}

	async $invokeCompletionProvider(handle: number, query: string, token: CancellationToken): Promise<IChatAgentCompletionItem[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return [];
		}

		const items = await agent.invokeCompletionProvider(query, token);
		return items.map(typeConvert.ChatAgentCompletionItem.from);
	}

	async $provideWelcomeMessage(handle: number, token: CancellationToken): Promise<(string | IMarkdownString)[] | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		return await agent.provideWelcomeMessage(token);
	}

	async $provideSampleQuestions(handle: number, token: CancellationToken): Promise<IChatFollowup[] | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		return await agent.provideSampleQuestions(token);
	}
}

class ExtHostChatAgent {

	private _commandProvider: vscode.ChatAgentCommandProvider | undefined;
	private _followupProvider: vscode.ChatAgentFollowupProvider | undefined;
	private _description: string | undefined;
	private _fullName: string | undefined;
	private _iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon | undefined;
	private _isDefault: boolean | undefined;
	private _helpTextPrefix: string | vscode.MarkdownString | undefined;
	private _helpTextPostfix: string | vscode.MarkdownString | undefined;
	private _sampleRequest?: string;
	private _isSecondary: boolean | undefined;
	private _onDidReceiveFeedback = new Emitter<vscode.ChatAgentResult2Feedback>();
	private _onDidPerformAction = new Emitter<vscode.ChatAgentUserActionEvent>();
	private _supportIssueReporting: boolean | undefined;
	private _agentVariableProvider?: { provider: vscode.ChatAgentCompletionItemProvider; triggerCharacters: string[] };
	private _welcomeMessageProvider?: vscode.ChatAgentWelcomeMessageProvider | undefined;

	constructor(
		public readonly extension: IExtensionDescription,
		public readonly id: string,
		private readonly _proxy: MainThreadChatAgentsShape2,
		private readonly _handle: number,
		private readonly _callback: vscode.ChatAgentExtendedHandler,
	) { }

	acceptFeedback(feedback: vscode.ChatAgentResult2Feedback) {
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

	async provideSlashCommands(token: CancellationToken): Promise<IChatAgentCommand[]> {
		if (!this._commandProvider) {
			return [];
		}
		const result = await this._commandProvider.provideCommands(token);
		if (!result) {
			return [];
		}
		return result
			.map(c => ({
				name: c.name,
				description: c.description,
				followupPlaceholder: c.followupPlaceholder,
				shouldRepopulate: c.shouldRepopulate,
				sampleRequest: c.sampleRequest
			}));
	}

	async provideFollowups(result: vscode.ChatAgentResult2, token: CancellationToken): Promise<IChatFollowup[]> {
		if (!this._followupProvider) {
			return [];
		}
		const followups = await this._followupProvider.provideFollowups(result, token);
		if (!followups) {
			return [];
		}
		return followups
			// Filter out "command followups" from older providers
			.filter(f => !(f && 'commandId' in f))
			.map(f => typeConvert.ChatFollowup.from(f));
	}

	async provideWelcomeMessage(token: CancellationToken): Promise<(string | IMarkdownString)[] | undefined> {
		if (!this._welcomeMessageProvider) {
			return [];
		}
		const content = await this._welcomeMessageProvider.provideWelcomeMessage(token);
		if (!content) {
			return [];
		}
		return content.map(item => {
			if (typeof item === 'string') {
				return item;
			} else {
				return typeConvert.MarkdownString.from(item);
			}
		});
	}

	async provideSampleQuestions(token: CancellationToken): Promise<IChatFollowup[]> {
		if (!this._welcomeMessageProvider || !this._welcomeMessageProvider.provideSampleQuestions) {
			return [];
		}
		const content = await this._welcomeMessageProvider.provideSampleQuestions(token);
		if (!content) {
			return [];
		}

		return content?.map(f => typeConvert.ChatFollowup.from(f));
	}

	get apiAgent(): vscode.ChatAgent2 {
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
					hasSlashCommands: this._commandProvider !== undefined,
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
			get commandProvider() {
				return that._commandProvider;
			},
			set commandProvider(v) {
				that._commandProvider = v;
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
			set welcomeMessageProvider(v) {
				that._welcomeMessageProvider = v;
				updateMetadataSoon();
			},
			get welcomeMessageProvider() {
				return that._welcomeMessageProvider;
			},
			onDidPerformAction: !isProposedApiEnabled(this.extension, 'chatAgents2Additions')
				? undefined!
				: this._onDidPerformAction.event
			,
			dispose() {
				disposed = true;
				that._commandProvider = undefined;
				that._followupProvider = undefined;
				that._onDidReceiveFeedback.dispose();
				that._proxy.$unregisterAgent(that._handle);
			},
		} satisfies vscode.ChatAgent2;
	}

	invoke(request: vscode.ChatAgentRequest, context: vscode.ChatAgentContext, response: vscode.ChatAgentExtendedResponseStream, token: CancellationToken): vscode.ProviderResult<vscode.ChatAgentResult2> {
		return this._callback(request, context, response, token);
	}
}
