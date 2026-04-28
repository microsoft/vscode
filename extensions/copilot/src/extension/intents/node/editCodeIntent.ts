/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ChatResponseReferencePartStatusKind, MetadataMap, PromptReference, Raw } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isNotebookDocumentSnapshotJSON, NotebookDocumentSnapshot } from '../../../platform/editing/common/notebookDocumentSnapshot';
import { isTextDocumentSnapshotJSON, TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IEnvService } from '../../../platform/env/common/envService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isLocation } from '../../../util/common/types';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { basename, isEqual } from '../../../util/vs/base/common/resources';
import { assertType, isObject } from '../../../util/vs/base/common/types';
import { isUriComponents, URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { BrandedService, IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestEditorData, Location, MarkdownString } from '../../../vscodeTypes';
import { CodeBlockInfo, CodeBlockProcessor, isCodeBlockWithResource } from '../../codeBlocks/node/codeBlockProcessor';
import { ICommandService } from '../../commands/node/commandService';
import { Intent } from '../../common/constants';
import { GenericInlineIntentInvocation } from '../../context/node/resolvers/genericInlineIntentInvocation';
import { ChatVariablesCollection, InstructionFileIdPrefix, isInstructionFile } from '../../prompt/common/chatVariablesCollection';
import { CodeBlock, Conversation, Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext, InternalToolReference, IWorkingSet, IWorkingSetEntry, WorkingSetEntryState } from '../../prompt/common/intents';
import { ChatTelemetryBuilder } from '../../prompt/node/chatParticipantTelemetry';
import { CodebaseToolCallingLoop } from '../../prompt/node/codebaseToolCalling';
import { IntentInvocationMetadata } from '../../prompt/node/conversation';
import { DefaultIntentRequestHandler, IDefaultIntentRequestHandlerOptions } from '../../prompt/node/defaultIntentRequestHandler';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { EditStrategy } from '../../prompt/node/editGeneration';
import { IBuildPromptResult, IIntent, IIntentInvocation, IIntentInvocationContext, IntentLinkificationOptions, IResponseProcessorContext } from '../../prompt/node/intents';
import { reportCitations } from '../../prompt/node/pseudoStartStopConversationCallback';
import { PromptRenderer, renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { ICodeMapperService, IMapCodeRequest, IMapCodeResult } from '../../prompts/node/codeMapper/codeMapperService';
import { ChatToolReferences } from '../../prompts/node/panel/chatVariables';
import { EXISTING_CODE_MARKER } from '../../prompts/node/panel/codeBlockFormattingRules';
import { EditCodePrompt } from '../../prompts/node/panel/editCodePrompt';
import { ToolCallResultWrapper, ToolResultMetadata } from '../../prompts/node/panel/toolCalling';
import { getToolName, ToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { CodebaseTool } from '../../tools/node/codebaseTool';
import { sendEditNotebookTelemetry } from '../../tools/node/editNotebookTool';
import { EditCodeStep, EditCodeStepTurnMetaData, PreviousEditCodeStep } from './editCodeStep';


type IntentInvocationCtor<T extends BrandedService[]> = {
	new(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		request: vscode.ChatRequest,
		intentOptions: EditCodeIntentOptions,
		...args: T[]
	): EditCodeIntentInvocation;
};

export interface EditCodeIntentOptions extends EditCodeIntentInvocationOptions {
	intentInvocation: IntentInvocationCtor<any>;
}

export interface EditCodeIntentInvocationOptions {
	processCodeblocks: boolean;
}

export class EditCodeIntent implements IIntent {

	static readonly ID: Intent = Intent.Edit;

	readonly id: string = EditCodeIntent.ID;

	readonly description = l10n.t('Make changes to existing code');

	readonly locations = [ChatLocation.Editor, ChatLocation.Panel];

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IEndpointProvider protected readonly endpointProvider: IEndpointProvider,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IExperimentationService protected readonly expService: IExperimentationService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		private readonly intentOptions: EditCodeIntentOptions = { processCodeblocks: true, intentInvocation: EditCodeIntentInvocation },
	) { }

	private async _handleCodesearch(conversation: Conversation, request: vscode.ChatRequest, location: ChatLocation, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext | undefined, chatTelemetry: ChatTelemetryBuilder): Promise<{ request: vscode.ChatRequest; conversation: Conversation }> {
		const foundReferences: vscode.ChatPromptReference[] = [];
		if ((this.configurationService.getConfig(ConfigKey.CodeSearchAgentEnabled) || this.configurationService.getConfig(ConfigKey.Advanced.CodeSearchAgentEnabled)) && request.toolReferences.find((r) => r.name === CodebaseTool.toolName && !isDirectorySemanticSearch(r))) {

			const latestTurn = conversation.getLatestTurn();

			const codebaseTool = this.instantiationService.createInstance(CodebaseToolCallingLoop, {
				conversation,
				toolCallLimit: 5,
				request,
				location,
			});

			const toolCallLoopResult = await codebaseTool.run(stream, token);

			const toolCallResults = toolCallLoopResult.toolCallResults;
			if (!toolCallLoopResult.chatResult?.errorDetails && toolCallResults) {
				// TODO: do these new references need a lower priority?
				const variables = new ChatVariablesCollection(request.references);
				const endpoint = await this.endpointProvider.getChatEndpoint(request);
				const { references } = await renderPromptElement(this.instantiationService, endpoint, ToolCallResultWrapper, { toolCallResults }, undefined, token);
				foundReferences.push(...toNewChatReferences(variables, references));
				// TODO: how should we splice in the assistant message?
				conversation = new Conversation(conversation.sessionId, [...conversation.turns.slice(0, -1), new Turn(latestTurn.id, latestTurn.request, undefined)]);
			}
			return { conversation, request: { ...request, references: [...request.references, ...foundReferences], toolReferences: request.toolReferences.filter((r) => r.name !== CodebaseTool.toolName) } };
		}
		return { conversation, request };
	}

	private async _handleApplyConfirmedEdits(edits: (MappedEditsRequest & { chatRequestId: string; chatRequestModel: string })[], outputStream: vscode.ChatResponseStream, token: CancellationToken) {
		const hydrateMappedEditsRequest = async (request: MappedEditsRequest): Promise<MappedEditsRequest> => {
			const workingSet = await Promise.all(request.workingSet.map(async (ws): Promise<IWorkingSetEntry> => {
				if (isTextDocumentSnapshotJSON(ws.document)) {
					const document = await this.workspaceService.openTextDocument(ws.document.uri);
					return { ...ws, document: TextDocumentSnapshot.fromJSON(document, ws.document) };
				} else if (isNotebookDocumentSnapshotJSON(ws.document)) {
					const document = await this.workspaceService.openNotebookDocument(ws.document.uri);
					return { ...ws, document: NotebookDocumentSnapshot.fromJSON(document, ws.document) };
				}
				return ws;
			}));

			return { ...request, workingSet };
		};

		await Promise.all(edits.map(async requestDry => {
			const request = await hydrateMappedEditsRequest(requestDry);
			const uri = request.codeBlock.resource;

			outputStream.markdown(l10n.t`Applying edits to \`${this.workspaceService.asRelativePath(uri)}\`...\n\n`);
			outputStream.textEdit(uri, []); // signal start of

			try {
				return await this.codeMapperService.mapCode(request, outputStream, { chatRequestId: requestDry.chatRequestId, chatRequestModel: requestDry.chatRequestModel, chatRequestSource: `confirmed_edits_${this.id}` }, token);
			} finally {
				if (!token.isCancellationRequested) {
					outputStream.textEdit(uri, true);
				}
			}
		}));
	}

	async handleRequest(conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext | undefined, agentName: string, location: ChatLocation, chatTelemetry: ChatTelemetryBuilder, yieldRequested: () => boolean): Promise<vscode.ChatResult> {
		const applyEdits = request.acceptedConfirmationData?.filter(isEditsOkayConfirmation);
		if (applyEdits?.length) {
			await this._handleApplyConfirmedEdits(applyEdits.flatMap(e => ({ ...e.edits, chatRequestId: e.chatRequestId, chatRequestModel: request.model.id })), stream, token);
			return {};
		}

		({ conversation, request } = await this._handleCodesearch(conversation, request, location, stream, token, documentContext, chatTelemetry));
		return this.instantiationService.createInstance(EditIntentRequestHandler, this, conversation, request, stream, token, documentContext, location, chatTelemetry, this.getIntentHandlerOptions(request), yieldRequested).getResult();
	}

	protected getIntentHandlerOptions(_request: vscode.ChatRequest): IDefaultIntentRequestHandlerOptions | undefined {
		return undefined;
	}

	async invoke(invocationContext: IIntentInvocationContext) {
		const { location, documentContext, request } = invocationContext;
		const endpoint = await this.endpointProvider.getChatEndpoint(request);

		if (location === ChatLocation.Panel || location === ChatLocation.Notebook) {
			return this.instantiationService.createInstance(this.intentOptions.intentInvocation, this, location, endpoint, request, this.intentOptions);
		}

		if (!documentContext) {
			throw new Error('Open a file to add code.');
		}
		return this.instantiationService.createInstance(GenericInlineIntentInvocation, this, location, endpoint, documentContext, EditStrategy.FallbackToReplaceRange);
	}
}

class EditIntentRequestHandler {

	constructor(
		private readonly intent: EditCodeIntent,
		private readonly conversation: Conversation,
		private readonly request: vscode.ChatRequest,
		private readonly stream: vscode.ChatResponseStream,
		private readonly token: vscode.CancellationToken,
		private readonly documentContext: IDocumentContext | undefined,
		private readonly location: ChatLocation,
		private readonly chatTelemetry: ChatTelemetryBuilder,
		private readonly handlerOptions: IDefaultIntentRequestHandlerOptions | undefined,
		private readonly yieldRequested: () => boolean,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IEditLogService private readonly editLogService: IEditLogService,
		@IOTelService private readonly otelService: IOTelService,
	) { }

	async getResult(): Promise<vscode.ChatResult> {
		const actual = this.instantiationService.createInstance(
			DefaultIntentRequestHandler,
			this.intent,
			this.conversation,
			this.request,
			this.stream,
			this.token,
			this.documentContext,
			this.location,
			this.chatTelemetry,
			this.handlerOptions,
			this.yieldRequested,
		);
		const result = await actual.getResult();

		// Record telemetry for the edit code blocks in an editing session
		const turn = this.conversation.getLatestTurn();
		const currentTurnMetadata = turn.getMetadata(IntentInvocationMetadata)?.value;
		const editCodeStep = (currentTurnMetadata instanceof EditCodeIntentInvocation ? currentTurnMetadata._editCodeStep : undefined);

		if (editCodeStep?.telemetryInfo) {
			/* __GDPR__
					"panel.edit.codeblocks" : {
						"owner": "joyceerhl",
						"comment": "Records information about the proposed edit codeblocks in an editing session",
						"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current chat conversation." },
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request succeeded or failed." },
						"workingSetCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of entries in the working set" },
						"uniqueCodeblockUriCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of unique code block URIs" },
						"codeblockCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of code blocks in the response" },
						"codeblockWithUriCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of code blocks that had URIs" },
						"codeblockWithElidedCodeCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of code blocks that had a ...existing code... comment" },
						"shellCodeblockCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of shell code blocks in the response" },
						"shellCodeblockWithUriCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of shell code blocks that had URIs" },
						"shellCodeblockWithElidedCodeCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of shell code blocks that had a ...existing code... comment" },
						"editStepCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of edit steps in the session so far" },
						"sessionDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The time since the session started" },
						"intentId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The ID of the intent being executed" }
					}
				*/
			this.telemetryService.sendMSFTTelemetryEvent('panel.edit.codeblocks', {
				conversationId: this.conversation.sessionId,
				outcome: Boolean(result.errorDetails) ? 'error' : 'success',
				intentId: this.intent.id
			}, {
				workingSetCount: editCodeStep.workingSet.length,
				uniqueCodeblockUriCount: editCodeStep.telemetryInfo.codeblockUris.size,
				codeblockCount: editCodeStep.telemetryInfo.codeblockCount,
				codeblockWithUriCount: editCodeStep.telemetryInfo.codeblockWithUriCount,
				codeblockWithElidedCodeCount: editCodeStep.telemetryInfo.codeblockWithElidedCodeCount,
				shellCodeblockCount: editCodeStep.telemetryInfo.shellCodeblockCount,
				shellCodeblockWithUriCount: editCodeStep.telemetryInfo.shellCodeblockWithUriCount,
				shellCodeblockWithElidedCodeCount: editCodeStep.telemetryInfo.shellCodeblockWithElidedCodeCount,
				editStepCount: this.conversation.turns.length,
				sessionDuration: Date.now() - turn.startTime,
			});
			GenAiMetrics.incrementAgentEditResponseCount(this.otelService, Boolean(result.errorDetails) ? 'error' : 'success');
		}

		await this.editLogService.markCompleted(turn.id, result.errorDetails ? 'error' : 'success');

		return result;
	}
}

type MappedEditsRequest = IMapCodeRequest & { workingSet: IWorkingSet };

const enum ConfirmationIds {
	EditsOkay = '4e6e0e05-5dab-48d0-b2cd-6a14c8e3e8a2', // random string
}

interface IEditsOkayConfirmation {
	id: ConfirmationIds.EditsOkay;
	chatRequestId: string;
	edits: MappedEditsRequest;
}

const makeEditsConfirmation = (chatRequestId: string, edits: MappedEditsRequest): IEditsOkayConfirmation => ({
	id: ConfirmationIds.EditsOkay,
	chatRequestId,
	edits,
});

const isEditsOkayConfirmation = (obj: unknown): obj is IEditsOkayConfirmation =>
	isObject(obj) && (obj as IEditsOkayConfirmation).id === ConfirmationIds.EditsOkay;

export class EditCodeIntentInvocation implements IIntentInvocation {

	public _editCodeStep: EditCodeStep | undefined = undefined;

	/**
	 * Stable codebase invocation so that their {@link InternalToolReference.id ids}
	 * are reused across multiple turns.
	 */
	protected stableToolReferences = this.request.toolReferences.map(InternalToolReference.from);

	public get linkification(): IntentLinkificationOptions {
		return { disable: false };
	}

	public readonly codeblocksRepresentEdits: boolean = true;

	constructor(
		readonly intent: IIntent,
		readonly location: ChatLocation,
		readonly endpoint: IChatEndpoint,
		protected readonly request: vscode.ChatRequest,
		private readonly intentOptions: EditCodeIntentInvocationOptions,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IEnvService private readonly envService: IEnvService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IToolsService protected readonly toolsService: IToolsService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IEditLogService private readonly editLogService: IEditLogService,
		@ICommandService protected readonly commandService: ICommandService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@INotebookService private readonly notebookService: INotebookService,
		@IOTelService protected readonly otelService: IOTelService,
	) { }

	getAvailableTools(): vscode.LanguageModelToolInformation[] | Promise<vscode.LanguageModelToolInformation[]> | undefined {
		return undefined;
	}

	async buildPrompt(
		promptContext: IBuildPromptContext,
		progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>,
		token: vscode.CancellationToken
	): Promise<IBuildPromptResult> {

		// Add any references from the codebase invocation to the request
		const codebase = await this._getCodebaseReferences(promptContext, token);

		let variables = promptContext.chatVariables;
		let toolReferences: vscode.ChatPromptReference[] = [];
		if (codebase) {
			toolReferences = toNewChatReferences(variables, codebase.references);
			variables = new ChatVariablesCollection([...this.request.references, ...toolReferences]);
		}

		if (this.request.location2 instanceof ChatRequestEditorData) {
			const editorRequestReference: vscode.ChatPromptReference = {
				id: '',
				name: this.request.location2.document.fileName,
				value: new Location(this.request.location2.document.uri, this.request.location2.wholeRange)
			};
			variables = new ChatVariablesCollection([...this.request.references, ...toolReferences, editorRequestReference]);
		}



		const tools = await this.getAvailableTools();
		const toolTokens = tools?.length ? await this.endpoint.acquireTokenizer().countToolTokens(tools) : 0;
		const endpoint = toolTokens > 0 ? this.endpoint.cloneWithTokenOverride(Math.floor((this.endpoint.modelMaxPromptTokens - toolTokens) * 0.85)) : this.endpoint;
		const { editCodeStep, chatVariables } = await EditCodeStep.create(this.instantiationService, promptContext.history, variables, endpoint);
		this._editCodeStep = editCodeStep;

		const commandToolReferences: InternalToolReference[] = [];
		let query = promptContext.query;
		const command = this.request.command && this.commandService.getCommand(this.request.command, this.location);
		if (command) {
			if (command.toolEquivalent) {
				commandToolReferences.push({
					id: `${this.request.command}->${generateUuid()}`,
					name: getToolName(command.toolEquivalent)
				});
			}
			query = query ? `${command.details}.\n${query}` : command.details;
		}

		// Reserve extra space when tools are involved due to token counting issues
		const renderer = PromptRenderer.create(this.instantiationService, endpoint, EditCodePrompt, {
			endpoint,
			promptContext: {
				...promptContext,
				query,
				chatVariables,
				workingSet: editCodeStep.workingSet,
				promptInstructions: editCodeStep.promptInstructions,
				toolCallResults: { ...promptContext.toolCallResults, ...codebase?.toolCallResults },
				tools: promptContext.tools && {
					...promptContext.tools,
					toolReferences: this.stableToolReferences.filter((r) => r.name !== ToolName.Codebase).concat(commandToolReferences),
				},
			},
			location: this.location
		});
		const start = Date.now();
		const result = await renderer.render(progress, token);
		const duration = Date.now() - start;
		this.sendPromptRenderTelemetry(duration);
		const lastMessage = result.messages[result.messages.length - 1];
		if (lastMessage.role === Raw.ChatRole.User) {
			this._editCodeStep.setUserMessage(lastMessage);
		}

		return {
			...result,
			// The codebase tool is not actually called/referenced in the edit prompt, so we need to
			// merge its metadata so that its output is not lost and it's not called repeatedly every turn
			// todo@connor4312/joycerhl: this seems a bit janky
			metadata: codebase ? mergeMetadata(result.metadata, codebase.metadatas) : result.metadata,
			// Don't report file references that came in via chat variables in an editing session, unless they have warnings,
			// because they are already displayed as part of the working set
			references: result.references.filter((ref) => this.shouldKeepReference(editCodeStep, ref, toolReferences, chatVariables)),
		};
	}

	private sendPromptRenderTelemetry(duration: number) {
		/* __GDPR__
			"editCodeIntent.promptRender" : {
				"owner": "roblourens",
				"comment": "Understanding the performance of the edit code intent rendering",
				"promptRenderDurationIncludingRunningTools": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Duration of the prompt rendering, includes running tools" },
				"isAgentMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the prompt was for agent mode" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('editCodeIntent.promptRender', {
		}, {
			promptRenderDurationIncludingRunningTools: duration,
			isAgentMode: this.intent.id === Intent.Agent ? 1 : 0,
		});
	}

	protected async _getCodebaseReferences(
		promptContext: IBuildPromptContext,
		token: vscode.CancellationToken,
	) {
		const codebaseTools = this.stableToolReferences.filter(t => t.name === ToolName.Codebase);
		if (!codebaseTools.length) {
			return;
		}

		const history = promptContext.history;
		const endpoint = await this.endpointProvider.getChatEndpoint(this.request);

		const { references, metadatas } = await renderPromptElement(this.instantiationService, endpoint, ChatToolReferences, { promptContext: { requestId: promptContext.requestId, query: this.request.prompt, chatVariables: promptContext.chatVariables, history, toolCallResults: promptContext.toolCallResults, tools: { toolReferences: codebaseTools, toolInvocationToken: this.request.toolInvocationToken, availableTools: promptContext.tools?.availableTools ?? [] } }, embeddedInsideUserMessage: false }, undefined, token);
		return { toolCallResults: getToolCallResults(metadatas), references, metadatas };
	}

	private shouldKeepReference(editCodeStep: EditCodeStep, ref: PromptReference, toolReferences: vscode.ChatPromptReference[], chatVariables: ChatVariablesCollection): boolean {
		if (ref.options?.status && ref.options?.status?.kind !== ChatResponseReferencePartStatusKind.Complete) {
			// Always show references for files which have warnings
			return true;
		}
		const uri = getUriOfReference(ref);
		if (!uri) {
			// This reference doesn't have an URI
			return true;
		}
		if (toolReferences.find(entry => (URI.isUri(entry.value) && isEqual(entry.value, uri) || (isLocation(entry.value) && isEqual(entry.value.uri, uri))))) {
			// If this reference came in via resolving #codebase, we should show it
			// TODO@joyceerhl if this reference is subsequently modified and joins the working set, should we suppress it again in the UI?
			return true;
		}
		const PROMPT_INSTRUCTION_ROOT_PREFIX = `${InstructionFileIdPrefix}.root`;
		const promptInstruction = chatVariables.find((variable) => isInstructionFile(variable) && URI.isUri(variable.value) && isEqual(variable.value, uri));
		if (promptInstruction) {
			// Report references for root prompt instruction files and not their children
			return promptInstruction.reference.id.startsWith(PROMPT_INSTRUCTION_ROOT_PREFIX);
		}
		const workingSetEntry = editCodeStep.workingSet.find(entry => isEqual(entry.document.uri, uri));
		if (!workingSetEntry) {
			// This reference wasn't part of the working set
			return true;
		}
		return false;
	}

	private async shouldConfirmBeforeFileEdits(uri: URI) {
		for (const tool of this.request.toolReferences) {
			const ownTool = this.toolsService.getCopilotTool(tool.name as ToolName);
			if (!ownTool) {
				continue;
			}

			const filter = await ownTool.filterEdits?.(uri);
			if (filter) {
				return filter;
			}
		}

		return undefined;
	}

	async processResponse?(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult> {
		assertType(this._editCodeStep);

		const codeMapperWork: Promise<IMapCodeResult | undefined>[] = [];

		const allReceivedMarkdown: string[] = [];

		const textStream = (
			AsyncIterableObject
				.map(inputStream, part => {
					reportCitations(part.delta, outputStream);
					return part.delta.text;
				})
				.map(piece => {
					allReceivedMarkdown.push(piece);
					return piece;
				})
		);
		const remoteName = this.envService.remoteName;
		const createUriFromResponsePath = this._createUriFromResponsePath.bind(this);
		if (this.intentOptions.processCodeblocks) {
			for await (const codeBlock of getCodeBlocksFromResponse(textStream, outputStream, createUriFromResponsePath, remoteName)) {

				if (token.isCancellationRequested) {
					break;
				}

				const isShellScript = codeBlock.language === 'sh';
				if (isCodeBlockWithResource(codeBlock)) {
					this._editCodeStep.telemetryInfo.codeblockUris.add(codeBlock.resource);
					this._editCodeStep.telemetryInfo.codeblockWithUriCount += 1;
					if (isShellScript) {
						this._editCodeStep.telemetryInfo.shellCodeblockWithUriCount += 1;
					}

					// The model proposed an edit for this URI
					this._editCodeStep.setWorkingSetEntryState(codeBlock.resource, WorkingSetEntryState.Undecided);

					if (codeBlock.code.includes(EXISTING_CODE_MARKER)) {
						this._editCodeStep.telemetryInfo.codeblockWithElidedCodeCount += 1;
						if (isShellScript) {
							this._editCodeStep.telemetryInfo.shellCodeblockWithElidedCodeCount += 1;
						}
					}
					const request: MappedEditsRequest = {
						workingSet: [...this._editCodeStep.workingSet],
						codeBlock
					};

					const confirmEdits = await this.shouldConfirmBeforeFileEdits(codeBlock.resource);
					if (confirmEdits) {
						outputStream.confirmation(confirmEdits.title, confirmEdits.message, makeEditsConfirmation(context.turn.id, request));
						continue;
					}
					const isNotebookDocument = this.notebookService.hasSupportedNotebooks(codeBlock.resource);
					if (isNotebookDocument) {
						outputStream.notebookEdit(codeBlock.resource, []);
					} else {
						outputStream.textEdit(codeBlock.resource, []); // signal start
					}
					const task = this.codeMapperService.mapCode(request, outputStream, {
						chatRequestId: context.turn.id,
						chatRequestModel: this.endpoint.model,
						chatSessionId: context.chatSessionId,
						chatRequestSource: `${this.intent.id}_${ChatLocation.toString(this.location)}`,
					}, token).finally(() => {
						if (!token.isCancellationRequested) {
							// signal being done with this uri
							if (isNotebookDocument) {
								outputStream.notebookEdit(codeBlock.resource, true);
								sendEditNotebookTelemetry(this.telemetryService, undefined, 'editCodeIntent', codeBlock.resource, this.request.id, undefined, this.endpoint);
							} else {
								outputStream.textEdit(codeBlock.resource, true);
							}
						}
					});
					codeMapperWork.push(task);
				} else {
					this._editCodeStep.telemetryInfo.codeblockCount += 1;
					if (isShellScript) {
						this._editCodeStep.telemetryInfo.shellCodeblockCount += 1;
					}
				}
			}
		} else {
			for await (const part of textStream) {
				if (token.isCancellationRequested) {
					break;
				}

				outputStream.markdown(part);
			}
		}

		const results = await Promise.all(codeMapperWork);
		for (const result of results) {
			if (!result) {
				context.addAnnotations([{ severity: 'error', label: 'cancelled', message: 'CodeMapper cancelled' }]);
			} else if (result.annotations) {
				context.addAnnotations(result.annotations);
			}
		}
		for (const result of results) {
			if (result && result.errorDetails) {
				return {
					errorDetails: result.errorDetails
				};
			}
		}

		const response = allReceivedMarkdown.join('');
		this._editCodeStep.setAssistantReply(response);
		this.editLogService.logEditChatRequest(context.turn.id, context.messages, response);

		const historyEditCodeStep = PreviousEditCodeStep.fromEditCodeStep(this._editCodeStep);
		context.turn.setMetadata(new EditCodeStepTurnMetaData(historyEditCodeStep));
		return {
			metadata: historyEditCodeStep.toChatResultMetaData(),
		};
	}

	private _createUriFromResponsePath(path: string): URI | undefined {
		assertType(this._editCodeStep);

		// ok to modify entries from the working set
		for (const entry of this._editCodeStep.workingSet) {
			if (this.promptPathRepresentationService.getFilePath(entry.document.uri) === path) {
				return entry.document.uri;
			}
		}

		const uri = this.promptPathRepresentationService.resolveFilePath(path, this._editCodeStep.getPredominantScheme());
		if (!uri) {
			return undefined;
		}

		// ok to make changes in the workspace
		if (this.workspaceService.getWorkspaceFolder(uri)) {
			return uri;
		}
		if (uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote) {
			// do not directly modify files outside the workspace. Create an untitled file instead, let the user save when ok
			return URI.from({ scheme: Schemas.untitled, path: uri.path });
		}
		return uri;
	}
}


const fileHeadingLineStart = '### ';

export function getCodeBlocksFromResponse(textStream: AsyncIterable<string>, outputStream: vscode.ChatResponseStream, createUriFromResponsePath: (p: string) => URI | undefined, remoteName: string | undefined): AsyncIterable<CodeBlock> {

	return new AsyncIterableObject<CodeBlock>(async (emitter) => {

		let currentCodeBlock: CodeBlockInfo | undefined = undefined;
		const codeblockProcessor = new CodeBlockProcessor(
			path => {
				return createUriFromResponsePath(path);
			},
			(markdown: MarkdownString, codeBlockInfo: CodeBlockInfo | undefined, vulnerabilities: vscode.ChatVulnerability[] | undefined) => {
				if (vulnerabilities) {
					outputStream.markdownWithVulnerabilities(markdown, vulnerabilities);
				} else {
					outputStream.markdown(markdown);
				}
				if (codeBlockInfo && codeBlockInfo.resource && codeBlockInfo !== currentCodeBlock) {
					// first time we see this code block
					currentCodeBlock = codeBlockInfo;
					outputStream.codeblockUri(codeBlockInfo.resource, true);
				}
			},
			codeBlock => {
				emitter.emitOne(codeBlock);
			},
			{
				matchesLineStart(linePart, inCodeBlock) {
					return !inCodeBlock && linePart.startsWith(fileHeadingLineStart.substring(0, linePart.length));
				},
				process(line, inCodeBlock) {
					const header = line.value.substring(fileHeadingLineStart.length).trim(); // remove the ### and trim
					let fileUri = createUriFromResponsePath(header);
					if (fileUri) {
						if (remoteName) {
							fileUri = URI.from({ scheme: Schemas.vscodeRemote, authority: remoteName, path: fileUri.path });
						}
						const headerLine = `### [${basename(fileUri)}](${fileUri.toString()})\n`;
						return new MarkdownString(headerLine);
					} else {
						// likely not a file path, just keep the original line
						return line;
					}
				},
			}

		);

		for await (const text of textStream) {
			codeblockProcessor.processMarkdown(text);
		}
		codeblockProcessor.flush();
	});
}

function getUriOfReference(ref: PromptReference): vscode.Uri | undefined {
	if ('variableName' in ref.anchor) {
		return _extractUri(ref.anchor.value);
	}
	return _extractUri(ref.anchor);
}

function _extractUri(something: vscode.Uri | vscode.Location | undefined): vscode.Uri | undefined {
	if (isLocation(something)) {
		return something.uri;
	}
	return something;
}

export function toNewChatReferences(chatVariables: ChatVariablesCollection, promptReferences: PromptReference[]): vscode.ChatPromptReference[] {
	const toolReferences: vscode.ChatPromptReference[] = [];
	const seen = new ResourceSet();

	for (const reference of promptReferences) {
		if (isLocation(reference.anchor)) {
			const uri = reference.anchor.uri;
			if (seen.has(uri) || chatVariables.find((v) => URI.isUri(v.value) && isEqual(v.value, uri))) {
				continue;
			}
			seen.add(uri);
			toolReferences.push({ id: uri.toString(), name: uri.toString(), value: reference.anchor });
		} else if (isUriComponents(reference.anchor) || URI.isUri(reference.anchor)) {
			const uri = URI.revive(reference.anchor);
			if (seen.has(uri) || chatVariables.find((v) => URI.isUri(v.value) && isEqual(v.value, uri))) {
				continue;
			}
			seen.add(uri);
			toolReferences.push({ id: uri.toString(), name: uri.toString(), value: uri });
		}
	}

	return toolReferences;
}

function getToolCallResults(metadatas: MetadataMap) {
	const toolCallResults: Record<string, vscode.LanguageModelToolResult2> = {};
	for (const metadata of metadatas.getAll(ToolResultMetadata)) {
		toolCallResults[metadata.toolCallId] = metadata.result;
	}

	return toolCallResults;
}

export function mergeMetadata(m1: MetadataMap, m2: MetadataMap): MetadataMap {
	return {
		get: key => m1.get(key) ?? m2.get(key),
		getAll: key => m1.getAll(key).concat(m2.getAll(key)),
	};
}

function isDirectorySemanticSearch(toolCall: vscode.ChatLanguageModelToolReference) {
	if (toolCall.name !== ToolName.Codebase) {
		return false;
	}

	const input = (toolCall as any).input;
	if (!input) {
		return false;
	}

	const scopedDirectories = input.scopedDirectories;
	if (!Array.isArray(scopedDirectories)) {
		return false;
	}

	return scopedDirectories.length > 0;
}
