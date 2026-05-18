/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { getCellId } from '../../../platform/notebook/common/helpers';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ICommandService } from '../../commands/node/commandService';
import { Intent } from '../../common/constants';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext, InternalToolReference } from '../../prompt/common/intents';
import { getRequestedToolCallIterationLimit } from '../../prompt/common/specialRequestTypes';
import { IDefaultIntentRequestHandlerOptions } from '../../prompt/node/defaultIntentRequestHandler';
import { IBuildPromptResult, IIntent } from '../../prompt/node/intents';
import { ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';
import { NotebookInlinePrompt } from '../../prompts/node/panel/notebookInlinePrompt';
import { getToolName, ToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { getAgentMaxRequests } from '../common/agentConfig';
import { EditCodeIntent, EditCodeIntentOptions } from './editCodeIntent';
import { EditCode2IntentInvocation } from './editCodeIntent2';

const getTools = (instaService: IInstantiationService, request: vscode.ChatRequest): Promise<vscode.LanguageModelToolInformation[]> =>
	instaService.invokeFunction(async accessor => {
		const toolsService = accessor.get<IToolsService>(IToolsService);
		const endpointProvider = accessor.get<IEndpointProvider>(IEndpointProvider);
		const model = await endpointProvider.getChatEndpoint(request);
		const lookForTools = new Set<string>([ToolName.EditFile]);

		lookForTools.add(ToolName.EditNotebook);
		lookForTools.add(ToolName.GetNotebookSummary);
		lookForTools.add(ToolName.RunNotebookCell);
		lookForTools.add(ToolName.ReadCellOutput);

		return toolsService.getEnabledTools(request, model, tool => lookForTools.has(tool.name) || tool.tags.includes('notebooks'));
	});

export class NotebookEditorIntent extends EditCodeIntent {

	static override readonly ID = Intent.notebookEditor;

	override readonly id = NotebookEditorIntent.ID;

	override readonly locations = [ChatLocation.Notebook];

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@ICodeMapperService codeMapperService: ICodeMapperService,
		@IWorkspaceService workspaceService: IWorkspaceService,
	) {
		super(instantiationService, endpointProvider, configurationService, expService, codeMapperService, workspaceService, { processCodeblocks: false, intentInvocation: NotebookEditorIntentInvocation });
	}

	protected override getIntentHandlerOptions(request: vscode.ChatRequest): IDefaultIntentRequestHandlerOptions | undefined {
		return {
			maxToolCallIterations: getRequestedToolCallIterationLimit(request) ?? this.instantiationService.invokeFunction(getAgentMaxRequests),
			temperature: this.configurationService.getConfig(ConfigKey.Advanced.AgentTemperature) ?? 0,
			overrideRequestLocation: ChatLocation.Notebook,
		};
	}
}

export class NotebookEditorIntentInvocation extends EditCode2IntentInvocation {

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		request: vscode.ChatRequest,
		intentOptions: EditCodeIntentOptions,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContentService: IAlternativeNotebookContentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeMapperService codeMapperService: ICodeMapperService,
		@IEnvService envService: IEnvService,
		@IPromptPathRepresentationService promptPathRepresentationService: IPromptPathRepresentationService,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IToolsService toolsService: IToolsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditLogService editLogService: IEditLogService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotebookService notebookService: INotebookService,
		@ILogService logService: ILogService,
		@IExperimentationService expService: IExperimentationService,
		@IAutomodeService automodeService: IAutomodeService,
		@IOTelService otelService: IOTelService,
		@ISessionTranscriptService sessionTranscriptService: ISessionTranscriptService,
	) {
		super(intent, location, endpoint, request, intentOptions, instantiationService, codeMapperService, envService, promptPathRepresentationService, endpointProvider, workspaceService, toolsService, configurationService, editLogService, commandService, telemetryService, notebookService, logService, expService, automodeService, otelService, sessionTranscriptService);
	}

	protected override prompt = NotebookInlinePrompt;

	public override async getAvailableTools(): Promise<vscode.LanguageModelToolInformation[]> {
		return getTools(this.instantiationService, this.request);
	}

	public override buildPrompt(promptContext: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>, token: vscode.CancellationToken): Promise<IBuildPromptResult> {
		const variables = this.createReferencesForActiveEditor() ?? promptContext.chatVariables;

		const { query, commandToolReferences } = this.processSlashCommand(promptContext.query);

		return super.buildPrompt({
			...promptContext,
			chatVariables: variables,
			query,
			tools: promptContext.tools && {
				...promptContext.tools,
				toolReferences: this.stableToolReferences.filter((r) => r.name !== ToolName.Codebase).concat(commandToolReferences),
			},
		}, progress, token);
	}

	private createReferencesForActiveEditor(): ChatVariablesCollection | undefined {

		const editor = this.tabsAndEditorsService.activeNotebookEditor;

		if (editor) {
			const cell = editor.notebook.cellAt(editor.selection.start);
			const format = this.alternativeNotebookContentService.getFormat(this.endpoint);
			const altDocument = this.alternativeNotebookContentService.create(format).getAlternativeDocument(editor.notebook);

			const textEditor = this.tabsAndEditorsService.activeTextEditor;

			let selectedText = '';

			if (textEditor) {
				const cellText = textEditor.document.getText();
				const lines = cellText.split('\n');
				const startLine = Math.max(0, textEditor.selection.start.line - 1);
				const endLine = Math.min(lines.length - 1, textEditor.selection.end.line + 1);
				selectedText = lines.slice(startLine, endLine + 1).join('\n');
			}

			const refsForActiveEditor: vscode.ChatPromptReference[] = [
				{
					id: editor.notebook.uri.toString(),
					name: 'Active notebook editor: ' + editor.notebook.uri.toString(),
					value: altDocument.getText()
				}
			];

			// Add selected text as a separate reference if we have any
			if (selectedText.trim()) {
				const cellID = getCellId(cell);
				refsForActiveEditor.push({
					id: `${editor.notebook.uri.toString()}#selection`,
					name: `Selected text in cell ${cellID} active notebook editor`,
					value: selectedText
				});
			}

			return new ChatVariablesCollection([...this.request.references, ...refsForActiveEditor]);
		}
	}

	private processSlashCommand(query: string): { query: string; commandToolReferences: InternalToolReference[] } {
		const commandToolReferences: InternalToolReference[] = [];
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

		return { query, commandToolReferences };
	}
}
