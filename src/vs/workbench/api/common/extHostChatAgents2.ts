/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { coalesce } from '../../../base/common/arrays.js';
import { timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { assertType } from '../../../base/common/types.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { Location } from '../../../editor/common/languages.js';
import { ExtensionIdentifier, IExtensionDescription, IRelaxedExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { isChatViewTitleActionContext } from '../../contrib/chat/common/actions/chatActions.js';
import { IChatAgentRequest, IChatAgentResult, IChatAgentResultTimings, UserSelectedTools } from '../../contrib/chat/common/participants/chatAgents.js';
import { IChatRelatedFile, IChatRequestDraft } from '../../contrib/chat/common/editing/chatEditingService.js';
import { ChatAgentVoteDirection, IChatContentReference, IChatFollowup, IChatResponseErrorDetails, IChatUserActionEvent, IChatVoteAction } from '../../contrib/chat/common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../contrib/chat/common/model/chatUri.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostChatAgentsShape2, IChatAgentCompletionItem, IChatAgentHistoryEntryDto, IChatAgentProgressShape, IChatProgressDto, IChatSessionContextDto, IExtensionChatAgentMetadata, IMainContext, MainContext, MainThreadChatAgentsShape2 } from './extHost.protocol.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { ExtHostDiagnostics } from './extHostDiagnostics.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { ExtHostLanguageModels } from './extHostLanguageModels.js';
import { ExtHostLanguageModelTools } from './extHostLanguageModelTools.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { ICustomAgentQueryOptions, IExternalCustomAgent } from '../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';

export class ChatAgentResponseStream {

	private _stopWatch = StopWatch.create(false);
	private _isClosed: boolean = false;
	private _firstProgress: number | undefined;
	private _apiObject: vscode.ChatResponseStream | undefined;

	constructor(
		private readonly _extension: IExtensionDescription,
		private readonly _request: IChatAgentRequest,
		private readonly _proxy: IChatAgentProgressShape,
		private readonly _commandsConverter: CommandsConverter,
		private readonly _sessionDisposables: DisposableStore
	) { }

	close() {
		this._isClosed = true;
	}

	get timings(): IChatAgentResultTimings {
		return {
			firstProgress: this._firstProgress,
			totalElapsed: this._stopWatch.elapsed()
		};
	}

	get apiObject() {

		if (!this._apiObject) {

			const that = this;
			this._stopWatch.reset();


			let taskHandlePool = 0;


			function throwIfDone(source: Function | undefined) {
				if (that._isClosed) {
					const err = new Error('Response stream has been closed');
					Error.captureStackTrace(err, source);
					throw err;
				}
			}


			const sendQueue: (IChatProgressDto | [IChatProgressDto, number])[] = [];
			let notify: Function[] = [];

			function send(chunk: IChatProgressDto): void;
			function send(chunk: IChatProgressDto, handle: number): Promise<void>;
			function send(chunk: IChatProgressDto, handle?: number) {
				// push data into send queue. the first entry schedules the micro task which
				// does the actual send to the main thread
				const newLen = sendQueue.push(handle !== undefined ? [chunk, handle] : chunk);
				if (newLen === 1) {
					queueMicrotask(() => {
						const toNotify = notify;
						notify = [];
						that._proxy.$handleProgressChunk(that._request.requestId, sendQueue).finally(() => {
							toNotify.forEach(f => f());
						});
						sendQueue.length = 0;
					});
				}
				if (handle !== undefined) {
					return new Promise<void>(resolve => { notify.push(resolve); });
				}
				return;
			}

			const _report = (progress: IChatProgressDto, task?: (progress: vscode.Progress<vscode.ChatResponseWarningPart | vscode.ChatResponseReferencePart>) => Thenable<string | void>) => {
				// Measure the time to the first progress update with real markdown content
				if (typeof this._firstProgress === 'undefined' && (progress.kind === 'markdownContent' || progress.kind === 'markdownVuln' || progress.kind === 'prepareToolInvocation')) {
					this._firstProgress = this._stopWatch.elapsed();
				}

				if (task) {
					const myHandle = taskHandlePool++;
					const progressReporterPromise = send(progress, myHandle);
					const progressReporter = {
						report: (p: vscode.ChatResponseWarningPart | vscode.ChatResponseReferencePart) => {
							progressReporterPromise.then(() => {
								if (extHostTypes.MarkdownString.isMarkdownString(p.value)) {
									send(typeConvert.ChatResponseWarningPart.from(<vscode.ChatResponseWarningPart>p), myHandle);
								} else {
									send(typeConvert.ChatResponseReferencePart.from(<vscode.ChatResponseReferencePart>p), myHandle);
								}
							});
						}
					};

					Promise.all([progressReporterPromise, task(progressReporter)]).then(([_void, res]) => {
						send(typeConvert.ChatTaskResult.from(res), myHandle);
					});
				} else {
					send(progress);
				}
			};

			this._apiObject = Object.freeze<vscode.ChatResponseStream>({
				clearToPreviousToolInvocation(reason) {
					throwIfDone(this.markdown);
					send({ kind: 'clearToPreviousToolInvocation', reason: reason });
					return this;
				},
				markdown(value) {
					throwIfDone(this.markdown);
					const part = new extHostTypes.ChatResponseMarkdownPart(value);
					const dto = typeConvert.ChatResponseMarkdownPart.from(part);
					_report(dto);
					return this;
				},
				markdownWithVulnerabilities(value, vulnerabilities) {
					throwIfDone(this.markdown);
					if (vulnerabilities) {
						checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
					}

					const part = new extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart(value, vulnerabilities);
					const dto = typeConvert.ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
					_report(dto);
					return this;
				},
				codeblockUri(value, isEdit) {
					throwIfDone(this.codeblockUri);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
					const part = new extHostTypes.ChatResponseCodeblockUriPart(value, isEdit);
					const dto = typeConvert.ChatResponseCodeblockUriPart.from(part);
					_report(dto);
					return this;
				},
				filetree(value, baseUri) {
					throwIfDone(this.filetree);
					const part = new extHostTypes.ChatResponseFileTreePart(value, baseUri);
					const dto = typeConvert.ChatResponseFilesPart.from(part);
					_report(dto);
					return this;
				},
				anchor(value, title?: string) {
					const part = new extHostTypes.ChatResponseAnchorPart(value, title);
					return this.push(part);
				},
				button(value) {
					throwIfDone(this.anchor);
					const part = new extHostTypes.ChatResponseCommandButtonPart(value);
					const dto = typeConvert.ChatResponseCommandButtonPart.from(part, that._commandsConverter, that._sessionDisposables);
					_report(dto);
					return this;
				},
				progress(value, task?: ((progress: vscode.Progress<vscode.ChatResponseWarningPart>) => Thenable<string | void>)) {
					throwIfDone(this.progress);
					const part = new extHostTypes.ChatResponseProgressPart2(value, task);
					const dto = task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
					_report(dto, task);
					return this;
				},
				thinkingProgress(thinkingDelta: vscode.ThinkingDelta) {
					throwIfDone(this.thinkingProgress);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
					const part = new extHostTypes.ChatResponseThinkingProgressPart(thinkingDelta.text ?? '', thinkingDelta.id, thinkingDelta.metadata);
					const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
					_report(dto);
					return this;
				},
				warning(value) {
					throwIfDone(this.progress);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
					const part = new extHostTypes.ChatResponseWarningPart(value);
					const dto = typeConvert.ChatResponseWarningPart.from(part);
					_report(dto);
					return this;
				},
				reference(value, iconPath) {
					return this.reference2(value, iconPath);
				},
				reference2(value, iconPath, options) {
					throwIfDone(this.reference);

					if (typeof value === 'object' && 'variableName' in value) {
						checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
					}

					if (typeof value === 'object' && 'variableName' in value && !value.value) {
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
								const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
								const dto = typeConvert.ChatResponseReferencePart.from(part);
								references = [dto];
							}

							references.forEach(r => _report(r));
							return this;
						} else {
							// Something went wrong- that variable doesn't actually exist
						}
					} else {
						const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
						const dto = typeConvert.ChatResponseReferencePart.from(part);
						_report(dto);
					}

					return this;
				},
				codeCitation(value: vscode.Uri, license: string, snippet: string): void {
					throwIfDone(this.codeCitation);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');

					const part = new extHostTypes.ChatResponseCodeCitationPart(value, license, snippet);
					const dto = typeConvert.ChatResponseCodeCitationPart.from(part);
					_report(dto);
				},
				textEdit(target, edits) {
					throwIfDone(this.textEdit);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');

					const part = new extHostTypes.ChatResponseTextEditPart(target, edits);
					part.isDone = edits === true ? true : undefined;
					const dto = typeConvert.ChatResponseTextEditPart.from(part);
					_report(dto);
					return this;
				},
				notebookEdit(target, edits) {
					throwIfDone(this.notebookEdit);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');

					const part = new extHostTypes.ChatResponseNotebookEditPart(target, edits);
					const dto = typeConvert.ChatResponseNotebookEditPart.from(part);
					_report(dto);
					return this;
				},
				async externalEdit(target, callback) {
					throwIfDone(this.externalEdit);
					const resources = Array.isArray(target) ? target : [target];
					const operationId = taskHandlePool++;
					const undoStopId = generateUuid();
					await send({ kind: 'externalEdits', start: true, resources, undoStopId }, operationId);
					try {
						await callback();
						return undoStopId;
					} finally {
						await send({ kind: 'externalEdits', start: false, resources, undoStopId }, operationId);
					}
				},
				confirmation(title, message, data, buttons) {
					throwIfDone(this.confirmation);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');

					const part = new extHostTypes.ChatResponseConfirmationPart(title, message, data, buttons);
					const dto = typeConvert.ChatResponseConfirmationPart.from(part);
					_report(dto);
					return this;
				},
				prepareToolInvocation(toolName) {
					throwIfDone(this.prepareToolInvocation);
					checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');

					const part = new extHostTypes.ChatPrepareToolInvocationPart(toolName);
					const dto = typeConvert.ChatPrepareToolInvocationPart.from(part);
					_report(dto);
					return this;
				},
				push(part) {
					throwIfDone(this.push);

					if (
						part instanceof extHostTypes.ChatResponseTextEditPart ||
						part instanceof extHostTypes.ChatResponseNotebookEditPart ||
						part instanceof extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart ||
						part instanceof extHostTypes.ChatResponseWarningPart ||
						part instanceof extHostTypes.ChatResponseConfirmationPart ||
						part instanceof extHostTypes.ChatResponseCodeCitationPart ||
						part instanceof extHostTypes.ChatResponseMovePart ||
						part instanceof extHostTypes.ChatResponseExtensionsPart ||
						part instanceof extHostTypes.ChatResponseExternalEditPart ||
						part instanceof extHostTypes.ChatResponseThinkingProgressPart ||
						part instanceof extHostTypes.ChatResponsePullRequestPart ||
						part instanceof extHostTypes.ChatResponseProgressPart2
					) {
						checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
					}

					if (part instanceof extHostTypes.ChatResponseReferencePart) {
						// Ensure variable reference values get fixed up
						this.reference2(part.value, part.iconPath, part.options);
					} else if (part instanceof extHostTypes.ChatResponseProgressPart2) {
						const dto = part.task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
						_report(dto, part.task);
					} else if (part instanceof extHostTypes.ChatResponseThinkingProgressPart) {
						const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
						_report(dto);
					} else if (part instanceof extHostTypes.ChatResponseAnchorPart) {
						const dto = typeConvert.ChatResponseAnchorPart.from(part);

						if (part.resolve) {
							checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');

							dto.resolveId = generateUuid();

							const cts = new CancellationTokenSource();
							part.resolve(cts.token)
								.then(() => {
									const resolvedDto = typeConvert.ChatResponseAnchorPart.from(part);
									that._proxy.$handleAnchorResolve(that._request.requestId, dto.resolveId!, resolvedDto);
								})
								.then(() => cts.dispose(), () => cts.dispose());
							that._sessionDisposables.add(toDisposable(() => cts.dispose(true)));
						}
						_report(dto);
					} else if (part instanceof extHostTypes.ChatPrepareToolInvocationPart) {
						checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
						const dto = typeConvert.ChatPrepareToolInvocationPart.from(part);
						_report(dto);
						return this;
					} else if (part instanceof extHostTypes.ChatResponseExternalEditPart) {
						const p = this.externalEdit(part.uris, part.callback);
						p.then((value) => part.didGetApplied(value));
						return this;
					} else {
						const dto = typeConvert.ChatResponsePart.from(part, that._commandsConverter, that._sessionDisposables);
						_report(dto);
					}

					return this;
				},
			});
		}

		return this._apiObject;
	}
}

