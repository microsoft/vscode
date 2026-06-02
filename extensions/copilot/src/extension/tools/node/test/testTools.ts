/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { packageJson } from '../../../../platform/env/common/packagejson';
import { ILanguageDiagnosticsService } from '../../../../platform/languages/common/languageDiagnosticsService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { renderPromptElementJSON } from '../../../prompts/node/base/promptRenderer';
import { ICodeMapperService } from '../../../prompts/node/codeMapper/codeMapperService';
import { IEditToolLearningService } from '../../common/editToolLearningService';
import { ContributedToolName, mapContributedToolNamesInSchema, mapContributedToolNamesInString, ToolName } from '../../common/toolNames';
import { IToolsService } from '../../common/toolsService';
import { ActionType } from '../applyPatch/parser';
import { EditFileResult } from '../editFileToolResult';
import { EditFileTool } from '../insertEditTool';

interface IEditToolParams {
	filePath: string;
	explanation: string;
	code: string;
}

/**
 * An implementation of the EditFile tool for simulation tests
 */
export class TestEditFileTool extends EditFileTool {
	readonly info: vscode.LanguageModelToolInformation;

	constructor(
		private readonly stream: vscode.ChatResponseStream,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService promptPathRepresentationService: IPromptPathRepresentationService,
		@IToolsService toolsService: IToolsService,
		@INotebookService notebookService: INotebookService,
		@ILanguageDiagnosticsService languageDiagnosticsService: ILanguageDiagnosticsService,
		@IAlternativeNotebookContentService alternativeNotebookContentService: IAlternativeNotebookContentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IEditToolLearningService editToolLearningService: IEditToolLearningService,
		@ILogService logService: ILogService,
	) {
		super(promptPathRepresentationService, instantiationService, workspaceService, toolsService, notebookService, languageDiagnosticsService, alternativeNotebookContentService, telemetryService, endpointProvider, editToolLearningService, logService);
		const contributedTool = packageJson.contributes.languageModelTools.find(contributedTool => contributedTool.name === ContributedToolName.EditFile);
		if (!contributedTool) {
			throw new Error(`Tool ${ContributedToolName.EditFile} is not in package.json`);
		}
		this.info = {
			name: ToolName.EditFile,
			tags: contributedTool.tags ?? [],
			description: mapContributedToolNamesInString(contributedTool.modelDescription),
			source: undefined,
			inputSchema: contributedTool.inputSchema && mapContributedToolNamesInSchema(contributedTool.inputSchema),
		};
	}

	override async invoke(options: vscode.LanguageModelToolInvocationOptions<IEditToolParams>, token: vscode.CancellationToken) {
		const parameters: IEditToolParams = options.input;
		const uri = this.promptPathRepresentationService.resolveFilePath(options.input.filePath);
		if (!uri) {
			throw new Error('Invalid file path');
		}

		const mapperResult = await this.codeMapperService.mapCode(
			{
				codeBlock: { code: parameters.code, resource: uri, markdownBeforeBlock: parameters.explanation },
			},
			this.stream, undefined, token);
		if (mapperResult?.errorDetails) {
			throw new Error(mapperResult.errorDetails.message);
		}

		const document = await this.workspaceService.openTextDocumentAndSnapshot(uri);

		// Showing the document is necessary for some extensions to report diagnostics when running in the ext host simulator
		await this.workspaceService.showTextDocument(document.document);

		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(
					this.instantiationService,
					EditFileResult,
					{ files: [{ operation: ActionType.UPDATE, uri, isNotebook: false }], toolName: ToolName.EditFile, requestId: 'test', model: undefined },
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
	}
}
