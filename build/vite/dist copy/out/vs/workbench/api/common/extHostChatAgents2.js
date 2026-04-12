/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { coalesce } from '../../../base/common/arrays.js';
import { DeferredPromise, raceCancellation, timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { assertType } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { packErrorForTelemetry } from '../../../platform/telemetry/common/errorTelemetry.js';
import { isChatViewTitleActionContext } from '../../contrib/chat/common/actions/chatActions.js';
import { ChatAgentVoteDirection } from '../../contrib/chat/common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../contrib/chat/common/model/chatUri.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { MainContext } from './extHost.protocol.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { PromptsType } from '../../contrib/chat/common/promptSyntax/promptTypes.js';
export class ChatAgentResponseStream {
    constructor(_extension, _request, _proxy, _commandsConverter, _sessionDisposables, _pendingCarouselResolvers, _token) {
        this._extension = _extension;
        this._request = _request;
        this._proxy = _proxy;
        this._commandsConverter = _commandsConverter;
        this._sessionDisposables = _sessionDisposables;
        this._pendingCarouselResolvers = _pendingCarouselResolvers;
        this._token = _token;
        this._stopWatch = StopWatch.create(false);
        this._isClosed = false;
    }
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
            let taskHandlePool = 0;
            function throwIfDone(source) {
                if (that._isClosed) {
                    const err = new Error('Response stream has been closed');
                    Error.captureStackTrace(err, source);
                    throw err;
                }
            }
            const sendQueue = [];
            let notify = [];
            function send(chunk, handle) {
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
                    return new Promise(resolve => { notify.push(resolve); });
                }
                return;
            }
            const _report = (progress, task) => {
                // Measure the time to the first progress update with real markdown content
                if (typeof this._firstProgress === 'undefined' && (progress.kind === 'markdownContent' || progress.kind === 'markdownVuln' || progress.kind === 'beginToolInvocation')) {
                    this._firstProgress = this._stopWatch.elapsed();
                }
                if (task) {
                    const myHandle = taskHandlePool++;
                    const progressReporterPromise = send(progress, myHandle);
                    const progressReporter = {
                        report: (p) => {
                            progressReporterPromise.then(() => {
                                if (extHostTypes.MarkdownString.isMarkdownString(p.value)) {
                                    send(typeConvert.ChatResponseWarningPart.from(p), myHandle);
                                }
                                else {
                                    send(typeConvert.ChatResponseReferencePart.from(p), myHandle);
                                }
                            });
                        }
                    };
                    Promise.all([progressReporterPromise, task(progressReporter)]).then(([_void, res]) => {
                        send(typeConvert.ChatTaskResult.from(res), myHandle);
                    });
                }
                else {
                    send(progress);
                }
            };
            this._apiObject = Object.freeze({
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
                anchor(value, title) {
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
                progress(value, task) {
                    throwIfDone(this.progress);
                    const part = new extHostTypes.ChatResponseProgressPart2(value, task);
                    const dto = task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
                    _report(dto, task);
                    return this;
                },
                thinkingProgress(thinkingDelta) {
                    throwIfDone(this.thinkingProgress);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const part = new extHostTypes.ChatResponseThinkingProgressPart(thinkingDelta.text ?? '', thinkingDelta.id, thinkingDelta.metadata);
                    const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
                    _report(dto);
                    return this;
                },
                hookProgress(hookType, stopReason, systemMessage) {
                    throwIfDone(this.hookProgress);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const part = new extHostTypes.ChatResponseHookPart(hookType, stopReason, systemMessage);
                    const dto = typeConvert.ChatResponseHookPart.from(part);
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
                            let references;
                            if (matchingVarData.references?.length) {
                                references = matchingVarData.references.map(r => ({
                                    kind: 'reference',
                                    reference: { variableName: value.variableName, value: r.reference }
                                }));
                            }
                            else {
                                // Participant sent a variableName reference but the variable produced no references. Show variable reference with no value
                                const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
                                const dto = typeConvert.ChatResponseReferencePart.from(part);
                                references = [dto];
                            }
                            references.forEach(r => _report(r));
                            return this;
                        }
                        else {
                            // Something went wrong- that variable doesn't actually exist
                        }
                    }
                    else {
                        const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
                        const dto = typeConvert.ChatResponseReferencePart.from(part);
                        _report(dto);
                    }
                    return this;
                },
                codeCitation(value, license, snippet) {
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
                workspaceEdit(edits) {
                    throwIfDone(this.workspaceEdit);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const part = new extHostTypes.ChatResponseWorkspaceEditPart(edits);
                    const dto = typeConvert.ChatResponseWorkspaceEditPart.from(part);
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
                    }
                    finally {
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
                async questionCarousel(questions, allowSkip = true) {
                    throwIfDone(this.questionCarousel);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const resolveId = generateUuid();
                    const part = new extHostTypes.ChatResponseQuestionCarouselPart(questions, allowSkip);
                    const dto = typeConvert.ChatResponseQuestionCarouselPart.from(part);
                    dto.resolveId = resolveId;
                    // Create a deferred promise to wait for the answer
                    const deferred = new DeferredPromise();
                    // Store the deferred promise for later resolution
                    if (!that._pendingCarouselResolvers.has(that._request.requestId)) {
                        that._pendingCarouselResolvers.set(that._request.requestId, new Map());
                    }
                    that._pendingCarouselResolvers.get(that._request.requestId).set(resolveId, deferred);
                    _report(dto);
                    // Wait for the user to submit answers, but respect cancellation
                    return raceCancellation(deferred.p, that._token);
                },
                beginToolInvocation(toolCallId, toolName, streamData) {
                    throwIfDone(this.beginToolInvocation);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const dto = {
                        kind: 'beginToolInvocation',
                        toolCallId,
                        toolName,
                        streamData: streamData ? {
                            partialInput: streamData.partialInput
                        } : undefined,
                        subagentInvocationId: streamData?.subagentInvocationId,
                    };
                    _report(dto);
                    return this;
                },
                updateToolInvocation(toolCallId, streamData) {
                    throwIfDone(this.updateToolInvocation);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const dto = {
                        kind: 'updateToolInvocation',
                        toolCallId,
                        streamData: {
                            partialInput: streamData.partialInput
                        }
                    };
                    _report(dto);
                    return this;
                },
                push(part) {
                    throwIfDone(this.push);
                    if (part instanceof extHostTypes.ChatResponseTextEditPart ||
                        part instanceof extHostTypes.ChatResponseNotebookEditPart ||
                        part instanceof extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart ||
                        part instanceof extHostTypes.ChatResponseWarningPart ||
                        part instanceof extHostTypes.ChatResponseConfirmationPart ||
                        part instanceof extHostTypes.ChatResponseQuestionCarouselPart ||
                        part instanceof extHostTypes.ChatResponseCodeCitationPart ||
                        part instanceof extHostTypes.ChatResponseMovePart ||
                        part instanceof extHostTypes.ChatResponseExtensionsPart ||
                        part instanceof extHostTypes.ChatResponseExternalEditPart ||
                        part instanceof extHostTypes.ChatResponseThinkingProgressPart ||
                        part instanceof extHostTypes.ChatResponsePullRequestPart ||
                        part instanceof extHostTypes.ChatResponseProgressPart2) {
                        checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    }
                    if (part instanceof extHostTypes.ChatResponseReferencePart) {
                        // Ensure variable reference values get fixed up
                        this.reference2(part.value, part.iconPath, part.options);
                    }
                    else if (part instanceof extHostTypes.ChatResponseProgressPart2) {
                        const dto = part.task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
                        _report(dto, part.task);
                    }
                    else if (part instanceof extHostTypes.ChatResponseThinkingProgressPart) {
                        const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
                        _report(dto);
                    }
                    else if (part instanceof extHostTypes.ChatResponseAnchorPart) {
                        const dto = typeConvert.ChatResponseAnchorPart.from(part);
                        if (part.resolve) {
                            checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                            dto.resolveId = generateUuid();
                            const cts = new CancellationTokenSource();
                            part.resolve(cts.token)
                                .then(() => {
                                const resolvedDto = typeConvert.ChatResponseAnchorPart.from(part);
                                that._proxy.$handleAnchorResolve(that._request.requestId, dto.resolveId, resolvedDto);
                            })
                                .then(() => cts.dispose(), () => cts.dispose());
                            that._sessionDisposables.add(toDisposable(() => cts.dispose(true)));
                        }
                        _report(dto);
                    }
                    else if (part instanceof extHostTypes.ChatResponseExternalEditPart) {
                        const p = this.externalEdit(part.uris, part.callback);
                        p.then((value) => part.didGetApplied(value));
                        return this;
                    }
                    else {
                        const dto = typeConvert.ChatResponsePart.from(part, that._commandsConverter, that._sessionDisposables);
                        _report(dto);
                    }
                    return this;
                },
                usage(usage) {
                    throwIfDone(this.usage);
                    checkProposedApiEnabled(that._extension, 'chatParticipantAdditions');
                    const dto = {
                        kind: 'usage',
                        promptTokens: usage.promptTokens,
                        completionTokens: usage.completionTokens,
                        outputBuffer: usage.outputBuffer,
                        promptTokenDetails: usage.promptTokenDetails
                    };
                    _report(dto);
                    return this;
                },
            });
        }
        return this._apiObject;
    }
}
export class ExtHostChatAgents2 extends Disposable {
    static { this._idPool = 0; }
    static { this._participantDetectionProviderIdPool = 0; }
    static { this._contributionsProviderIdPool = 0; }
    static { this._customizationProviderIdPool = 0; }
    get activeChatPanelSessionResource() {
        return this._activeChatPanelSessionResource;
    }
    get customAgents() {
        return this._customAgents;
    }
    get instructions() {
        return this._instructions;
    }
    get skills() {
        return this._skills;
    }
    $acceptCustomAgents(agents) {
        this._customAgents = agents.map(a => Object.freeze({ uri: URI.revive(a.uri) }));
        this._onDidChangeCustomAgents.fire();
    }
    $acceptInstructions(instructions) {
        this._instructions = instructions.map(i => Object.freeze({ uri: URI.revive(i.uri) }));
        this._onDidChangeInstructions.fire();
    }
    $acceptSkills(skills) {
        this._skills = skills.map(s => Object.freeze({ uri: URI.revive(s.uri) }));
        this._onDidChangeSkills.fire();
    }
    constructor(mainContext, _logService, _commands, _documents, _editorsAndDocuments, _languageModels, _diagnostics, _tools) {
        super();
        this._logService = _logService;
        this._commands = _commands;
        this._documents = _documents;
        this._editorsAndDocuments = _editorsAndDocuments;
        this._languageModels = _languageModels;
        this._diagnostics = _diagnostics;
        this._tools = _tools;
        this._agents = new Map();
        this._participantDetectionProviders = new Map();
        this._promptFileProviders = new Map();
        this._customizationProviders = new Map();
        this._sessionDisposables = this._register(new DisposableResourceMap());
        this._completionDisposables = this._register(new DisposableMap());
        this._inFlightRequests = new Set();
        // Map of requestId -> resolveId -> deferred promise for question carousel answers
        this._pendingCarouselResolvers = new Map();
        this._onDidChangeChatRequestTools = this._register(new Emitter());
        this.onDidChangeChatRequestTools = this._onDidChangeChatRequestTools.event;
        this._onDidDisposeChatSession = this._register(new Emitter());
        this.onDidDisposeChatSession = this._onDidDisposeChatSession.event;
        this._onDidChangeCustomAgents = this._register(new Emitter());
        this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
        this._onDidChangeInstructions = this._register(new Emitter());
        this.onDidChangeInstructions = this._onDidChangeInstructions.event;
        this._onDidChangeSkills = this._register(new Emitter());
        this.onDidChangeSkills = this._onDidChangeSkills.event;
        this._customAgents = [];
        this._instructions = [];
        this._skills = [];
        this._onDidChangeActiveChatPanelSessionResource = this._register(new Emitter());
        this.onDidChangeActiveChatPanelSessionResource = this._onDidChangeActiveChatPanelSessionResource.event;
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
    async transferActiveChat(newWorkspace) {
        await this._proxy.$transferActiveChatSession(newWorkspace);
    }
    createChatAgent(extension, id, handler) {
        const handle = ExtHostChatAgents2._idPool++;
        const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
        this._agents.set(handle, agent);
        this._proxy.$registerAgent(handle, extension.identifier, id, {}, undefined);
        return agent.apiAgent;
    }
    createDynamicChatAgent(extension, id, dynamicProps, handler) {
        const handle = ExtHostChatAgents2._idPool++;
        const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
        this._agents.set(handle, agent);
        this._proxy.$registerAgent(handle, extension.identifier, id, { isSticky: true }, dynamicProps);
        return agent.apiAgent;
    }
    registerChatParticipantDetectionProvider(extension, provider) {
        const handle = ExtHostChatAgents2._participantDetectionProviderIdPool++;
        this._participantDetectionProviders.set(handle, new ExtHostParticipantDetector(extension, provider));
        this._proxy.$registerChatParticipantDetectionProvider(handle);
        return toDisposable(() => {
            this._participantDetectionProviders.delete(handle);
            this._proxy.$unregisterChatParticipantDetectionProvider(handle);
        });
    }
    /**
     * Internal method that handles all prompt file provider types.
     * Routes custom agents, instructions, prompt files, and skills to the unified internal implementation.
     */
    registerPromptFileProvider(extension, type, provider) {
        const handle = ExtHostChatAgents2._contributionsProviderIdPool++;
        this._promptFileProviders.set(handle, { extension, provider });
        this._proxy.$registerPromptFileProvider(handle, type, extension.identifier);
        const disposables = new DisposableStore();
        // Listen to provider change events and notify main thread
        // Check for the appropriate event based on the provider type
        let changeEvent;
        switch (type) {
            case PromptsType.agent:
                changeEvent = provider.onDidChangeCustomAgents;
                break;
            case PromptsType.instructions:
                changeEvent = provider.onDidChangeInstructions;
                break;
            case PromptsType.prompt:
                changeEvent = provider.onDidChangePromptFiles;
                break;
            case PromptsType.skill:
                changeEvent = provider.onDidChangeSkills;
                break;
        }
        if (changeEvent) {
            disposables.add(changeEvent(() => {
                this._proxy.$onDidChangePromptFiles(handle);
            }));
        }
        disposables.add(toDisposable(() => {
            this._promptFileProviders.delete(handle);
            this._proxy.$unregisterPromptFileProvider(handle);
        }));
        return disposables;
    }
    async $providePromptFiles(handle, type, context, token) {
        const providerData = this._promptFileProviders.get(handle);
        if (!providerData) {
            return undefined;
        }
        const provider = providerData.provider;
        let resources;
        switch (type) {
            case PromptsType.agent:
                resources = await provider.provideCustomAgents(context, token) ?? undefined;
                break;
            case PromptsType.instructions:
                resources = await provider.provideInstructions(context, token) ?? undefined;
                break;
            case PromptsType.prompt:
                resources = await provider.providePromptFiles(context, token) ?? undefined;
                break;
            case PromptsType.skill:
                resources = await provider.provideSkills(context, token) ?? undefined;
                break;
        }
        return resources;
    }
    registerChatSessionCustomizationProvider(extension, chatSessionType, metadata, provider) {
        const handle = ExtHostChatAgents2._customizationProviderIdPool++;
        this._customizationProviders.set(handle, { extension, provider });
        const metadataDto = {
            label: metadata.label,
            iconId: metadata.iconId,
            supportedTypes: metadata.supportedTypes?.map(t => typeConvert.ChatSessionCustomizationType.from(t)),
        };
        this._proxy.$registerChatSessionCustomizationProvider(handle, chatSessionType, metadataDto, extension.identifier);
        const disposables = new DisposableStore();
        if (provider.onDidChange) {
            disposables.add(provider.onDidChange(() => {
                this._proxy.$onDidChangeCustomizations(handle);
            }));
        }
        disposables.add(toDisposable(() => {
            this._customizationProviders.delete(handle);
            this._proxy.$unregisterChatSessionCustomizationProvider(handle);
        }));
        return disposables;
    }
    async $provideChatSessionCustomizations(handle, token) {
        const providerData = this._customizationProviders.get(handle);
        if (!providerData) {
            return undefined;
        }
        try {
            const items = await providerData.provider.provideChatSessionCustomizations(token);
            if (!items) {
                return undefined;
            }
            return items.map(item => ({
                uri: item.uri,
                type: typeConvert.ChatSessionCustomizationType.from(item.type),
                name: item.name,
                description: item.description,
                groupKey: item.groupKey,
                badge: item.badge,
                badgeTooltip: item.badgeTooltip,
            }));
        }
        catch (err) {
            return undefined;
        }
    }
    async $detectChatParticipant(handle, requestDto, context, options, token) {
        const detector = this._participantDetectionProviders.get(handle);
        if (!detector) {
            return undefined;
        }
        const { request, location, history } = await this._createRequest(requestDto, context, detector.extension);
        const model = await this.getModelForRequest(request, detector.extension);
        const tools = await this.getToolsForRequest(detector.extension, request.userSelectedTools, model.id, token);
        const extRequest = typeConvert.ChatAgentRequest.to(request, location, model, request.modelConfiguration, this.getDiagnosticsWhenEnabled(detector.extension), tools, detector.extension, this._logService);
        return detector.provider.provideParticipantDetection(extRequest, { history, yieldRequested: false }, { participants: options.participants, location: typeConvert.ChatLocation.to(options.location) }, token);
    }
    async _createRequest(requestDto, context, extension) {
        const request = revive(requestDto);
        const convertedHistory = await this.prepareHistoryTurns(extension, request.agentId, context);
        // in-place converting for location-data
        let location;
        if (request.locationData?.type === ChatAgentLocation.EditorInline) {
            // editor data
            const document = this._documents.getDocument(request.locationData.document);
            const editor = this._editorsAndDocuments.getEditor(request.locationData.id);
            location = new extHostTypes.ChatRequestEditorData(editor.value, document, typeConvert.Selection.to(request.locationData.selection), typeConvert.Range.to(request.locationData.wholeRange));
        }
        else if (request.locationData?.type === ChatAgentLocation.Notebook) {
            // notebook data
            const cell = this._documents.getDocument(request.locationData.sessionInputUri);
            location = new extHostTypes.ChatRequestNotebookData(cell);
        }
        else if (request.locationData?.type === ChatAgentLocation.Terminal) {
            // TBD
        }
        return { request, location, history: convertedHistory };
    }
    async getModelForRequest(request, extension) {
        let model;
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
    async $setRequestTools(requestId, tools) {
        const request = [...this._inFlightRequests].find(r => r.requestId === requestId);
        if (!request) {
            return;
        }
        request.extRequest.tools.clear();
        const toolsMap = await this.getToolsForRequest(request.extension, tools, request.extRequest.model.id, CancellationToken.None);
        for (const [k, v] of toolsMap) {
            request.extRequest.tools.set(k, v);
        }
        this._onDidChangeChatRequestTools.fire(request.extRequest);
    }
    $setYieldRequested(requestId, value) {
        const request = [...this._inFlightRequests].find(r => r.requestId === requestId);
        if (request) {
            request.yieldRequested = value;
        }
    }
    async $invokeAgent(handle, requestDto, context, token) {
        const agent = this._agents.get(handle);
        if (!agent) {
            throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
        }
        let stream;
        let inFlightRequest;
        try {
            const { request, location, history } = await this._createRequest(requestDto, context, agent.extension);
            // Init session disposables
            let sessionDisposables = this._sessionDisposables.get(request.sessionResource);
            if (!sessionDisposables) {
                sessionDisposables = new DisposableStore();
                this._sessionDisposables.set(request.sessionResource, sessionDisposables);
            }
            stream = new ChatAgentResponseStream(agent.extension, request, this._proxy, this._commands.converter, sessionDisposables, this._pendingCarouselResolvers, token);
            const model = await this.getModelForRequest(request, agent.extension);
            const tools = await this.getToolsForRequest(agent.extension, request.userSelectedTools, model.id, token);
            const extRequest = typeConvert.ChatAgentRequest.to(request, location, model, request.modelConfiguration, this.getDiagnosticsWhenEnabled(agent.extension), tools, agent.extension, this._logService);
            inFlightRequest = { requestId: requestDto.requestId, extRequest, extension: agent.extension, hooks: request.hooks, yieldRequested: false };
            this._inFlightRequests.add(inFlightRequest);
            // If this request originates from a contributed chat session editor, attempt to resolve the ChatSession API object
            let chatSessionContext;
            if (context.chatSessionContext) {
                chatSessionContext = {
                    chatSessionItem: {
                        resource: URI.revive(context.chatSessionContext.chatSessionResource),
                        label: context.chatSessionContext.isUntitled ? 'Untitled Session' : 'Session',
                    },
                    isUntitled: context.chatSessionContext.isUntitled,
                    initialSessionOptions: context.chatSessionContext.initialSessionOptions,
                };
            }
            const chatContext = {
                history,
                chatSessionContext,
                get yieldRequested() { return inFlightRequest?.yieldRequested ?? false; }
            };
            const task = agent.invoke(extRequest, chatContext, stream.apiObject, token);
            return await raceCancellationWithTimeout(1000, Promise.resolve(task).then((result) => {
                if (result?.metadata) {
                    try {
                        JSON.stringify(result.metadata);
                    }
                    catch (err) {
                        const msg = `result.metadata MUST be JSON.stringify-able. Got error: ${err.message}`;
                        this._logService.error(`[${agent.extension.identifier.value}] [@${agent.id}] ${msg}`, agent.extension);
                        return { errorDetails: { message: msg }, timings: stream?.timings, nextQuestion: result.nextQuestion, };
                    }
                }
                let errorDetails;
                if (result?.errorDetails) {
                    errorDetails = {
                        ...result.errorDetails,
                        responseIsIncomplete: true
                    };
                }
                if (errorDetails?.responseIsRedacted || errorDetails?.isQuotaExceeded || errorDetails?.isRateLimited || errorDetails?.confirmationButtons || errorDetails?.code) {
                    checkProposedApiEnabled(agent.extension, 'chatParticipantPrivate');
                }
                return { errorDetails, timings: stream?.timings, metadata: result?.metadata, nextQuestion: result?.nextQuestion, details: result?.details };
            }), token);
        }
        catch (e) {
            this._logService.error(e, agent.extension);
            if (e instanceof extHostTypes.LanguageModelError && e.cause) {
                e = e.cause;
            }
            const isQuotaExceeded = e instanceof Error && e.name === 'ChatQuotaExceeded';
            const isRateLimited = e instanceof Error && e.name === 'ChatRateLimited';
            const { callstack: errorCallstack } = packErrorForTelemetry(e);
            const errorName = e instanceof Error ? e.name : undefined;
            return { errorDetails: { message: toErrorMessage(e), responseIsIncomplete: true, isQuotaExceeded, isRateLimited }, errorCallstack, errorName };
        }
        finally {
            if (inFlightRequest) {
                this._inFlightRequests.delete(inFlightRequest);
            }
            // Clean up any pending carousel resolvers for this request
            const pendingResolvers = this._pendingCarouselResolvers.get(requestDto.requestId);
            if (pendingResolvers) {
                for (const deferred of pendingResolvers.values()) {
                    deferred.complete(undefined);
                }
                this._pendingCarouselResolvers.delete(requestDto.requestId);
            }
            stream?.close();
        }
    }
    getDiagnosticsWhenEnabled(extension) {
        if (!isProposedApiEnabled(extension, 'chatReferenceDiagnostic')) {
            return [];
        }
        return this._diagnostics.getDiagnostics();
    }
    async getToolsForRequest(extension, tools, modelId, token) {
        if (!tools) {
            return new Map();
        }
        const result = new Map();
        for (const tool of this._tools.getTools(extension)) {
            if (typeof tools[tool.name] === 'boolean') {
                result.set(tool, tools[tool.name]);
            }
        }
        return result;
    }
    async prepareHistoryTurns(extension, agentId, context) {
        const res = [];
        for (const h of context.history) {
            const ehResult = typeConvert.ChatAgentResult.to(h.result);
            const result = agentId === h.request.agentId || (isBuiltinParticipant(h.request.agentId) && isBuiltinParticipant(agentId)) ?
                ehResult :
                { ...ehResult, metadata: undefined };
            // REQUEST turn
            const varsWithoutTools = [];
            const toolReferences = [];
            for (const v of h.request.variables.variables) {
                if (v.kind === 'tool') {
                    toolReferences.push(typeConvert.ChatLanguageModelToolReference.to(v));
                }
                else if (v.kind === 'toolset') {
                    toolReferences.push(...v.value.map(typeConvert.ChatLanguageModelToolReference.to));
                }
                else {
                    const ref = typeConvert.ChatPromptReference.to(v, this.getDiagnosticsWhenEnabled(extension), this._logService);
                    if (ref) {
                        varsWithoutTools.push(ref);
                    }
                }
            }
            const editedFileEvents = isProposedApiEnabled(extension, 'chatParticipantPrivate') ? h.request.editedFileEvents : undefined;
            const modeInstructions2 = isProposedApiEnabled(extension, 'chatParticipantPrivate') && h.request.modeInstructions ? typeConvert.ChatRequestModeInstructions.to(h.request.modeInstructions) : undefined;
            const turn = new extHostTypes.ChatRequestTurn(h.request.message, h.request.command, varsWithoutTools, h.request.agentId, toolReferences, editedFileEvents, h.request.requestId, undefined, modeInstructions2);
            res.push(turn);
            // RESPONSE turn
            const parts = coalesce(h.response.map(r => typeConvert.ChatResponsePart.toContent(r, this._commands.converter)));
            res.push(new extHostTypes.ChatResponseTurn(parts, result, h.request.agentId, h.request.command));
        }
        return res;
    }
    $releaseSession(sessionResourceDto) {
        const sessionResource = URI.revive(sessionResourceDto);
        this._sessionDisposables.deleteAndDispose(sessionResource);
        const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
        if (sessionId) {
            this._onDidDisposeChatSession.fire(sessionId);
        }
    }
    $acceptActiveChatSession(sessionResourceDto) {
        const sessionResource = sessionResourceDto ? URI.revive(sessionResourceDto) : undefined;
        if (this._activeChatPanelSessionResource?.toString() === sessionResource?.toString()) {
            return;
        }
        this._activeChatPanelSessionResource = sessionResource;
        this._onDidChangeActiveChatPanelSessionResource.fire(sessionResource);
    }
    async $provideFollowups(requestDto, handle, result, context, token) {
        const agent = this._agents.get(handle);
        if (!agent) {
            return Promise.resolve([]);
        }
        const request = revive(requestDto);
        const convertedHistory = await this.prepareHistoryTurns(agent.extension, agent.id, context);
        const ehResult = typeConvert.ChatAgentResult.to(result);
        return (await agent.provideFollowups(ehResult, { history: convertedHistory, yieldRequested: false }, token))
            .filter(f => {
            // The followup must refer to a participant that exists from the same extension
            const isValid = !f.participant || Iterable.some(this._agents.values(), a => a.id === f.participant && ExtensionIdentifier.equals(a.extension.identifier, agent.extension.identifier));
            if (!isValid) {
                this._logService.warn(`[@${agent.id}] ChatFollowup refers to an unknown participant: ${f.participant}`);
            }
            return isValid;
        })
            .map(f => typeConvert.ChatFollowup.from(f, request));
    }
    $acceptFeedback(handle, result, voteAction) {
        const agent = this._agents.get(handle);
        if (!agent) {
            return;
        }
        const ehResult = typeConvert.ChatAgentResult.to(result);
        let kind;
        switch (voteAction.direction) {
            case ChatAgentVoteDirection.Down:
                kind = extHostTypes.ChatResultFeedbackKind.Unhelpful;
                break;
            case ChatAgentVoteDirection.Up:
                kind = extHostTypes.ChatResultFeedbackKind.Helpful;
                break;
        }
        const feedback = {
            result: ehResult,
            kind,
        };
        agent.acceptFeedback(Object.freeze(feedback));
    }
    $handleQuestionCarouselAnswer(requestId, resolveId, answers) {
        const requestResolvers = this._pendingCarouselResolvers.get(requestId);
        if (!requestResolvers) {
            return;
        }
        const deferred = requestResolvers.get(resolveId);
        if (deferred) {
            deferred.complete(answers);
            requestResolvers.delete(resolveId);
        }
        // Clean up if no more resolvers for this request
        if (requestResolvers.size === 0) {
            this._pendingCarouselResolvers.delete(requestId);
        }
    }
    $acceptAction(handle, result, event) {
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
    async $invokeCompletionProvider(handle, query, token) {
        const agent = this._agents.get(handle);
        if (!agent) {
            return [];
        }
        let disposables = this._completionDisposables.get(handle);
        if (disposables) {
            // Clear any disposables from the last invocation of this completion provider
            disposables.clear();
        }
        else {
            disposables = new DisposableStore();
            this._completionDisposables.set(handle, disposables);
        }
        const items = await agent.invokeCompletionProvider(query, token);
        return items.map((i) => typeConvert.ChatAgentCompletionItem.from(i, this._commands.converter, disposables));
    }
    async $provideChatTitle(handle, context, token) {
        const agent = this._agents.get(handle);
        if (!agent) {
            return;
        }
        const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
        const sessionResource = context[0]?.request.sessionResource ? URI.revive(context[0].request.sessionResource) : undefined;
        return await agent.provideTitle({ history, sessionResource, yieldRequested: false }, token);
    }
    async $provideChatSummary(handle, context, token) {
        const agent = this._agents.get(handle);
        if (!agent) {
            return;
        }
        const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
        const sessionResource = context[0]?.request.sessionResource ? URI.revive(context[0].request.sessionResource) : undefined;
        return await agent.provideSummary({ history, sessionResource, yieldRequested: false }, token);
    }
}
class ExtHostParticipantDetector {
    constructor(extension, provider) {
        this.extension = extension;
        this.provider = provider;
    }
}
class ExtHostChatAgent {
    constructor(extension, id, _proxy, _handle, _requestHandler) {
        this.extension = extension;
        this.id = id;
        this._proxy = _proxy;
        this._handle = _handle;
        this._requestHandler = _requestHandler;
        this._onDidReceiveFeedback = new Emitter();
        this._onDidPerformAction = new Emitter();
        this._pauseStateEmitter = new Emitter();
    }
    acceptFeedback(feedback) {
        this._onDidReceiveFeedback.fire(feedback);
    }
    acceptAction(event) {
        this._onDidPerformAction.fire(event);
    }
    setChatRequestPauseState(pauseState) {
        this._pauseStateEmitter.fire(pauseState);
    }
    async invokeCompletionProvider(query, token) {
        if (!this._agentVariableProvider) {
            return [];
        }
        return await this._agentVariableProvider.provider.provideCompletionItems(query, token) ?? [];
    }
    async provideFollowups(result, context, token) {
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
    async provideTitle(context, token) {
        if (!this._titleProvider) {
            return;
        }
        return await this._titleProvider.provideChatTitle(context, token) ?? undefined;
    }
    async provideSummary(context, token) {
        if (!this._summarizer) {
            return;
        }
        return await this._summarizer.provideChatSummary(context, token) ?? undefined;
    }
    get apiAgent() {
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
                }
                else {
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
                ? undefined
                : this._onDidPerformAction.event,
            dispose() {
                disposed = true;
                that._followupProvider = undefined;
                that._onDidReceiveFeedback.dispose();
                that._onDidPerformAction.dispose();
                that._pauseStateEmitter.dispose();
                that._proxy.$unregisterAgent(that._handle);
            },
        };
    }
    invoke(request, context, response, token) {
        return this._requestHandler(request, context, response, token);
    }
}
/**
 * raceCancellation, but give the promise a little time to complete to see if we can get a real result quickly.
 */
function raceCancellationWithTimeout(cancelWait, promise, token) {
    return new Promise((resolve, reject) => {
        const ref = token.onCancellationRequested(async () => {
            ref.dispose();
            await timeout(cancelWait);
            resolve(undefined);
        });
        promise.then(resolve, reject).finally(() => ref.dispose());
    });
}
function isBuiltinParticipant(agentId) {
    return agentId.startsWith('github.copilot');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENoYXRBZ2VudHMyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdENoYXRBZ2VudHMyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzNGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwSSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMzRCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQXVELE1BQU0sbURBQW1ELENBQUM7QUFFN0ksT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDN0YsT0FBTyxFQUFFLDRC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