interface InFlightChatRequest {
	requestId: string;
	extRequest: vscode.ChatRequest;
	extension: IRelaxedExtensionDescription;
}

export class ExtHostChatAgents2 extends Disposable implements ExtHostChatAgentsShape2 {

	private static _idPool = 0;

	private readonly _agents = new Map<number, ExtHostChatAgent>();
	private readonly _proxy: MainThreadChatAgentsShape2;

	private static _participantDetectionProviderIdPool = 0;
	private readonly _participantDetectionProviders = new Map<number, ExtHostParticipantDetector>();

	private static _relatedFilesProviderIdPool = 0;
	private readonly _relatedFilesProviders = new Map<number, ExtHostRelatedFilesProvider>();

	private static _customAgentsProviderIdPool = 0;
	private readonly _customAgentsProviders = new Map<number, { extension: IExtensionDescription; provider: vscode.CustomAgentsProvider }>();

	private readonly _sessionDisposables: DisposableResourceMap<DisposableStore> = this._register(new DisposableResourceMap());
	private readonly _completionDisposables: DisposableMap<number, DisposableStore> = this._register(new DisposableMap());

	private readonly _inFlightRequests = new Set<InFlightChatRequest>();

	private readonly _onDidChangeChatRequestTools = this._register(new Emitter<vscode.ChatRequest>());
	readonly onDidChangeChatRequestTools = this._onDidChangeChatRequestTools.event;

