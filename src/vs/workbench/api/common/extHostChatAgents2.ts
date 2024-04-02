/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Location } from 'vs/editor/common/languages';
import { coalesce } from 'vs/base/common/arrays';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { DisposableMap, DisposableStore } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatAgentsShape2, IChatAgentCompletionItem, IChatAgentHistoryEntryDto, IMainContext, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { CommandsConverter, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IChatAgentRequest, IChatAgentResult } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatContentReference, IChatFollowup, IChatProgress, IChatUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { checkProposedApiEnabled, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { Dto } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import type * as vscode from 'vscode';

class ChatAgentResponseStream {

	private _stopWatch = StopWatch.create(false);
	private _isClosed: boolean = false;
	private _firstProgress: number | undefined;
	private _apiObject: vscode.ChatExtendedResponseStream | undefined;

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

					if ('variableName' in value && !value.value) {
						// The participant used this variable. Does that variable have any references to pull in?
						const matchingVarData = that._request.variables.variables.find(v => v.name === value.variableName);
						if (matchingVarData) {
							let references: Dto<IChatContentReference>[] | undefined;
							if (matchingVarData.references?.length) {
								references = matchingVarData.references.map(r => ({
									kind: 'reference',
									reference: { variableName: value.variableName, value: r.reference as URI | Location }
								} satisfies IChatContentReference));
							} else {
								// Participant sent a variableName reference but the variable produced no references. Show variable reference with no value
								const part = new extHostTypes.ChatResponseReferencePart(value);
								const dto = typeConvert.ChatResponseReferencePart.to(part);
								references = [dto];
							}

							references.forEach(r => _report(r));
							return this;
						} else {
							// Something went wrong- that variable doesn't actually exist
						}
					} else {
						const part = new extHostTypes.ChatResponseReferencePart(value);
						const dto = typeConvert.ChatResponseReferencePart.to(part);
						_report(dto);
					}

					return this;
				},
				push(part) {
					throwIfDone(this.push);

					if (part instanceof extHostTypes.ChatResponseReferencePart) {
						// Ensure variable reference values get fixed up
						this.reference(part.value);
					} else {
						const dto = typeConvert.ChatResponsePart.to(part, that._commandsConverter, that._sessionDisposables);
						_report(dto);
					}

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
		private readonly _logService: ILogService,
		private readonly commands: ExtHostCommands,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);
	}

	createChatAgent(extension: IExtensionDescription, id: string, handler: vscode.ChatExtendedRequestHandler): vscode.ChatParticipant {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, extension.identifier, id, {}, undefined);
		return agent.apiAgent;
	}

	createDynamicChatAgent(extension: IExtensionDescription, id: string, name: string, description: string, handler: vscode.ChatExtendedRequestHandler): vscode.ChatParticipant {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, extension.identifier, id, {}, { name, description });
		return agent.apiAgent;
	}

	async $invokeAgent(handle: number, request: IChatAgentRequest, context: { history: IChatAgentHistoryEntryDto[] }, token: CancellationToken): Promise<IChatAgentResult | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
		}

		// Init session disposables
		let sessionDisposables = this._sessionDisposables.get(request.sessionId);
		if (!sessionDisposables) {
			sessionDisposables = new DisposableStore();
			this._sessionDisposables.set(request.sessionId, sessionDisposables);
		}

		const stream = new ChatAgentResponseStream(agent.extension, request, this._proxy, this._logService, this.commands.converter, sessionDisposables);
		try {
			const convertedHistory = await this.prepareHistoryTurns(request.agentId, context);
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
			return { errorDetails: { message: localize('errorResponse', "Error from participant: {0}", toErrorMessage(e)), responseIsIncomplete: true } };

		} finally {
			stream.close();
		}
	}

	private async prepareHistoryTurns(agentId: string, context: { history: IChatAgentHistoryEntryDto[] }): Promise<(vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]> {

		const res: (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[] = [];

		for (const h of context.history) {
			const ehResult = typeConvert.ChatAgentResult.to(h.result);
			const result: vscode.ChatResult = agentId === h.request.agentId ?
				ehResult :
				{ ...ehResult, metadata: undefined };

			// REQUEST turn
			res.push(new extHostTypes.ChatRequestTurn(h.request.message, h.request.command, h.request.variables.variables.map(typeConvert.ChatAgentResolvedVariable.to), h.request.agentId));

			// RESPONSE turn
			const parts = coalesce(h.response.map(r => typeConvert.ChatResponsePart.fromContent(r, this.commands.converter)));
			res.push(new extHostTypes.ChatResponseTurn(parts, result, h.request.agentId, h.request.command));
		}

		return res;
	}

	$releaseSession(sessionId: string): void {
		this._sessionDisposables.deleteAndDispose(sessionId);
	}

	async $provideFollowups(request: IChatAgentRequest, handle: number, result: IChatAgentResult, context: { history: IChatAgentHistoryEntryDto[] }, token: CancellationToken): Promise<IChatFollowup[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return Promise.resolve([]);
		}

		const convertedHistory = await this.prepareHistoryTurns(agent.id, context);

		const ehResult = typeConvert.ChatAgentResult.to(result);
		return (await agent.provideFollowups(ehResult, { history: convertedHistory }, token))
			.filter(f => {
				// The followup must refer to a participant that exists from the same extension
				const isValid = !f.participant || Iterable.some(
					this._agents.values(),
					a => a.id === f.participant && ExtensionIdentifier.equals(a.extension.identifier, agent.extension.identifier));
				if (!isValid) {
					this._logService.warn(`[@${agent.id}] ChatFollowup refers to an unknown participant: ${f.participant}`);
				}
				return isValid;
			})
			.map(f => typeConvert.ChatFollowup.from(f, request));
	}

	$acceptFeedback(handle: number, result: IChatAgentResult, vote: InteractiveSessionVoteDirection, reportIssue?: boolean): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		const ehResult = typeConvert.ChatAgentResult.to(result);
		let kind: extHostTypes.ChatResultFeedbackKind;
		switch (vote) {
			case InteractiveSessionVoteDirection.Down:
				kind = extHostTypes.ChatResultFeedbackKind.Unhelpful;
				break;
			case InteractiveSessionVoteDirection.Up:
				kind = extHostTypes.ChatResultFeedbackKind.Helpful;
				break;
		}
		agent.acceptFeedback(reportIssue ?
			Object.freeze({ result: ehResult, kind, reportIssue }) :
			Object.freeze({ result: ehResult, kind }));
	}

	$acceptAction(handle: number, result: IChatAgentResult, event: IChatUserActionEvent): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}
		if (event.action.kind === 'vote') {
			// handled by $acceptFeedback
			return;
		}

		const ehAction = typeConvert.ChatAgentUserActionEvent.to(result, event, this.commands.converter);
		if (ehAction) {
			agent.acceptAction(Object.freeze(ehAction));
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

		return (await agent.provideSampleQuestions(token))
			.map(f => typeConvert.ChatFollowup.from(f, undefined));
	}
}

