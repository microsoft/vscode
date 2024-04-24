/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { coalesceInPlace, isNonEmptyArray } from 'vs/base/common/arrays';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IRange, Range } from 'vs/editor/common/core/range';
import { TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
import { ChatAgentLocation, IChatAgent, IChatAgentCommand, IChatAgentData, IChatAgentHistoryEntry, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatFollowup, IChatProgress, IChatService, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { EditMode, IInlineChatBulkEditResponse, IInlineChatProgressItem, IInlineChatRequest, IInlineChatResponse, IInlineChatService, IInlineChatSession, IInlineChatSessionProvider, IInlineChatSlashCommand, InlineChatResponseFeedbackKind, InlineChatResponseType } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { EmptyResponse, ErrorResponse, HunkData, ReplyResponse, Session, SessionExchange, SessionWholeRange, StashedSession, TelemetryData, TelemetryDataClassification } from './inlineChatSession';
import { IInlineChatSessionEndEvent, IInlineChatSessionEvent, IInlineChatSessionService, ISessionKeyComputer, Recording } from './inlineChatSessionService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { ISelection } from 'vs/editor/common/core/selection';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { Codicon } from 'vs/base/common/codicons';
import { isEqual } from 'vs/base/common/resources';

class BridgeAgent implements IChatAgentImplementation {

	constructor(
		private readonly _data: IChatAgentData,
		private readonly _sessions: ReadonlyMap<string, SessionData>,
		private readonly _postLastResponse: (data: { id: string; response: ReplyResponse | ErrorResponse | EmptyResponse }) => void,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }


	private _findSessionDataByRequest(request: IChatAgentRequest) {
		let data: SessionData | undefined;
		for (const candidate of this._sessions.values()) {
			if (candidate.session.chatModel.sessionId === request.sessionId) {
				data = candidate;
				break;
			}
		}
		return data;
	}

	async invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, _history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {

		if (token.isCancellationRequested) {
			return {};
		}

		const data = this._findSessionDataByRequest(request);

		if (!data) {
			throw new Error('FAILED to find session');
		}

		const { session } = data;

		if (!session.lastInput) {
			throw new Error('FAILED to find last input');
		}

		const inlineChatContextValue = request.variables.variables.find(candidate => candidate.name === _inlineChatContext)?.values[0];
		const inlineChatContext = typeof inlineChatContextValue?.value === 'string' && JSON.parse(inlineChatContextValue.value);

		const modelAltVersionIdNow = session.textModelN.getAlternativeVersionId();
		const progressEdits: TextEdit[][] = [];

		const inlineRequest: IInlineChatRequest = {
			requestId: request.requestId,
			prompt: request.message,
			attempt: request.attempt ?? 0,
			withIntentDetection: request.enableCommandDetection ?? true,
			live: session.editMode !== EditMode.Preview,
			previewDocument: session.textModelN.uri,
			selection: inlineChatContext.selection,
			wholeRange: inlineChatContext.wholeRange
		};

		const inlineProgress = new Progress<IInlineChatProgressItem>(data => {
			// TODO@jrieken
			// if (data.message) {
			// 	progress({ kind: 'progressMessage', content: new MarkdownString(data.message) });
			// }
			// TODO@ulugbekna,jrieken should we only send data.slashCommand when having detected one?
			if (data.slashCommand && !inlineRequest.prompt.startsWith('/')) {
				const command = this._data.slashCommands.find(c => c.name === data.slashCommand);
				progress({ kind: 'agentDetection', agentId: this._data.id, command });
			}
			if (data.markdownFragment) {
				progress({ kind: 'markdownContent', content: new MarkdownString(data.markdownFragment) });
			}
			if (isNonEmptyArray(data.edits)) {
				progressEdits.push(data.edits);
				progress({ kind: 'textEdit', uri: session.textModelN.uri, edits: data.edits });
			}
		});

		let result: IInlineChatResponse | undefined | null;
		let response: ReplyResponse | ErrorResponse | EmptyResponse;

		try {
			result = await data.session.provider.provideResponse(session.session, inlineRequest, inlineProgress, token);

			if (result) {
				if (result.message) {
					inlineProgress.report({ markdownFragment: result.message.value });
				}
				if (Array.isArray(result.edits)) {
					inlineProgress.report({ edits: result.edits });
				}

				const markdownContents = result.message ?? new MarkdownString('', { supportThemeIcons: true, supportHtml: true, isTrusted: false });

				const chatModelRequest = session.chatModel.getRequests().find(candidate => candidate.id === request.requestId);

				response = this._instaService.createInstance(ReplyResponse, result, markdownContents, session.textModelN.uri, modelAltVersionIdNow, progressEdits, request.requestId, chatModelRequest?.response);

			} else {
				response = new EmptyResponse();
			}

		} catch (e) {
			response = new ErrorResponse(e);
		}

		this._postLastResponse({ id: request.requestId, response });


		return {
			metadata: {
				inlineChatResponse: result
			}
		};
	}

	async provideFollowups(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {

		if (!result.metadata?.inlineChatResponse) {
			return [];
		}

		const data = this._findSessionDataByRequest(request);
		if (!data) {
			return [];
		}

		const inlineFollowups = await data.session.provider.provideFollowups?.(data.session.session, result.metadata?.inlineChatResponse, token);
		if (!inlineFollowups) {
			return [];
		}

		const chatFollowups = inlineFollowups.map(f => {
			if (f.kind === 'reply') {
				return {
					kind: 'reply',
					message: f.message,
					agentId: request.agentId,
					title: f.title,
					tooltip: f.tooltip,
				} satisfies IChatFollowup;
			} else {
				// TODO@jrieken update API
				return undefined;
			}
		});

		coalesceInPlace(chatFollowups);
		return chatFollowups;
	}

	provideWelcomeMessage(location: ChatAgentLocation, token: CancellationToken): string[] {
		// without this provideSampleQuestions is not called
		return [];
	}

	async provideSampleQuestions(location: ChatAgentLocation, token: CancellationToken): Promise<IChatFollowup[]> {
		// TODO@jrieken DEBT
		// (hack) this function is called while creating the session. We need the timeout to make sure this._sessions is populated.
		// (hack) we have no context/session id and therefore use the first session with an active editor
		await new Promise(resolve => setTimeout(resolve, 10));

		for (const [, data] of this._sessions) {
			if (data.session.session.input && data.editor.hasWidgetFocus()) {
				return [{
					kind: 'reply',
					agentId: _bridgeAgentId,
					message: data.session.session.input,
				}];
			}
		}
		return [];
	}
}

type SessionData = {
	editor: ICodeEditor;
	session: Session;
	store: IDisposable;
};

export class InlineChatError extends Error {
	static readonly code = 'InlineChatError';
	constructor(message: string) {
		super(message);
		this.name = InlineChatError.code;
	}
}

const _bridgeAgentId = 'brigde.editor';
const _inlineChatContext = '_inlineChatContext';

class InlineChatContext {

	static readonly variableName = '_inlineChatContext';

	constructor(
		readonly uri: URI,
		readonly selection: ISelection,
		readonly wholeRange: IRange,
	) { }
}

export class InlineChatSessionServiceImpl implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _onWillStartSession = this._store.add(new Emitter<IActiveCodeEditor>());
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _onDidMoveSession = this._store.add(new Emitter<IInlineChatSessionEvent>());
	readonly onDidMoveSession: Event<IInlineChatSessionEvent> = this._onDidMoveSession.event;

	private readonly _onDidEndSession = this._store.add(new Emitter<IInlineChatSessionEndEvent>());
	readonly onDidEndSession: Event<IInlineChatSessionEndEvent> = this._onDidEndSession.event;

	private readonly _onDidStashSession = this._store.add(new Emitter<IInlineChatSessionEvent>());
	readonly onDidStashSession: Event<IInlineChatSessionEvent> = this._onDidStashSession.event;

	private readonly _sessions = new Map<string, SessionData>();
	private readonly _keyComputers = new Map<string, ISessionKeyComputer>();
	private _recordings: Recording[] = [];

	private readonly _lastResponsesFromBridgeAgent = new LRUCache<string, ReplyResponse | EmptyResponse | ErrorResponse>(5);

	constructor(
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatService private readonly _chatService: IChatService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatVariablesService chatVariableService: IChatVariablesService,
	) {

		const fakeProviders = this._store.add(new DisposableMap<string, IDisposable>());

		this._store.add(this._chatAgentService.onDidChangeAgents(() => {

			const providersNow = new Set<string>();

			for (const agent of this._chatAgentService.getActivatedAgents()) {
				if (agent.id === _bridgeAgentId) {
					// not interesting
					continue;
				}
				if (!agent.locations.includes(ChatAgentLocation.Editor) || !agent.isDefault) {
					// not interesting
					continue;
				}
				providersNow.add(agent.id);

				if (!fakeProviders.has(agent.id)) {
					fakeProviders.set(agent.id, _inlineChatService.addProvider(_instaService.createInstance(AgentInlineChatProvider, agent)));
					this._logService.debug(`ADDED inline chat provider for agent ${agent.id}`);
				}
			}

			for (const [id] of fakeProviders) {
				if (!providersNow.has(id)) {
					fakeProviders.deleteAndDispose(id);
					this._logService.debug(`REMOVED inline chat provider for agent ${id}`);
				}
			}
		}));

		// MARK: register fake chat agent
		const addOrRemoveBridgeAgent = () => {
			const that = this;
			const agentData: IChatAgentData = {
				id: _bridgeAgentId,
				name: 'editor',
				extensionId: nullExtensionDescription.identifier,
				extensionPublisher: '',
				extensionDisplayName: '',
				isDefault: true,
				locations: [ChatAgentLocation.Editor],
				get slashCommands(): IChatAgentCommand[] {
					// HACK@jrieken
					// find the active session and return its slash commands
					let candidate: Session | undefined;
					for (const data of that._sessions.values()) {
						if (data.editor.hasWidgetFocus()) {
							candidate = data.session;
							break;
						}
					}
					if (!candidate || !candidate.session.slashCommands) {
						return [];
					}
					return candidate.session.slashCommands.map(c => {
						return {
							name: c.command,
							description: c.detail ?? '',
						} satisfies IChatAgentCommand;
					});
				},
				defaultImplicitVariables: [_inlineChatContext],
				metadata: {
					isSticky: false,
					themeIcon: Codicon.copilot,
				},
			};

			let otherEditorAgent: IChatAgentData | undefined;
			let myEditorAgent: IChatAgentData | undefined;

			for (const candidate of this._chatAgentService.getActivatedAgents()) {
				if (!myEditorAgent && candidate.id === agentData.id) {
					myEditorAgent = candidate;
				} else if (!otherEditorAgent && candidate.isDefault && candidate.locations.includes(ChatAgentLocation.Editor)) {
					otherEditorAgent = candidate;
				}
			}

			if (otherEditorAgent) {
				bridgeStore.clear();
				_logService.debug(`REMOVED bridge agent "${agentData.id}", found "${otherEditorAgent.id}"`);

			} else if (!myEditorAgent) {
				bridgeStore.value = this._chatAgentService.registerDynamicAgent(agentData, this._instaService.createInstance(BridgeAgent, agentData, this._sessions, data => {
					this._lastResponsesFromBridgeAgent.set(data.id, data.response);
				}));
				_logService.debug(`ADDED bridge agent "${agentData.id}"`);
			}
		};

		this._store.add(this._chatAgentService.onDidChangeAgents(() => addOrRemoveBridgeAgent()));
		const bridgeStore = this._store.add(new MutableDisposable());
		addOrRemoveBridgeAgent();


		// MARK: implicit variable for editor selection and (tracked) whole range

		this._store.add(chatVariableService.registerVariable(
			{ name: _inlineChatContext, description: '', hidden: true },
			async (_message, _arg, model) => {
				for (const [, data] of this._sessions) {
					if (data.session.chatModel === model) {
						return [{
							level: 'full',
							value: JSON.stringify(new InlineChatContext(data.session.textModelN.uri, data.editor.getSelection()!, data.session.wholeRange.trackedInitialRange))
						}];
					}
				}
				return undefined;
			}
		));

	}

	dispose() {
		this._store.dispose();
		this._sessions.forEach(x => x.store.dispose());
		this._sessions.clear();
	}

	async createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: Range }, token: CancellationToken): Promise<Session | undefined> {

		const agent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Editor);
		let provider: IInlineChatSessionProvider | undefined;
		if (agent) {
			for (const candidate of this._inlineChatService.getAllProvider()) {
				if (candidate instanceof AgentInlineChatProvider && candidate.agent === agent) {
					provider = candidate;
					break;
				}
			}
		}

		if (!provider) {
			provider = Iterable.first(this._inlineChatService.getAllProvider());
		}

		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return undefined;
		}

		this._onWillStartSession.fire(editor);

		const textModel = editor.getModel();
		const selection = editor.getSelection();
		let rawSession: IInlineChatSession | undefined | null;
		try {
			rawSession = await raceCancellation(
				Promise.resolve(provider.prepareInlineChatSession(textModel, selection, token)),
				token
			);
		} catch (error) {
			this._logService.error('[IE] FAILED to prepare session', provider.extensionId);
			this._logService.error(error);
			throw new InlineChatError((error as Error)?.message || 'Failed to prepare session');
		}
		if (!rawSession) {
			this._logService.trace('[IE] NO session', provider.extensionId);
			return undefined;
		}

		const store = new DisposableStore();
		this._logService.trace(`[IE] creating NEW session for ${editor.getId()}, ${provider.extensionId}`);

		const chatModel = this._chatService.startSession(ChatAgentLocation.Editor, token);
		if (!chatModel) {
			this._logService.trace('[IE] NO chatModel found');
			return undefined;
		}

		store.add(toDisposable(() => {
			this._chatService.clearSession(chatModel.sessionId);
			chatModel.dispose();
		}));

		const lastResponseListener = store.add(new MutableDisposable());
		store.add(chatModel.onDidChange(e => {
			if (e.kind !== 'addRequest' || !e.request.response) {
				return;
			}

			const modelAltVersionIdNow = textModel.getAlternativeVersionId();

			const { response } = e.request;

			lastResponseListener.value = response.onDidChange(() => {

				if (!response.isComplete) {
					return;
				}

				lastResponseListener.clear(); // ONCE

				let inlineResponse: ErrorResponse | EmptyResponse | ReplyResponse;
				if (response.agent?.id === _bridgeAgentId) {
					// use result that was provided by
					inlineResponse = this._lastResponsesFromBridgeAgent.get(response.requestId) ?? new ErrorResponse(new Error('Missing Response'));
					this._lastResponsesFromBridgeAgent.delete(response.requestId);

				} else {
					// make an artificial response from the ChatResponseModel
					if (response.isCanceled) {
						// error: cancelled
						inlineResponse = new ErrorResponse(new CancellationError());
					} else if (response.result?.errorDetails) {
						// error: "real" error
						inlineResponse = new ErrorResponse(new Error(response.result.errorDetails.message));
					} else if (response.response.value.length === 0) {
						// epmty response
						inlineResponse = new EmptyResponse();
					} else {
						// replay response
						const markdownContent = new MarkdownString();
						const raw: IInlineChatBulkEditResponse = {
							id: Math.random(),
							type: InlineChatResponseType.BulkEdit,
							message: markdownContent,
							edits: { edits: [] },
						};
						for (const item of response.response.value) {
							if (item.kind === 'markdownContent') {
								markdownContent.value += item.content.value;
							} else if (item.kind === 'textEditGroup') {
								for (const group of item.edits) {
									for (const edit of group) {
										raw.edits.edits.push({
											resource: item.uri,
											textEdit: edit,
											versionId: undefined
										});
									}
								}
							}
						}

						inlineResponse = this._instaService.createInstance(
							ReplyResponse,
							raw,
							markdownContent,
							session.textModelN.uri,
							modelAltVersionIdNow,
							[],
							e.request.id,
							e.request.response
						);

					}
				}

				session.addExchange(new SessionExchange(session.lastInput!, inlineResponse));

				if (inlineResponse instanceof ReplyResponse && inlineResponse.untitledTextModel) {
					this._textModelService.createModelReference(inlineResponse.untitledTextModel.resource).then(ref => {
						store.add(ref);
					});
				}
			});
		}));

		store.add(this._chatService.onDidPerformUserAction(e => {
			if (e.sessionId !== chatModel.sessionId) {
				return;
			}

			// TODO@jrieken VALIDATE candidate is proper, e.g check with `session.exchanges`
			const request = chatModel.getRequests().find(request => request.id === e.requestId);
			const candidate = request?.response?.result?.metadata?.inlineChatResponse;

			if (!candidate) {
				return;
			}

			let kind: InlineChatResponseFeedbackKind | undefined;
			if (e.action.kind === 'vote') {
				kind = e.action.direction === InteractiveSessionVoteDirection.Down ? InlineChatResponseFeedbackKind.Unhelpful : InlineChatResponseFeedbackKind.Helpful;
			} else if (e.action.kind === 'bug') {
				kind = InlineChatResponseFeedbackKind.Bug;
			} else if (e.action.kind === 'inlineChat') {
				kind = e.action.action === 'accepted' ? InlineChatResponseFeedbackKind.Accepted : InlineChatResponseFeedbackKind.Undone;
			}

			if (!kind) {
				return;
			}

			provider.handleInlineChatResponseFeedback?.(rawSession, candidate, kind);
		}));

		store.add(this._inlineChatService.onDidChangeProviders(e => {
			if (e.removed === provider) {
				this._logService.trace(`[IE] provider GONE for ${editor.getId()}, ${provider.extensionId}`);
				this._releaseSession(session, true);
			}
		}));

		const id = generateUuid();
		const targetUri = textModel.uri;

		// AI edits happen in the actual model, keep a reference but make no copy
		store.add((await this._textModelService.createModelReference(textModel.uri)));
		const textModelN = textModel;

		// create: keep a snapshot of the "actual" model
		const textModel0 = store.add(this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
			{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
			targetUri.with({ scheme: Schemas.vscode, authority: 'inline-chat', path: '', query: new URLSearchParams({ id, 'textModel0': '' }).toString() }), true
		));

		// untitled documents are special and we are releasing their session when their last editor closes
		if (targetUri.scheme === Schemas.untitled) {
			store.add(this._editorService.onDidCloseEditor(() => {
				if (!this._editorService.isOpened({ resource: targetUri, typeId: UntitledTextEditorInput.ID, editorId: DEFAULT_EDITOR_ASSOCIATION.id })) {
					this._releaseSession(session, true);
				}
			}));
		}

		let wholeRange = options.wholeRange;
		if (!wholeRange) {
			wholeRange = rawSession.wholeRange ? Range.lift(rawSession.wholeRange) : editor.getSelection();
		}

		if (token.isCancellationRequested) {
			store.dispose();
			return undefined;
		}

		const session = new Session(
			options.editMode,
			targetUri,
			textModel0,
			textModelN,
			provider, rawSession,
			store.add(new SessionWholeRange(textModelN, wholeRange)),
			store.add(new HunkData(this._editorWorkerService, textModel0, textModelN)),
			chatModel
		);

		// store: key -> session
		const key = this._key(editor, session.targetUri);
		if (this._sessions.has(key)) {
			store.dispose();
			throw new Error(`Session already stored for ${key}`);
		}
		this._sessions.set(key, { session, editor, store });
		return session;
	}

	moveSession(session: Session, target: ICodeEditor): void {
		const newKey = this._key(target, session.targetUri);
		const existing = this._sessions.get(newKey);
		if (existing) {
			if (existing.session !== session) {
				throw new Error(`Cannot move session because the target editor already/still has one`);
			} else {
				// noop
				return;
			}
		}

		let found = false;
		for (const [oldKey, data] of this._sessions) {
			if (data.session === session) {
				found = true;
				this._sessions.delete(oldKey);
				this._sessions.set(newKey, { ...data, editor: target });
				this._logService.trace(`[IE] did MOVE session for ${data.editor.getId()} to NEW EDITOR ${target.getId()}, ${session.provider.extensionId}`);
				this._onDidMoveSession.fire({ session, editor: target });
				break;
			}
		}
		if (!found) {
			throw new Error(`Cannot move session because it is not stored`);
		}
	}

	releaseSession(session: Session): void {
		this._releaseSession(session, false);
	}

	private _releaseSession(session: Session, byServer: boolean): void {

		let tuple: [string, SessionData] | undefined;

		// cleanup
		for (const candidate of this._sessions) {
			if (candidate[1].session === session) {
				// if (value.session === session) {
				tuple = candidate;
				break;
			}
		}

		if (!tuple) {
			// double remove
			return;
		}

		this._keepRecording(session);
		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', session.asTelemetryData());

		const [key, value] = tuple;
		this._sessions.delete(key);
		this._logService.trace(`[IE] did RELEASED session for ${value.editor.getId()}, ${session.provider.extensionId}`);

		this._onDidEndSession.fire({ editor: value.editor, session, endedByExternalCause: byServer });
		value.store.dispose();
	}

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession {
		this._keepRecording(session);
		const result = this._instaService.createInstance(StashedSession, editor, session, undoCancelEdits);
		this._onDidStashSession.fire({ editor, session });
		this._logService.trace(`[IE] did STASH session for ${editor.getId()}, ${session.provider.extensionId}`);
		return result;
	}

	getCodeEditor(session: Session): ICodeEditor {
		for (const [, data] of this._sessions) {
			if (data.session === session) {
				return data.editor;
			}
		}
		throw new Error('session not found');
	}

	getSession(editor: ICodeEditor, uri: URI): Session | undefined {
		const key = this._key(editor, uri);
		return this._sessions.get(key)?.session;
	}

	private _key(editor: ICodeEditor, uri: URI): string {
		const item = this._keyComputers.get(uri.scheme);
		return item
			? item.getComparisonKey(editor, uri)
			: `${editor.getId()}@${uri.toString()}`;

	}

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable {
		this._keyComputers.set(scheme, value);
		return toDisposable(() => this._keyComputers.delete(scheme));
	}

	// --- debug

	private _keepRecording(session: Session) {
		const newLen = this._recordings.unshift(session.asRecording());
		if (newLen > 5) {
			this._recordings.pop();
		}
	}

	recordings(): readonly Recording[] {
		return this._recordings;
	}
}