	private readonly _onDidDisposeChatSession = this._register(new Emitter<string>());
	readonly onDidDisposeChatSession = this._onDidDisposeChatSession.event;

	constructor(
		mainContext: IMainContext,
		private readonly _logService: ILogService,
		private readonly _commands: ExtHostCommands,
		private readonly _documents: ExtHostDocuments,
		private readonly _editorsAndDocuments: ExtHostDocumentsAndEditors,
		private readonly _languageModels: ExtHostLanguageModels,
		private readonly _diagnostics: ExtHostDiagnostics,
		private readonly _tools: ExtHostLanguageModelTools
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);

		_commands.registerArgumentProcessor({
			processArgument: (arg) => {
				// Don't send this argument to extension commands
				if (isChatViewTitleActionContext(arg)) {
					return null;
				}

				return arg;
			}
		});
	}

	async transferActiveChat(newWorkspace: vscode.Uri): Promise<void> {
		await this._proxy.$transferActiveChatSession(newWorkspace);
	}

	createChatAgent(extension: IExtensionDescription, id: string, handler: vscode.ChatExtendedRequestHandler): vscode.ChatParticipant {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, extension.identifier, id, {}, undefined);
		return agent.apiAgent;
	}

	createDynamicChatAgent(extension: IExtensionDescription, id: string, dynamicProps: vscode.DynamicChatParticipantProps, handler: vscode.ChatExtendedRequestHandler): vscode.ChatParticipant {
		const handle = ExtHostChatAgents2._idPool++;
		const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
		this._agents.set(handle, agent);

		this._proxy.$registerAgent(handle, extension.identifier, id, { isSticky: true } satisfies IExtensionChatAgentMetadata, dynamicProps);
		return agent.apiAgent;
	}

	registerChatParticipantDetectionProvider(extension: IExtensionDescription, provider: vscode.ChatParticipantDetectionProvider): vscode.Disposable {
		const handle = ExtHostChatAgents2._participantDetectionProviderIdPool++;
		this._participantDetectionProviders.set(handle, new ExtHostParticipantDetector(extension, provider));
		this._proxy.$registerChatParticipantDetectionProvider(handle);
		return toDisposable(() => {
			this._participantDetectionProviders.delete(handle);
			this._proxy.$unregisterChatParticipantDetectionProvider(handle);
		});
	}

	registerRelatedFilesProvider(extension: IExtensionDescription, provider: vscode.ChatRelatedFilesProvider, metadata: vscode.ChatRelatedFilesProviderMetadata): vscode.Disposable {
		const handle = ExtHostChatAgents2._relatedFilesProviderIdPool++;
		this._relatedFilesProviders.set(handle, new ExtHostRelatedFilesProvider(extension, provider));
		this._proxy.$registerRelatedFilesProvider(handle, metadata);
		return toDisposable(() => {
			this._relatedFilesProviders.delete(handle);
			this._proxy.$unregisterRelatedFilesProvider(handle);
		});
	}

	registerCustomAgentsProvider(extension: IExtensionDescription, provider: vscode.CustomAgentsProvider): vscode.Disposable {
		const handle = ExtHostChatAgents2._customAgentsProviderIdPool++;
		this._customAgentsProviders.set(handle, { extension, provider });
		this._proxy.$registerCustomAgentsProvider(handle, extension.identifier);

		const disposables = new DisposableStore();

		// Listen to provider change events and notify main thread
		if (provider.onDidChangeCustomAgents) {
			disposables.add(provider.onDidChangeCustomAgents(() => {
				this._proxy.$onDidChangeCustomAgents(handle);
			}));
		}

		disposables.add(toDisposable(() => {
			this._customAgentsProviders.delete(handle);
			this._proxy.$unregisterCustomAgentsProvider(handle);
		}));

		return disposables;
	}

	async $provideRelatedFiles(handle: number, request: IChatRequestDraft, token: CancellationToken): Promise<Dto<IChatRelatedFile>[] | undefined> {
		const provider = this._relatedFilesProviders.get(handle);
		if (!provider) {
			return Promise.resolve([]);
		}

		const extRequestDraft = typeConvert.ChatRequestDraft.to(request);
		return await provider.provider.provideRelatedFiles(extRequestDraft, token) ?? undefined;
	}

	async $provideCustomAgents(handle: number, options: ICustomAgentQueryOptions, token: CancellationToken): Promise<IExternalCustomAgent[] | undefined> {
		const providerData = this._customAgentsProviders.get(handle);
		if (!providerData) {
			return Promise.resolve(undefined);
		}

		return await providerData.provider.provideCustomAgents(options, token) ?? undefined;
	}

	async $detectChatParticipant(handle: number, requestDto: Dto<IChatAgentRequest>, context: { history: IChatAgentHistoryEntryDto[] }, options: { location: ChatAgentLocation; participants?: vscode.ChatParticipantMetadata[] }, token: CancellationToken): Promise<vscode.ChatParticipantDetectionResult | null | undefined> {
		const detector = this._participantDetectionProviders.get(handle);
		if (!detector) {
			return undefined;
		}

		const { request, location, history } = await this._createRequest(requestDto, context, detector.extension);

		const model = await this.getModelForRequest(request, detector.extension);
		const extRequest = typeConvert.ChatAgentRequest.to(
			request,
			location,
			model,
			this.getDiagnosticsWhenEnabled(detector.extension),
			this.getToolsForRequest(detector.extension, request.userSelectedTools),
			detector.extension,
			this._logService);

		return detector.provider.provideParticipantDetection(
			extRequest,
			{ history },
			{ participants: options.participants, location: typeConvert.ChatLocation.to(options.location) },
			token
		);
	}

	private async _createRequest(requestDto: Dto<IChatAgentRequest>, context: { history: IChatAgentHistoryEntryDto[] }, extension: IExtensionDescription) {
		const request = revive<IChatAgentRequest>(requestDto);
		const convertedHistory = await this.prepareHistoryTurns(extension, request.agentId, context);

		// in-place converting for location-data
		let location: vscode.ChatRequestEditorData | vscode.ChatRequestNotebookData | undefined;
		if (request.locationData?.type === ChatAgentLocation.EditorInline) {
			// editor data
			const document = this._documents.getDocument(request.locationData.document);
			const editor = this._editorsAndDocuments.getEditor(request.locationData.id)!;
			location = new extHostTypes.ChatRequestEditorData(editor.value, document, typeConvert.Selection.to(request.locationData.selection), typeConvert.Range.to(request.locationData.wholeRange));

		} else if (request.locationData?.type === ChatAgentLocation.Notebook) {
			// notebook data
			const cell = this._documents.getDocument(request.locationData.sessionInputUri);
			location = new extHostTypes.ChatRequestNotebookData(cell);

		} else if (request.locationData?.type === ChatAgentLocation.Terminal) {
			// TBD
		}

		return { request, location, history: convertedHistory };
	}

	private async getModelForRequest(request: IChatAgentRequest, extension: IExtensionDescription): Promise<vscode.LanguageModelChat> {
		let model: vscode.LanguageModelChat | undefined;
		if (request.userSelectedModelId) {
			model = await this._languageModels.getLanguageModelByIdentifier(extension, request.userSelectedModelId);
		}
		if (!model) {
			model = await this._languageModels.getDefaultLanguageModel(extension);
			if (!model) {
				throw new Error('Language model unavailable');
			}
		}

		return model;
	}


	async $setRequestTools(requestId: string, tools: UserSelectedTools) {
		const request = [...this._inFlightRequests].find(r => r.requestId === requestId);
		if (!request) {
			return;
		}

		request.extRequest.tools.clear();
		for (const [k, v] of this.getToolsForRequest(request.extension, tools)) {
			request.extRequest.tools.set(k, v);
		}
		this._onDidChangeChatRequestTools.fire(request.extRequest);
	}

	async $invokeAgent(handle: number, requestDto: Dto<IChatAgentRequest>, context: { history: IChatAgentHistoryEntryDto[]; chatSessionContext?: IChatSessionContextDto }, token: CancellationToken): Promise<IChatAgentResult | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
		}

		let stream: ChatAgentResponseStream | undefined;
		let inFlightRequest: InFlightChatRequest | undefined;

		try {
			const { request, location, history } = await this._createRequest(requestDto, context, agent.extension);

			// Init session disposables
			let sessionDisposables = this._sessionDisposables.get(request.sessionResource);
			if (!sessionDisposables) {
				sessionDisposables = new DisposableStore();
				this._sessionDisposables.set(request.sessionResource, sessionDisposables);
			}

			stream = new ChatAgentResponseStream(agent.extension, request, this._proxy, this._commands.converter, sessionDisposables);

			const model = await this.getModelForRequest(request, agent.extension);
			const extRequest = typeConvert.ChatAgentRequest.to(
				request,
				location,
				model,
				this.getDiagnosticsWhenEnabled(agent.extension),
				this.getToolsForRequest(agent.extension, request.userSelectedTools),
				agent.extension,
				this._logService
			);
			inFlightRequest = { requestId: requestDto.requestId, extRequest, extension: agent.extension };
			this._inFlightRequests.add(inFlightRequest);


			// If this request originates from a contributed chat session editor, attempt to resolve the ChatSession API object
			let chatSessionContext: vscode.ChatSessionContext | undefined;
			if (context.chatSessionContext) {
				chatSessionContext = {
					chatSessionItem: {
						resource: URI.revive(context.chatSessionContext.chatSessionResource),
						label: context.chatSessionContext.isUntitled ? 'Untitled Session' : 'Session',
					},
					isUntitled: context.chatSessionContext.isUntitled,
				};
			}

			const chatContext: vscode.ChatContext = { history, chatSessionContext };
			const task = agent.invoke(
				extRequest,
				chatContext,
				stream.apiObject,
				token
			);

			return await raceCancellationWithTimeout(1000, Promise.resolve(task).then((result) => {
				if (result?.metadata) {
					try {
						JSON.stringify(result.metadata);
					} catch (err) {
						const msg = `result.metadata MUST be JSON.stringify-able. Got error: ${err.message}`;
						this._logService.error(`[${agent.extension.identifier.value}] [@${agent.id}] ${msg}`, agent.extension);
						return { errorDetails: { message: msg }, timings: stream?.timings, nextQuestion: result.nextQuestion, };
					}
				}
				let errorDetails: IChatResponseErrorDetails | undefined;
				if (result?.errorDetails) {
					errorDetails = {
						...result.errorDetails,
						responseIsIncomplete: true
					};
				}
				if (errorDetails?.responseIsRedacted || errorDetails?.isQuotaExceeded || errorDetails?.isRateLimited || errorDetails?.confirmationButtons || errorDetails?.code) {
					checkProposedApiEnabled(agent.extension, 'chatParticipantPrivate');
				}

				return { errorDetails, timings: stream?.timings, metadata: result?.metadata, nextQuestion: result?.nextQuestion, details: result?.details } satisfies IChatAgentResult;
			}), token);
		} catch (e) {
			this._logService.error(e, agent.extension);

			if (e instanceof extHostTypes.LanguageModelError && e.cause) {
				e = e.cause;
			}

			const isQuotaExceeded = e instanceof Error && e.name === 'ChatQuotaExceeded';
			const isRateLimited = e instanceof Error && e.name === 'ChatRateLimited';
			return { errorDetails: { message: toErrorMessage(e), responseIsIncomplete: true, isQuotaExceeded, isRateLimited } };

		} finally {
			if (inFlightRequest) {
				this._inFlightRequests.delete(inFlightRequest);
			}
			stream?.close();
		}
	}

	private getDiagnosticsWhenEnabled(extension: Readonly<IRelaxedExtensionDescription>) {
		if (!isProposedApiEnabled(extension, 'chatReferenceDiagnostic')) {
			return [];
		}
		return this._diagnostics.getDiagnostics();
	}

	private getToolsForRequest(extension: IExtensionDescription, tools: UserSelectedTools | undefined): Map<string, boolean> {
		if (!tools) {
			return new Map();
		}
		const result = new Map<string, boolean>();
		for (const tool of this._tools.getTools(extension)) {
			if (typeof tools[tool.name] === 'boolean') {
				result.set(tool.name, tools[tool.name]);
			}
		}
		return result;
	}

	private async prepareHistoryTurns(extension: Readonly<IRelaxedExtensionDescription>, agentId: string, context: { history: IChatAgentHistoryEntryDto[] }): Promise<(vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]> {
		const res: (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[] = [];

		for (const h of context.history) {
			const ehResult = typeConvert.ChatAgentResult.to(h.result);
			const result: vscode.ChatResult = agentId === h.request.agentId || (isBuiltinParticipant(h.request.agentId) && isBuiltinParticipant(agentId)) ?
				ehResult :
				{ ...ehResult, metadata: undefined };

			// REQUEST turn
			const varsWithoutTools: vscode.ChatPromptReference[] = [];
			const toolReferences: vscode.ChatLanguageModelToolReference[] = [];
			for (const v of h.request.variables.variables) {
				if (v.kind === 'tool') {
					toolReferences.push(typeConvert.ChatLanguageModelToolReference.to(v));
				} else if (v.kind === 'toolset') {
					toolReferences.push(...v.value.map(typeConvert.ChatLanguageModelToolReference.to));
				} else {
					const ref = typeConvert.ChatPromptReference.to(v, this.getDiagnosticsWhenEnabled(extension), this._logService);
					if (ref) {
						varsWithoutTools.push(ref);
					}
				}
			}

			const editedFileEvents = isProposedApiEnabled(extension, 'chatParticipantPrivate') ? h.request.editedFileEvents : undefined;
			const turn = new extHostTypes.ChatRequestTurn(h.request.message, h.request.command, varsWithoutTools, h.request.agentId, toolReferences, editedFileEvents, h.request.requestId);
			res.push(turn);

			// RESPONSE turn
			const parts = coalesce(h.response.map(r => typeConvert.ChatResponsePart.toContent(r, this._commands.converter)));
			res.push(new extHostTypes.ChatResponseTurn(parts, result, h.request.agentId, h.request.command));
		}

		return res;
	}

	$releaseSession(sessionResourceDto: UriComponents): void {
		const sessionResource = URI.revive(sessionResourceDto);
		this._sessionDisposables.deleteAndDispose(sessionResource);
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (sessionId) {
			this._onDidDisposeChatSession.fire(sessionId);
		}
	}

	async $provideFollowups(requestDto: Dto<IChatAgentRequest>, handle: number, result: IChatAgentResult, context: { history: IChatAgentHistoryEntryDto[] }, token: CancellationToken): Promise<IChatFollowup[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return Promise.resolve([]);
		}

		const request = revive<IChatAgentRequest>(requestDto);
		const convertedHistory = await this.prepareHistoryTurns(agent.extension, agent.id, context);

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

	$acceptFeedback(handle: number, result: IChatAgentResult, voteAction: IChatVoteAction): void {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		const ehResult = typeConvert.ChatAgentResult.to(result);
		let kind: extHostTypes.ChatResultFeedbackKind;
		switch (voteAction.direction) {
			case ChatAgentVoteDirection.Down:
				kind = extHostTypes.ChatResultFeedbackKind.Unhelpful;
				break;
			case ChatAgentVoteDirection.Up:
				kind = extHostTypes.ChatResultFeedbackKind.Helpful;
				break;
		}

		const feedback: vscode.ChatResultFeedback = {
			result: ehResult,
			kind,
			unhelpfulReason: isProposedApiEnabled(agent.extension, 'chatParticipantAdditions') ? voteAction.reason : undefined,
		};
		agent.acceptFeedback(Object.freeze(feedback));
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

		const ehAction = typeConvert.ChatAgentUserActionEvent.to(result, event, this._commands.converter);
		if (ehAction) {
			agent.acceptAction(Object.freeze(ehAction));
		}
	}

	async $invokeCompletionProvider(handle: number, query: string, token: CancellationToken): Promise<IChatAgentCompletionItem[]> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return [];
		}

		let disposables = this._completionDisposables.get(handle);
		if (disposables) {
			// Clear any disposables from the last invocation of this completion provider
			disposables.clear();
		} else {
			disposables = new DisposableStore();
			this._completionDisposables.set(handle, disposables);
		}

		const items = await agent.invokeCompletionProvider(query, token);

		return items.map((i) => typeConvert.ChatAgentCompletionItem.from(i, this._commands.converter, disposables));
	}

	async $provideChatTitle(handle: number, context: IChatAgentHistoryEntryDto[], token: CancellationToken): Promise<string | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
		return await agent.provideTitle({ history }, token);
	}

	async $provideChatSummary(handle: number, context: IChatAgentHistoryEntryDto[], token: CancellationToken): Promise<string | undefined> {
		const agent = this._agents.get(handle);
		if (!agent) {
			return;
		}

		const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
		return await agent.provideSummary({ history }, token);
	}
}