class ExtHostChatAgent {

	private _followupProvider: vscode.ChatFollowupProvider | undefined;
	private _fullName: string | undefined;
	private _iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon | undefined;
	private _isDefault: boolean | undefined;
	private _helpTextPrefix: string | vscode.MarkdownString | undefined;
	private _helpTextVariablesPrefix: string | vscode.MarkdownString | undefined;
	private _helpTextPostfix: string | vscode.MarkdownString | undefined;
	private _sampleRequest?: string;
	private _isSecondary: boolean | undefined;
	private _onDidReceiveFeedback = new Emitter<vscode.ChatResultFeedback>();
	private _onDidPerformAction = new Emitter<vscode.ChatUserActionEvent>();
	private _supportIssueReporting: boolean | undefined;
	private _agentVariableProvider?: { provider: vscode.ChatParticipantCompletionItemProvider; triggerCharacters: string[] };
	private _welcomeMessageProvider?: vscode.ChatWelcomeMessageProvider | undefined;
	private _requester: vscode.ChatRequesterInformation | undefined;

	constructor(
		public readonly extension: IExtensionDescription,
		public readonly id: string,
		private readonly _proxy: MainThreadChatAgentsShape2,
		private readonly _handle: number,
		private _requestHandler: vscode.ChatExtendedRequestHandler,
	) { }

	acceptFeedback(feedback: vscode.ChatResultFeedback) {
		this._onDidReceiveFeedback.fire(feedback);
	}

	acceptAction(event: vscode.ChatUserActionEvent) {
		this._onDidPerformAction.fire(event);
	}

	async invokeCompletionProvider(query: string, token: CancellationToken): Promise<vscode.ChatCompletionItem[]> {
		if (!this._agentVariableProvider) {
			return [];
		}

		return await this._agentVariableProvider.provider.provideCompletionItems(query, token) ?? [];
	}

