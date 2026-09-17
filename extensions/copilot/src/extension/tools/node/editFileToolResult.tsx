/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { modelNeedsStrongReplaceStringHint } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ISimulationTestContext } from '../../../platform/simulationTestContext/common/simulationTestContext';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../util/common/languages';
import { timeout } from '../../../util/vs/base/common/async';
import { URI } from '../../../util/vs/base/common/uri';
import { Diagnostic, DiagnosticSeverity } from '../../../vscodeTypes';
import { Tag } from '../../prompts/node/base/tag';
import { ToolName } from '../common/toolNames';
import { DiagnosticToolOutput } from './getErrorsTool';

export interface IEditedFile {
	operation: 'add' | 'delete' | 'update';
	existingDiagnostics?: Diagnostic[];
	uri: URI;
	isNotebook: boolean;
	error?: string;
	healed?: string;
}

export interface IEditFileResultProps extends BasePromptElementProps {
	files: IEditedFile[];
	diagnosticsTimeout?: number;
	toolName?: ToolName;
	requestId?: string;
	model?: vscode.LanguageModelChat;
}

export class EditFileResult extends PromptElement<IEditFileResultProps> {
	constructor(
		props: PromptElementProps<IEditFileResultProps>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageDiagnosticsService private readonly languageDiagnosticsService: ILanguageDiagnosticsService,
		@ISimulationTestContext private readonly testContext: ISimulationTestContext,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IWorkspaceService protected readonly workspaceService: IWorkspaceService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		const successfullyEditedFiles: string[] = [];
		const editingErrors: string[] = [];
		const editsWithDiagnostics: { file: string; diagnostics: PromptElement }[] = [];
		const healedEdits: { file: string; healing: string }[] = [];
		let totalNewDiagnostics = 0;
		let filesWithNewDiagnostics = 0;
		let notebookEditFailures = 0;
		for (const file of this.props.files) {
			if (file.error) {
				editingErrors.push(file.error);
				if (file.isNotebook) {
					notebookEditFailures++;
				}
				continue;
			}

			const filePath = this.promptPathRepresentationService.getFilePath(file.uri);
			if (file.healed) {
				healedEdits.push({ file: filePath, healing: file.healed });
			}

			const diagnostics = (this.props.diagnosticsTimeout === undefined || this.props.diagnosticsTimeout >= 0)
				&& !this.testContext.isInSimulationTests
				&& this.configurationService.getExperimentBasedConfig(ConfigKey.AutoFixDiagnostics, this.experimentationService)
				&& !file.isNotebook
				? await this.getNewDiagnostics(file)
				: [];

			if (diagnostics.length && !file.isNotebook) {
				totalNewDiagnostics += diagnostics.length;
				filesWithNewDiagnostics++;
				const newSnapshot = await this.workspaceService.openTextDocumentAndSnapshot(file.uri);
				editsWithDiagnostics.push({
					file: filePath,
					diagnostics: <DiagnosticToolOutput
						diagnosticsGroups={[{
							context: { document: newSnapshot, language: getLanguage(newSnapshot) },
							diagnostics,
							uri: file.uri,
						}]}
						maxDiagnostics={20}
					/>
				});
				continue;
			}

			successfullyEditedFiles.push(filePath);
		}

		if (this.props.toolName && this.props.requestId) {
			await this.sendEditFileResultTelemetry(totalNewDiagnostics, filesWithNewDiagnostics);
		}

		let retryMessage = <>You may use the {ToolName.EditFile} tool to retry these edits.</>;
		if (!notebookEditFailures) {
			// No notebook files failed to edit
		} else if (notebookEditFailures === editingErrors.length) {
			// All notebook files failed to edit
			retryMessage = <>You may use the {ToolName.EditNotebook} tool to retry editing the Notebook files.</>;
		} else if (notebookEditFailures && notebookEditFailures !== editingErrors.length) {
			retryMessage = <>
				You may use the {ToolName.EditFile} tool to retry these edits except for Notebooks.<br />
				You may use the {ToolName.EditNotebook} tool to retry editing the Notebook files.
			</>;
		}
		return (
			<>
				{!!healedEdits.length && <>There was an error applying your original patch, and it was corrected:<br />{healedEdits.map(h =>
					<Tag name='correctedEdit' attrs={{ file: h.file }}>
						{h.healing}
					</Tag>
				)}<br /></>}
				{successfullyEditedFiles.length > 0 &&
					<>The following files were successfully edited:<br />
						{successfullyEditedFiles.join('\n')}<br /></>}
				{editingErrors.length > 0 && <>
					{editingErrors.join('\n')}
					{this.props.model && modelNeedsStrongReplaceStringHint(this.props.model) && <><br /><br />{retryMessage}</>}
				</>}
				{editsWithDiagnostics.length > 0 &&
					editsWithDiagnostics.map(edit => {
						return <>
							The edit to {edit.file} was applied successfully.<br />
							The edit resulted in the following lint errors:<br />
							{edit.diagnostics}
						</>;
					})}
			</>
		);
	}

	private async getNewDiagnostics(editedFile: IEditedFile): Promise<Diagnostic[]> {
		await timeout(this.props.diagnosticsTimeout ?? 1000);

		const existingDiagnostics = editedFile.existingDiagnostics || [];
		const newDiagnostics: Diagnostic[] = [];

		for (const diagnostic of this.languageDiagnosticsService.getDiagnostics(editedFile.uri)) {
			if (diagnostic.severity !== DiagnosticSeverity.Error && diagnostic.severity !== DiagnosticSeverity.Warning) {
				continue;
			}

			// Won't help if edit caused lines to move around, but better than nothing
			const isDuplicate = existingDiagnostics.some(existing =>
				existing.message === diagnostic.message &&
				existing.range.start.line === diagnostic.range.start.line &&
				existing.range.start.character === diagnostic.range.start.character &&
				existing.range.end.line === diagnostic.range.end.line &&
				existing.range.end.character === diagnostic.range.end.character
			);

			if (!isDuplicate) {
				newDiagnostics.push(diagnostic);
			}
		}

		return newDiagnostics;
	}

	private async sendEditFileResultTelemetry(totalNewDiagnostics: number, filesWithNewDiagnostics: number) {
		const model = this.props.model && (await this.endpointProvider.getChatEndpoint(this.props.model)).model;

		/* __GDPR__
			"editFileResult.diagnostics" : {
				"owner": "roblourens",
				"comment": "Tracks whether new diagnostics were found after editing files",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"toolName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the tool that performed the edit" },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
				"totalNewDiagnostics": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of new diagnostics found across all files" },
				"filesWithNewDiagnostics": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of files that had new diagnostics" },
				"totalFilesEdited": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files that were edited" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('editFileResult.diagnostics',
			{
				requestId: this.props.requestId!,
				toolName: this.props.toolName!,
				model,
			},
			{
				totalNewDiagnostics,
				filesWithNewDiagnostics,
				totalFilesEdited: this.props.files.length
			}
		);
	}
}
