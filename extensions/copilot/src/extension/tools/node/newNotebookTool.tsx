/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { extractNotebookOutline, INotebookOutline } from '../../../util/common/notebooks';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation, ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElement, renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ChatToolReferences, ChatVariablesAndQuery } from '../../prompts/node/panel/chatVariables';
import { CustomInstructions } from '../../prompts/node/panel/customInstructions';
import { NewFilesLocationHint } from '../../prompts/node/panel/editCodePrompt';
import { NewNotebookCodeGenerationPromptState, NewNotebookPlanningPrompt } from '../../prompts/node/panel/newNotebook';
import { NotebookXmlFormatPrompt } from '../../prompts/node/panel/notebookEditCodePrompt';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export class NewNotebookTool implements ICopilotTool<IBuildPromptContext> {
	// Make sure this matches the name in the ToolName enum and package.json
	public static readonly toolName = ToolName.CreateNewJupyterNotebook;

	private _input: IBuildPromptContext | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IBuildPromptContext>, token: CancellationToken): Promise<LanguageModelToolResult> {
		if (!this._input?.stream) {
			this.sendTelemetry('noStream', options);
			throw new Error('No output stream found');
		}

		const disposables = new DisposableStore();
		let failed = false;
		let outcome: 'failedToCreatePlanningEndpoint' | 'failedToRenderPlanningPrompt' | 'failedToMakePlanningRequest' | 'failedToRenderNewNotebookPrompt' = 'failedToCreatePlanningEndpoint';
		try {
			// Get the endpoint
			const planningEndpoint = await this.endpointProvider.getChatEndpoint(options.model || 'copilot-base');
			const originalCreateNotebookQuery = `Create notebook: ${this._input?.query ?? options.input.query}`;
			const mockContext: IBuildPromptContext = {
				query: originalCreateNotebookQuery,
				history: this._input?.history ?? options.input.history,
				chatVariables: this._input?.chatVariables ?? new ChatVariablesCollection([]),
			};

			this._input?.stream?.progress(l10n.t("Planning ..."));

			// planning outline stage
			outcome = 'failedToRenderPlanningPrompt';
			const { messages: planningMessages } = await renderPromptElement(
				this.instantiationService,
				planningEndpoint,
				NewNotebookPlanningPrompt,
				{
					promptContext: mockContext,
					endpoint: planningEndpoint
				}
			);
			outcome = 'failedToMakePlanningRequest';
			const planningResponse = await planningEndpoint.makeChatRequest2({
				debugName: 'notebookPlanning',
				messages: planningMessages,
				finishedCb: undefined,
				location: ChatLocation.Panel,
				enableRetryOnFilter: true
			}, token);
			if (planningResponse.type !== ChatFetchResponseType.Success) {
				this.sendTelemetry('planningFailed', options);
				return new LanguageModelToolResult([
					new LanguageModelTextPart('Planning stage did not return a success code.')
				]);
			}

			// parse outline, pass to newnotebook command
			const outline = extractNotebookOutline(planningResponse.value);
			if (!outline) {
				this.sendTelemetry('noOutline', options);
				return new LanguageModelToolResult([
					new LanguageModelTextPart('Outline was not found in planning stage response.')
				]);
			}

			// Return message to Model asking it to create the notebook using existing tools.
			outcome = 'failedToRenderNewNotebookPrompt';
			return new ExtendedLanguageModelToolResult([
				new LanguageModelPromptTsxPart(
					await renderPromptElementJSON(
						this.instantiationService,
						NewNotebookToolPromptContent,
						{
							outline: outline,
							promptContext: mockContext,
							originalCreateNotebookQuery,
							availableTools: this._input.tools?.availableTools,
						},
						// If we are not called with tokenization options, have _some_ fake tokenizer
						// otherwise we end up returning the entire document
						options.tokenizationOptions ?? {
							tokenBudget: 1000,
							countTokens: (t) => Promise.resolve(t.length * 3 / 4)
						},
						token,
					),
				)
			]);

		} catch (error) {
			failed = true;
			this.sendTelemetry(outcome, options);
			throw error;
		} finally {
			if (!failed) {
				this.sendTelemetry('success', options);
			}
			disposables.dispose();
		}
	}

	async resolveInput(input: IBuildPromptContext, promptContext: IBuildPromptContext, mode: CopilotToolMode): Promise<IBuildPromptContext> {
		this._input = promptContext;

		return input;
	}
	async sendTelemetry(outcome: 'noStream' | 'failedToCreatePlanningEndpoint' | 'failedToRenderPlanningPrompt' | 'failedToMakePlanningRequest' | 'failedToRenderNewNotebookPrompt' | 'planningFailed' | 'noOutline' | 'unknownError' | 'success', options: vscode.LanguageModelToolInvocationOptions<IBuildPromptContext>) {
		const model = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;

		/* __GDPR__
			"newNotebookTool.outcome" : {
				"owner": "donjayamanne",
				"comment": "Tracks the outcome of new notebook tool",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool call." },
				"isNotebook": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the document is a notebook (this measure is used to identify notebook related telemetry)." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model used for the request." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('newNotebookTool.outcome',
			{ requestId: options.chatRequestId, outcome, model }, { isNotebook: 1 }
		);
	}

}


export interface NewNotebookToolPromptProps extends BasePromptElementProps {
	outline: INotebookOutline;
	promptContext: IBuildPromptContext;
	originalCreateNotebookQuery: string;
	availableTools?: readonly vscode.LanguageModelToolInformation[];
}

export class NewNotebookToolPrompt extends PromptElement<NewNotebookToolPromptProps, NewNotebookCodeGenerationPromptState> {
	override render(state: NewNotebookCodeGenerationPromptState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return (
			<>
				<UserMessage>
					<NewNotebookToolPromptContent
						outline={this.props.outline}
						promptContext={this.props.promptContext}
						originalCreateNotebookQuery={this.props.originalCreateNotebookQuery}
						availableTools={this.props.availableTools}
					/>
				</UserMessage>
			</>
		);
	}
}

export class NewNotebookToolPromptContent extends PromptElement<NewNotebookToolPromptProps, NewNotebookCodeGenerationPromptState> {
	override render(state: NewNotebookCodeGenerationPromptState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const hasEditNotebookTool = this.props.availableTools?.some(t => t.name === ToolName.EditNotebook);
		const hasEditTools = this.props.availableTools?.some(t => t.name === ToolName.EditFile) && hasEditNotebookTool;
		const hasCreateTool = !hasEditTools && this.props.availableTools?.some(t => t.name === ToolName.CreateFile) && hasEditNotebookTool;
		return (
			<>
				<NotebookXmlFormatPrompt tsExampleFilePath={'/Users/someone/proj01/example.ipynb'} />
				<NewFilesLocationHint />
				<CustomInstructions flexGrow={6} priority={750} languageId={undefined} chatVariables={this.props.promptContext.chatVariables} />
				<ChatToolReferences flexGrow={4} priority={898} promptContext={this.props.promptContext} />
				<ChatVariablesAndQuery flexGrow={3} priority={898} chatVariables={this.props.promptContext.chatVariables} query={this.props.originalCreateNotebookQuery} />
				{hasEditTools && <>Use the `{`${ToolName.EditFile}`}` tool to first create an empty notebook file with the file path,<br />
					And then use the `{`${ToolName.EditNotebook}`}` tool to generate the notebook of the notebook by editing the empty notebook.<br /></>}
				{hasCreateTool && <>Use the `{`${ToolName.CreateFile}`}` tool to first create an empty notebook file with the file path,<br />
					And then use the `{`${ToolName.EditNotebook}`}` tool to generate the notebook of the notebook by editing the empty notebook.<br /></>}
				You must follow the new file location hint when generating the notebook.<br />

				You MUST use the following outline when generating the notebook:<br />
				Outline Description: {this.props.outline.description}<br />
				{this.props.outline.sections.map((section, i) => (
					<>
						&nbsp;{i + 1}. Section: {section.title}<br />
						&nbsp;Content {section.content}<br />
					</>
				))}
			</>
		);
	}
}


// Register the tool
ToolRegistry.registerTool(NewNotebookTool);