	async provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: CancellationToken): Promise<vscode.ChatFollowup[]> {
		if (!this._followupProvider) {
			return [];
		}

		const followups = await this._followupProvider.provideFollowups(result, context, token);
		if (!followups) {
			return [];
		}
		return followups
			// Filter out "command followups" from older providers
			.filter(f => !(f && 'commandId' in f))
			// Filter out followups from older providers before 'message' changed to 'prompt'
			.filter(f => !(f && 'message' in f));
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

	async provideSampleQuestions(token: CancellationToken): Promise<vscode.ChatFollowup[]> {
		if (!this._welcomeMessageProvider || !this._welcomeMessageProvider.provideSampleQuestions) {
			return [];
		}
		const content = await this._welcomeMessageProvider.provideSampleQuestions(token);
		if (!content) {
			return [];
		}

		return content;
	}

	get apiAgent(): vscode.ChatParticipant {
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
					fullName: this._fullName,
					icon: !this._iconPath ? undefined :
						this._iconPath instanceof URI ? this._iconPath :
							'light' in this._iconPath ? this._iconPath.light :
								undefined,
					iconDark: !this._iconPath ? undefined :
						'dark' in this._iconPath ? this._iconPath.dark :
							undefined,
					themeIcon: this._iconPath instanceof extHostTypes.ThemeIcon ? this._iconPath : undefined,
					hasFollowups: this._followupProvider !== undefined,
					isSecondary: this._isSecondary,
					helpTextPrefix: (!this._helpTextPrefix || typeof this._helpTextPrefix === 'string') ? this._helpTextPrefix : typeConvert.MarkdownString.from(this._helpTextPrefix),
					helpTextVariablesPrefix: (!this._helpTextVariablesPrefix || typeof this._helpTextVariablesPrefix === 'string') ? this._helpTextVariablesPrefix : typeConvert.MarkdownString.from(this._helpTextVariablesPrefix),
					helpTextPostfix: (!this._helpTextPostfix || typeof this._helpTextPostfix === 'string') ? this._helpTextPostfix : typeConvert.MarkdownString.from(this._helpTextPostfix),
					sampleRequest: this._sampleRequest,
					supportIssueReporting: this._supportIssueReporting,
					requester: this._requester
				});
				updateScheduled = false;
			});
		};

		const that = this;
		return {
			get id() {
				return that.id;
			},
			get fullName() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._fullName ?? that.extension.displayName ?? that.extension.name;
			},
			set fullName(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
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
			get requestHandler() {
				return that._requestHandler;
			},
			set requestHandler(v) {
				assertType(typeof v === 'function', 'Invalid request handler');
				that._requestHandler = v;
			},
			get followupProvider() {
				return that._followupProvider;
			},
			set followupProvider(v) {
				that._followupProvider = v;
				updateMetadataSoon();
			},
			get isDefault() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._isDefault;
			},
			set isDefault(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._isDefault = v;
				updateMetadataSoon();
			},
			get helpTextPrefix() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._helpTextPrefix;
			},
			set helpTextPrefix(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._helpTextPrefix = v;
				updateMetadataSoon();
			},
			get helpTextVariablesPrefix() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._helpTextVariablesPrefix;
			},
			set helpTextVariablesPrefix(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._helpTextVariablesPrefix = v;
				updateMetadataSoon();
			},
			get helpTextPostfix() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._helpTextPostfix;
			},
			set helpTextPostfix(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._helpTextPostfix = v;
				updateMetadataSoon();
			},
			get isSecondary() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._isSecondary;
			},
			set isSecondary(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
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
				checkProposedApiEnabled(that.extension, 'chatParticipantAdditions');
				return that._supportIssueReporting;
			},
			set supportIssueReporting(v) {
				checkProposedApiEnabled(that.extension, 'chatParticipantAdditions');
				that._supportIssueReporting = v;
				updateMetadataSoon();
			},
			get onDidReceiveFeedback() {
				return that._onDidReceiveFeedback.event;
			},
			set participantVariableProvider(v) {
				checkProposedApiEnabled(that.extension, 'chatParticipantAdditions');
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
			get participantVariableProvider() {
				checkProposedApiEnabled(that.extension, 'chatParticipantAdditions');
				return that._agentVariableProvider;
			},
			set welcomeMessageProvider(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._welcomeMessageProvider = v;
				updateMetadataSoon();
			},
			get welcomeMessageProvider() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._welcomeMessageProvider;
			},
			onDidPerformAction: !isProposedApiEnabled(this.extension, 'chatParticipantAdditions')
				? undefined!
				: this._onDidPerformAction.event
			,
			set requester(v) {
				that._requester = v;
				updateMetadataSoon();
			},
			get requester() {
				return that._requester;
			},
			dispose() {
				disposed = true;
				that._followupProvider = undefined;
				that._onDidReceiveFeedback.dispose();
				that._proxy.$unregisterAgent(that._handle);
			},
		} satisfies vscode.ChatParticipant;
	}

	invoke(request: vscode.ChatRequest, context: vscode.ChatContext, response: vscode.ChatExtendedResponseStream, token: CancellationToken): vscode.ProviderResult<vscode.ChatResult | void> {
		return this._requestHandler(request, context, response, token);
	}
}