class ExtHostParticipantDetector {
	constructor(
		public readonly extension: IExtensionDescription,
		public readonly provider: vscode.ChatParticipantDetectionProvider,
	) { }
}

class ExtHostRelatedFilesProvider {
	constructor(
		public readonly extension: IExtensionDescription,
		public readonly provider: vscode.ChatRelatedFilesProvider,
	) { }
}

class ExtHostChatAgent {

	private _followupProvider: vscode.ChatFollowupProvider | undefined;
	private _iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon | undefined;
	private _helpTextPrefix: string | vscode.MarkdownString | undefined;
	private _helpTextPostfix: string | vscode.MarkdownString | undefined;
	private _onDidReceiveFeedback = new Emitter<vscode.ChatResultFeedback>();
	private _onDidPerformAction = new Emitter<vscode.ChatUserActionEvent>();
	private _supportIssueReporting: boolean | undefined;
	private _agentVariableProvider?: { provider: vscode.ChatParticipantCompletionItemProvider; triggerCharacters: string[] };
	private _additionalWelcomeMessage?: string | vscode.MarkdownString | undefined;
	private _titleProvider?: vscode.ChatTitleProvider | undefined;
	private _summarizer?: vscode.ChatSummarizer | undefined;
	private _pauseStateEmitter = new Emitter<vscode.ChatParticipantPauseStateEvent>();

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