export class AgentInlineChatProvider implements IInlineChatSessionProvider {

	readonly extensionId: ExtensionIdentifier;
	readonly label: string;
	readonly supportIssueReporting?: boolean | undefined;

	constructor(
		readonly agent: IChatAgent,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {
		this.label = agent.name;
		this.extensionId = agent.extensionId;
		this.supportIssueReporting = agent.metadata.supportIssueReporting;
	}

	async prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): Promise<IInlineChatSession> {

		// TODO@jrieken have a good welcome message
		// const welcomeMessage = await this.agent.provideWelcomeMessage?.(ChatAgentLocation.Editor, token);
		// const message =  welcomeMessage?.filter(candidate => typeof candidate === 'string').join(''),

		return {
			id: Math.random(),
			wholeRange: new Range(range.selectionStartLineNumber, range.selectionStartColumn, range.positionLineNumber, range.positionColumn),
			placeholder: this.agent.description,
			slashCommands: this.agent.slashCommands.map(agentCommand => {
				return {
					command: agentCommand.name,
					detail: agentCommand.description,
					refer: agentCommand.name === 'explain' // TODO@jrieken @joyceerhl this should be cleaned up
				} satisfies IInlineChatSlashCommand;
			})
		};
	}

	async provideResponse(item: IInlineChatSession, request: IInlineChatRequest, progress: IProgress<IInlineChatProgressItem>, token: CancellationToken): Promise<IInlineChatResponse> {

		const workspaceEdit: WorkspaceEdit = { edits: [] };

		await this._chatAgentService.invokeAgent(this.agent.id, {
			sessionId: String(item.id),
			requestId: request.requestId,
			agentId: this.agent.id,
			message: request.prompt,
			location: ChatAgentLocation.Editor,
			variables: {
				variables: [{
					name: InlineChatContext.variableName,
					values: [{
						level: 'full',
						value: JSON.stringify(new InlineChatContext(request.previewDocument, request.selection, request.wholeRange))
					}]
				}]
			}
		}, part => {

			if (part.kind === 'markdownContent') {
				progress.report({ markdownFragment: part.content.value });
			} else if (part.kind === 'agentDetection') {
				progress.report({ slashCommand: part.command?.name });
			} else if (part.kind === 'textEdit') {

				if (isEqual(request.previewDocument, part.uri)) {
					progress.report({ edits: part.edits });
				} else {
					for (const textEdit of part.edits) {
						workspaceEdit.edits.push({ resource: part.uri, textEdit, versionId: undefined });
					}
				}
			}

		}, [], token);

		return {
			type: InlineChatResponseType.BulkEdit,
			id: Math.random(),
			edits: workspaceEdit
		};
	}

	// handleInlineChatResponseFeedback?(session: IInlineChatSession, response: IInlineChatResponse, kind: InlineChatResponseFeedbackKind): void {
	// 	throw new Error('Method not implemented.');
	// }

	// provideFollowups?(session: IInlineChatSession, response: IInlineChatResponse, token: CancellationToken): ProviderResult<IInlineChatFollowup[]> {
	// 	throw new Error('Method not implemented.');
	// }
}