	setChatRequestPauseState(pauseState: vscode.ChatParticipantPauseStateEvent) {
		this._pauseStateEmitter.fire(pauseState);
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

	async provideTitle(context: vscode.ChatContext, token: CancellationToken): Promise<string | undefined> {
		if (!this._titleProvider) {
			return;
		}

		return await this._titleProvider.provideChatTitle(context, token) ?? undefined;
	}

	async provideSummary(context: vscode.ChatContext, token: CancellationToken): Promise<string | undefined> {
		if (!this._summarizer) {
			return;
		}

		return await this._summarizer.provideChatSummary(context, token) ?? undefined;
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
					icon: !this._iconPath ? undefined :
						this._iconPath instanceof URI ? this._iconPath :
							'light' in this._iconPath ? this._iconPath.light :
								undefined,
					iconDark: !this._iconPath ? undefined :
						'dark' in this._iconPath ? this._iconPath.dark :
							undefined,
					themeIcon: this._iconPath instanceof extHostTypes.ThemeIcon ? this._iconPath : undefined,
					hasFollowups: this._followupProvider !== undefined,
					helpTextPrefix: (!this._helpTextPrefix || typeof this._helpTextPrefix === 'string') ? this._helpTextPrefix : typeConvert.MarkdownString.from(this._helpTextPrefix),
					helpTextPostfix: (!this._helpTextPostfix || typeof this._helpTextPostfix === 'string') ? this._helpTextPostfix : typeConvert.MarkdownString.from(this._helpTextPostfix),
					supportIssueReporting: this._supportIssueReporting,
					additionalWelcomeMessage: (!this._additionalWelcomeMessage || typeof this._additionalWelcomeMessage === 'string') ? this._additionalWelcomeMessage : typeConvert.MarkdownString.from(this._additionalWelcomeMessage),
				});
				updateScheduled = false;
			});
		};

		const that = this;
		return {
			get id() {
				return that.id;
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
			get helpTextPrefix() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._helpTextPrefix;
			},
			set helpTextPrefix(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._helpTextPrefix = v;
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
			get supportIssueReporting() {
				checkProposedApiEnabled(that.extension, 'chatParticipantPrivate');
				return that._supportIssueReporting;
			},
			set supportIssueReporting(v) {
				checkProposedApiEnabled(that.extension, 'chatParticipantPrivate');
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

					that._proxy.$registerAgentCompletionsProvider(that._handle, that.id, v.triggerCharacters);
				} else {
					that._proxy.$unregisterAgentCompletionsProvider(that._handle, that.id);
				}
			},
			get participantVariableProvider() {
				checkProposedApiEnabled(that.extension, 'chatParticipantAdditions');
				return that._agentVariableProvider;
			},
			set additionalWelcomeMessage(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._additionalWelcomeMessage = v;
				updateMetadataSoon();
			},
			get additionalWelcomeMessage() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._additionalWelcomeMessage;
			},
			set titleProvider(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._titleProvider = v;
				updateMetadataSoon();
			},
			get titleProvider() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._titleProvider;
			},
			set summarizer(v) {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				that._summarizer = v;
			},
			get summarizer() {
				checkProposedApiEnabled(that.extension, 'defaultChatParticipant');
				return that._summarizer;
			},
			get onDidChangePauseState() {
				checkProposedApiEnabled(that.extension, 'chatParticipantAdditions');
				return that._pauseStateEmitter.event;
			},
			onDidPerformAction: !isProposedApiEnabled(this.extension, 'chatParticipantAdditions')
				? undefined!
				: this._onDidPerformAction.event
			,
			dispose() {
				disposed = true;
				that._followupProvider = undefined;
				that._onDidReceiveFeedback.dispose();
				that._proxy.$unregisterAgent(that._handle);
			},
		} satisfies vscode.ChatParticipant;
	}

	invoke(request: vscode.ChatRequest, context: vscode.ChatContext, response: vscode.ChatResponseStream, token: CancellationToken): vscode.ProviderResult<vscode.ChatResult | void> {
		return this._requestHandler(request, context, response, token);
	}
}

/**
 * raceCancellation, but give the promise a little time to complete to see if we can get a real result quickly.
 */
function raceCancellationWithTimeout<T>(cancelWait: number, promise: Promise<T>, token: CancellationToken): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const ref = token.onCancellationRequested(async () => {
			ref.dispose();
			await timeout(cancelWait);
			resolve(undefined);
		});
		promise.then(resolve, reject).finally(() => ref.dispose());
	});
}

function isBuiltinParticipant(agentId: string): boolean {
	return agentId.startsWith('github.copilot');
}
