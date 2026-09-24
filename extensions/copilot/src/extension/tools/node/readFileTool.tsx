/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptReference } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ObjectJsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { ICustomInstructionsService } from '../../../platform/customInstructions/common/customInstructionsService';
import { NotebookDocumentSnapshot } from '../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { getCachedSha256Hash } from '../../../util/common/crypto';
import { clamp } from '../../../util/vs/base/common/numbers';
import { dirname, extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { isHighSurrogate, isLowSurrogate } from '../../../util/vs/base/common/strings';
import { sendSkillContentReadTelemetry } from '../common/skillTelemetry';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult, Location, MarkdownString, Range } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { BinaryFileHexdump, hexdumpIfBinary } from '../../prompts/node/panel/binaryFileHexdump';
import { CodeBlock } from '../../prompts/node/panel/safeElements';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { getImageMimeType } from './imageToolUtils';
import { assertFileNotContentExcluded, isFileExternalAndNeedsConfirmation, resolveToolInputPath } from './toolUtils';
import { IGrepResultService } from './grepResultService';
import { IRegionContextProviderService, type PathInfo, type RegionResult } from '../../../platform/languageContextProvider/common/regionContextProvider';

export const getReadFileV2Description = (orig: vscode.LanguageModelToolInformation): vscode.LanguageModelToolInformation => ({
	name: ToolName.ReadFile,
	description: 'Read the contents of a file. Line numbers are 1-indexed. This tool will truncate its output at 2000 lines and may be called repeatedly with offset and limit parameters to read larger files in chunks. Binary files use offset/limit as byte offsets.',
	tags: ['vscode_codesearch'],
	source: undefined,
	inputSchema: {
		type: 'object',
		required: ['filePath'],
		properties: {
			filePath: {
				description: 'The absolute path of the file to read.',
				type: 'string'
			},
			offset: {
				description: 'Optional: the 1-based line number to start reading from. Only use this if the file is too large to read at once. If not specified, the file will be read from the beginning.',
				type: 'number'
			},
			limit: {
				description: 'Optional: the maximum number of lines to read. Only use this together with `offset` if the file is too large to read at once.',
				type: 'number'
			},
		}
	} satisfies ObjectJsonSchema,
	fullReferenceName: orig.fullReferenceName
});

export interface IReadFileParamsV1 {
	filePath: string;
	startLine: number;
	endLine: number;
}

export interface IReadFileParamsV2 {
	filePath: string;
	offset?: number;
	limit?: number;
}

const MAX_LINES_PER_READ = 2000;
const MAX_LINE_LENGTH = 2000;

export type ReadFileParams = IReadFileParamsV1 | IReadFileParamsV2;

const isParamsV2 = (params: ReadFileParams): params is IReadFileParamsV2 =>
	(params as IReadFileParamsV1).startLine === undefined;

interface IParamRanges {
	start: number;
	end: number;
	truncated: boolean;
}

const getParamRanges = (params: ReadFileParams, snapshot: NotebookDocumentSnapshot | TextDocumentSnapshot): IParamRanges => {
	let start: number;
	let end: number;
	let truncated = false;
	if (isParamsV2(params)) {
		// Check if offset is out of bounds before clamping
		if (params.offset !== undefined && params.offset > snapshot.lineCount) {
			throw new Error(`Invalid offset ${params.offset}: file only has ${snapshot.lineCount} line${snapshot.lineCount === 1 ? '' : 's'}. Line numbers are 1-indexed.`);
		}
		const limit = clamp(params.limit || Infinity, 1, MAX_LINES_PER_READ - 1);
		start = clamp(params.offset ?? 1, 1, snapshot.lineCount);
		end = clamp(start + limit, 1, snapshot.lineCount);
		// signal truncation if we applied a limit to the lines other than what the model requested
		truncated = limit !== params.limit && end < snapshot.lineCount;
	} else {
		start = clamp(params.startLine, 1, snapshot.lineCount);
		end = clamp(params.endLine, 1, snapshot.lineCount);
	}

	if (start > end) {
		[end, start] = [start, end];
	}

	return { start, end, truncated };
};

type EndLineInfo = {
	adjustedEndLine: number;
	startLines: Map<number, { adjustedStartLine: number; adjustedEndLine: number }>;
};

export class ReadFileTool implements ICopilotTool<ReadFileParams> {
	public static toolName = ToolName.ReadFile;
	public static readonly nonDeferred = true;
	private _promptContext: IBuildPromptContext | undefined;
	private readonly adjustedReadRequests = new Map<string, Map<string, Map<number, EndLineInfo>>>();

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@INotebookService private readonly notebookService: INotebookService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
		@IGrepResultService private readonly grepResultService: IGrepResultService,
		@IRegionContextProviderService private readonly regionContextProvider: IRegionContextProviderService
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ReadFileParams>, token: vscode.CancellationToken) {
		let ranges: IParamRanges | undefined;
		let uri: URI | undefined;
		try {
			uri = resolveToolInputPath(options.input.filePath, this.promptPathRepresentationService);

			if (getImageMimeType(uri)) {
				throw new Error(`Cannot read image files with ${ToolName.ReadFile}. Use ${ToolName.ViewImage} instead.`);
			}

			// Handle binary files — read raw bytes and check for null bytes
			const binary = await hexdumpIfBinary(this.fileSystemService, uri);
			if (binary) {
				const input = options.input;
				let startByte: number | undefined;
				let endByte: number | undefined;
				if (isParamsV2(input)) {
					startByte = input.offset;
					if (startByte !== undefined && typeof input.limit === 'number') {
						endByte = startByte + input.limit;
					}
				} else {
					startByte = input.startLine;
					endByte = input.endLine;
				}

				void this.sendReadFileTelemetry('success', options, { start: 0, end: 0, truncated: false }, uri);
				return new LanguageModelToolResult([
					new LanguageModelPromptTsxPart(
						await renderPromptElementJSON(
							this.instantiationService,
							BinaryFileHexdump,
							{ uri, data: binary.data, startByte, endByte },
							options.tokenizationOptions ?? {
								tokenBudget: 600,
								countTokens: t => Promise.resolve(t.length * 3 / 4)
							},
							token,
						),
					)
				]);
			}

			const documentSnapshot = await this.getSnapshot(uri);
			ranges = getParamRanges(options.input, documentSnapshot);
			const languageId = documentSnapshot.languageId;
			const doRealLineAdjustment = this.configurationService.getExperimentBasedConfig(ConfigKey.ReadFileToolAllowLineAdjustments, this.experimentationService);
			if (options.chatSessionResource !== undefined && options.chatRequestId !== undefined && uri.scheme === 'file' && (languageId === 'typescript' || languageId === 'javascript')) {
				const startLine = ranges.start - 1;
				const endLine = ranges.end - 1;
				let adjustmentPending = false;
				try {
					const continuousReadStart = this.isContinuousRead(options.chatSessionResource, uri, startLine);
					if (continuousReadStart !== undefined && continuousReadStart >= 0 && continuousReadStart < startLine) {
						if (doRealLineAdjustment) {
							ranges = {
								start: continuousReadStart + 1,
								end: ranges.end,
								truncated: ranges.truncated,
							};
						}
						this.sendContinuousRegionTelemetry(options, startLine - continuousReadStart, documentSnapshot);
					} else {
						const grepResultMatches = this.grepResultService.getGrepResult(options.chatSessionResource, uri, startLine, endLine);
						if (grepResultMatches !== undefined && grepResultMatches.length > 0 && documentSnapshot.version === documentSnapshot.document.version) {
							if (this.beginReadAdjustment(options.chatSessionResource, uri, startLine, endLine)) {
								adjustmentPending = true;
								const regionResult: RegionResult | undefined = await this.regionContextProvider.getRegions(documentSnapshot.uri, documentSnapshot.languageId, grepResultMatches, { start: startLine, end: endLine });
								const adjustedRange = regionResult?.regions[0]?.range;
								if (regionResult !== undefined && adjustedRange !== undefined && documentSnapshot.version === documentSnapshot.document.version) {
									const pathInfo = regionResult?.paths;
									// For telemetry purpose send the adjusted region information
									this.sendAdjustedRegionTelemetry(options, startLine, endLine, adjustedRange.start, adjustedRange.end, pathInfo, documentSnapshot);
									if (adjustedRange.end >= startLine && adjustedRange.end < endLine) {
										if (doRealLineAdjustment) {
											ranges = {
												start: ranges.start,
												end: adjustedRange.end + 1,
												truncated: ranges.truncated,
											};
										}
										this.completeReadAdjustment(options.chatSessionResource, uri, startLine, endLine, startLine, adjustedRange.end);
										adjustmentPending = false;
									}
								} else {
									if (documentSnapshot.version === documentSnapshot.document.version) {
										this.sendAdjustingFailedTelemetry(options, startLine, endLine, 'noGrepRegions', documentSnapshot);
									} else {
										this.sendAdjustingFailedTelemetry(options, startLine, endLine, 'documentVersionChanged', documentSnapshot);
									}
								}
							} else {
								this.sendAdjustingFailedTelemetry(options, startLine, endLine, 'reReadSameRange', documentSnapshot);
							}
						} else {
							if (documentSnapshot.version === documentSnapshot.document.version) {
								this.sendAdjustingFailedTelemetry(options, startLine, endLine, 'noGrep', documentSnapshot);
								// this.logService.info(`No grep result match found for requestId ${options.chatRequestId}`);
							} else {
								this.sendAdjustingFailedTelemetry(options, startLine, endLine, 'documentVersionChanged', documentSnapshot);
								// this.logService.info(`Document version changed for requestId ${options.chatRequestId}`);
							}
						}
					}
				} catch (err) {
					this.sendAdjustingFailedTelemetry(options, startLine, endLine, 'exception', documentSnapshot);
					// this.logService.error(`Error processing grep result for requestId ${options.chatRequestId}: ${err}`);
				} finally {
					if (adjustmentPending) {
						this.cancelReadAdjustment(options.chatSessionResource, uri, startLine, endLine);
					}
				}
			}

			void this.sendReadFileTelemetry('success', options, ranges, uri, documentSnapshot);
			const useCodeFences = this.configurationService.getExperimentBasedConfig<boolean>(ConfigKey.TeamInternal.ReadFileCodeFences, this.experimentationService);
			return new LanguageModelToolResult([
				new LanguageModelPromptTsxPart(
					await renderPromptElementJSON(
						this.instantiationService,
						ReadFileResult,
						{ uri, startLine: ranges.start, endLine: ranges.end, truncated: ranges.truncated, snapshot: documentSnapshot, languageModel: this._promptContext?.request?.model, useCodeFences },
						// If we are not called with tokenization options, have _some_ fake tokenizer
						// otherwise we end up returning the entire document on every readFile.
						options.tokenizationOptions ?? {
							tokenBudget: 600,
							countTokens: (t) => Promise.resolve(t.length * 3 / 4)
						},
						token,
					),
				)
			]);
		} catch (err) {
			void this.sendReadFileTelemetry('error', options, ranges || { start: 0, end: 0, truncated: false }, uri);
			throw err;
		}
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ReadFileParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation | undefined> {
		const { input } = options;
		if (!input.filePath.length) {
			return;
		}

		let uri: URI | undefined;
		let documentSnapshot: NotebookDocumentSnapshot | TextDocumentSnapshot;
		try {
			uri = resolveToolInputPath(input.filePath, this.promptPathRepresentationService);
			if (getImageMimeType(uri)) {
				throw new Error(`Cannot read image files with ${ToolName.ReadFile}. Use ${ToolName.ViewImage} instead.`);
			}

			await this.instantiationService.invokeFunction(
				accessor => assertFileNotContentExcluded(accessor, uri!)
			);

			// Check if file is external (outside workspace, not open in editor, etc.)
			const { needsConfirmation, realPath } = await this.instantiationService.invokeFunction(
				accessor => isFileExternalAndNeedsConfirmation(accessor, uri!, this._promptContext, { readOnly: true, workingDirectory: options.workingDirectory })
			);
			if (realPath) {
				await this.instantiationService.invokeFunction(
					accessor => assertFileNotContentExcluded(accessor, realPath)
				);
			}

			if (needsConfirmation) {
				const folderUri = dirname(uri);

				const message = realPath
					? this.workspaceService.getWorkspaceFolders().length === 1
						? new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} links to ${formatUriForFileWidget(realPath)}, which is outside the current folder.`)
						: new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} links to ${formatUriForFileWidget(realPath)}, which is outside the current workspace.`)
					: this.workspaceService.getWorkspaceFolders().length === 1
						? new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} is outside of the current folder in ${formatUriForFileWidget(folderUri)}.`)
						: new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} is outside of the current workspace in ${formatUriForFileWidget(folderUri)}.`);

				// Return confirmation request for external file
				// The folder-based "allow this session" option is provided by the core confirmation contribution
				return {
					invocationMessage: new MarkdownString(l10n.t`Reading ${formatUriForFileWidget(uri)}`),
					pastTenseMessage: new MarkdownString(l10n.t`Read ${formatUriForFileWidget(uri)}`),
					confirmationMessages: {
						title: l10n.t`Allow reading external files?`,
						message,
					}
				};
			}

			try {
				documentSnapshot = await this.getSnapshot(uri);
			} catch (e) {
				if (String(e).includes('seems to be binary')) {
					return {
						invocationMessage: new MarkdownString(l10n.t`Reading binary file ${formatUriForFileWidget(uri)}`),
						pastTenseMessage: new MarkdownString(l10n.t`Read binary file ${formatUriForFileWidget(uri)}`),
					};
				}

				throw e;
			}
		} catch (err) {
			void this.sendReadFileTelemetry('invalidFile', options, { start: 0, end: 0, truncated: false }, uri);
			throw err;
		}

		const { start, end } = getParamRanges(input, documentSnapshot);

		// Refresh available extension prompt files only if reading a skill.md file (can be file or virtual URI)
		if (extUriBiasedIgnorePathCase.basename(uri).toLowerCase() === 'skill.md') {
			await this.customInstructionsService.refreshExtensionPromptFiles();
		}

		const skillInfo = this.customInstructionsService.getSkillInfo(uri);

		if (start === 1 && end === documentSnapshot.lineCount) {
			if (skillInfo) {
				const { skillName } = skillInfo;
				if (this.customInstructionsService.isSkillMdFile(uri)) {
					return {
						invocationMessage: new MarkdownString(l10n.t`Reading skill ${formatUriForFileWidget(uri, { vscodeLinkType: 'skill', linkText: skillName })}`),
						pastTenseMessage: new MarkdownString(l10n.t`Read skill ${formatUriForFileWidget(uri, { vscodeLinkType: 'skill', linkText: skillName })}`),
					};
				} else {
					return {
						invocationMessage: new MarkdownString(l10n.t`Reading skill \`${skillName}\`: ${formatUriForFileWidget(uri)}`),
						pastTenseMessage: new MarkdownString(l10n.t`Read skill \`${skillName}\`: ${formatUriForFileWidget(uri)}`),
					};
				}
			}
			return {
				invocationMessage: new MarkdownString(l10n.t`Reading ${formatUriForFileWidget(uri)}`),
				pastTenseMessage: new MarkdownString(l10n.t`Read ${formatUriForFileWidget(uri)}`),
			};
		}

		// Jump to the start of the range, don't select the whole range
		const readLocation = new Location(uri, new Range(start - 1, 0, start - 1, 0));
		if (this.customInstructionsService.isSkillFile(uri)) {
			if (skillInfo) {
				const { skillName } = skillInfo;
				if (this.customInstructionsService.isSkillMdFile(uri)) {
					return {
						invocationMessage: new MarkdownString(l10n.t`Reading skill ${formatUriForFileWidget(readLocation, { vscodeLinkType: 'skill', linkText: skillName })}, lines ${start} to ${end}`),
						pastTenseMessage: new MarkdownString(l10n.t`Read skill ${formatUriForFileWidget(readLocation, { vscodeLinkType: 'skill', linkText: skillName })}, lines ${start} to ${end}`),
					};
				} else {
					return {
						invocationMessage: new MarkdownString(l10n.t`Reading skill \`${skillName}\`: ${formatUriForFileWidget(readLocation)}, lines ${start} to ${end}`),
						pastTenseMessage: new MarkdownString(l10n.t`Read skill \`${skillName}\`: ${formatUriForFileWidget(readLocation)}, lines ${start} to ${end}`),
					};
				}
			}
		}
		return {
			invocationMessage: new MarkdownString(l10n.t`Reading ${formatUriForFileWidget(readLocation)}, lines ${start} to ${end}`),
			pastTenseMessage: new MarkdownString(l10n.t`Read ${formatUriForFileWidget(readLocation)}, lines ${start} to ${end}`),
		};
	}

	public alternativeDefinition(originTool: vscode.LanguageModelToolInformation): vscode.LanguageModelToolInformation {
		if (this.configurationService.getExperimentBasedConfig<boolean>(ConfigKey.TeamInternal.EnableReadFileV2, this.experimentationService)) {
			return getReadFileV2Description(originTool);
		}

		return originTool;
	}

	private async getSnapshot(uri: URI) {
		if (this.notebookService.hasSupportedNotebooks(uri)) {
			return this.workspaceService.openNotebookDocumentAndSnapshot(uri, this.alternativeNotebookContent.getFormat(this._promptContext?.request?.model));
		}

		return TextDocumentSnapshot.create(await this.workspaceService.openTextDocument(uri));
	}

	private beginReadAdjustment(sessionResource: vscode.Uri, uri: URI, startLine: number, endLine: number): boolean {
		const sessionKey = sessionResource.toString();
		let files = this.adjustedReadRequests.get(sessionKey);
		if (files === undefined) {
			files = new Map();
			this.adjustedReadRequests.set(sessionKey, files);
		}

		const filePath = uri.toString();
		let endLines = files.get(filePath);
		if (endLines === undefined) {
			endLines = new Map();
			files.set(filePath, endLines);
		}

		let endLineInfo = endLines.get(endLine);
		if (endLineInfo === undefined) {
			endLineInfo = { adjustedEndLine: endLine, startLines: new Map() };
			endLines.set(endLine, endLineInfo);
		}

		const startLines = endLineInfo.startLines;
		if (startLines.has(startLine)) {
			return false;
		}

		startLines.set(startLine, { adjustedStartLine: startLine, adjustedEndLine: endLine });
		return true;
	}

	private isContinuousRead(sessionResource: vscode.Uri, uri: URI, startLine: number): number | undefined {
		const sessionKey = sessionResource.toString();
		const files = this.adjustedReadRequests.get(sessionKey);
		const filePath = uri.toString();
		const endLines = files?.get(filePath);
		const endLineInfo = endLines?.get(startLine - 1);
		return endLineInfo === undefined ? undefined : endLineInfo.adjustedEndLine + 1;
	}

	private completeReadAdjustment(sessionResource: vscode.Uri, uri: URI, startLine: number, endLine: number, adjustedStartLine: number, adjustedEndLine: number): void {
		const endLineInfo = this.adjustedReadRequests
			.get(sessionResource.toString())
			?.get(uri.toString())
			?.get(endLine);
		if (endLineInfo) {
			endLineInfo.adjustedEndLine = Math.min(endLineInfo.adjustedEndLine, adjustedEndLine);
			endLineInfo.startLines.set(startLine, { adjustedStartLine, adjustedEndLine });
		}
	}

	private cancelReadAdjustment(sessionResource: vscode.Uri, uri: URI, startLine: number, endLine: number): void {
		const sessionKey = sessionResource.toString();
		const files = this.adjustedReadRequests.get(sessionKey);
		const filePath = uri.toString();
		const endLines = files?.get(filePath);
		const endLineInfo = endLines?.get(endLine);
		endLineInfo?.startLines.delete(startLine);
		if (endLineInfo?.startLines.size === 0) {
			endLines?.delete(endLine);
		}
		if (endLines?.size === 0) {
			files?.delete(filePath);
		}
		if (files?.size === 0) {
			this.adjustedReadRequests.delete(sessionKey);
		}
	}

	private async sendReadFileTelemetry(outcome: string, options: Pick<vscode.LanguageModelToolInvocationOptions<ReadFileParams>, 'model' | 'chatRequestId' | 'input'>, { start, end, truncated }: IParamRanges, uri: URI | undefined, documentSnapshot?: TextDocumentSnapshot | NotebookDocumentSnapshot) {
		const model = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;
		const extensionSkillInfo = uri && this.customInstructionsService.getExtensionSkillInfo(uri);
		const skillInfo = extensionSkillInfo || (uri && this.customInstructionsService.getSkillInfo(uri));
		const fileType = skillInfo ? 'skill' : '';
		const nameField = extensionSkillInfo ? extensionSkillInfo.skillName : skillInfo ? getCachedSha256Hash(skillInfo.skillName) : '';
		const languageId = documentSnapshot?.languageId;

		/* __GDPR__
			"readFileToolInvoked" : {
				"owner": "roblourens",
				"comment": "The read_file tool was invoked",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"interactionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current interaction." },
				"toolOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the invocation was successful, or a failure reason" },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
				"linesRead": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of lines that were read" },
				"truncated": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The file length was truncated" },
				"isV2": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool is a v2 version" },
				"isEntireFile": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the entire file was read with v2 params" },
				"fileType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of file being read" },
				"nameField": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the agent customization. Plain text for extension sources, otherwise hashed." },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language ID of the document snapshot" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('readFileToolInvoked',
			{
				requestId: options.chatRequestId,
				interactionId: options.chatRequestId,
				toolOutcome: outcome, // Props named "outcome" often get stuck in the kusto pipeline
				isV2: isParamsV2(options.input) ? 'true' : 'false',
				isEntireFile: isParamsV2(options.input) && options.input.offset === undefined && options.input.limit === undefined ? 'true' : 'false',
				fileType,
				nameField,
				languageId,
				model,
			},
			{
				linesRead: end - start,
				truncated: truncated ? 1 : 0,
			}
		);

		// Send separate skillContentRead event only for successful skill file reads.
		// Reuses extensionSkillInfo/skillInfo already computed above.
		if (skillInfo && documentSnapshot && uri && this.customInstructionsService.isSkillMdFile(uri)) {
			const content = documentSnapshot instanceof TextDocumentSnapshot ? documentSnapshot.getText() : '';
			sendSkillContentReadTelemetry(this.telemetryService, this.customInstructionsService, this.extensionsService, uri, skillInfo, content);
		}
	}

	private async sendAdjustedRegionTelemetry(options: Pick<vscode.LanguageModelToolInvocationOptions<ReadFileParams>, 'model' | 'chatRequestId' | 'input'>, originalStart: number, originalEnd: number, adjustedStart: number, adjustedEnd: number, pathInfo: PathInfo, documentSnapshot: TextDocumentSnapshot | NotebookDocumentSnapshot) {
		const languageId = documentSnapshot.languageId;
		const smallestPath: string = JSON.stringify(pathInfo.smallest);
		const largestPath: string | undefined = pathInfo?.largest ? JSON.stringify(pathInfo.largest) : undefined;

		/* __GDPR__
			"readFileRegionAdjusted" : {
				"owner": "dbaeumer",
				"comment": "Information about the clipping of the requested region to read",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"originalLines": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of original lines of the requested region", "isMeasurement": true },
				"adjustedLines": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of lines after the requested region has been adjusted", "isMeasurement": true },
				"deltaStart": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The difference between the original start line and the adjusted start line", "isMeasurement": true },
				"deltaEnd": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The difference between the original end line and the adjusted end line", "isMeasurement": true },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language ID of the document snapshot" },
				"smallestPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The smallest path in the region context" },
				"largestPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The largest path in the region context" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('readFileRegionAdjusted',
			{
				requestId: options.chatRequestId,
				languageId,
				smallestPath,
				largestPath,
			},
			{
				originalLines: originalEnd - originalStart + 1,
				adjustedLines: adjustedEnd - adjustedStart + 1,
				deltaStart: adjustedStart - originalStart,
				deltaEnd: originalEnd - adjustedEnd,
			}
		);
	}

	private async sendContinuousRegionTelemetry(options: Pick<vscode.LanguageModelToolInvocationOptions<ReadFileParams>, 'model' | 'chatRequestId' | 'input'>, deltaStart: number, documentSnapshot: TextDocumentSnapshot | NotebookDocumentSnapshot) {
		const languageId = documentSnapshot.languageId;

		/* __GDPR__
			"readFileRegionContinuous" : {
				"owner": "dbaeumer",
				"comment": "Information about a continuous read region adjustment",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"deltaStart": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The difference between the original start line and the adjusted start line", "isMeasurement": true },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language ID of the document snapshot" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('readFileRegionContinuous',
			{
				requestId: options.chatRequestId,
				languageId,
			},
			{
				deltaStart: deltaStart,
			}
		);
	}

	private async sendAdjustingFailedTelemetry(options: Pick<vscode.LanguageModelToolInvocationOptions<ReadFileParams>, 'model' | 'chatRequestId' | 'input'>, startLine: number, endLine: number, reason: 'noGrep' | 'noGrepRegions' | 'documentVersionChanged' | 'reReadSameRange' | 'exception', documentSnapshot: TextDocumentSnapshot | NotebookDocumentSnapshot) {
		/* __GDPR__
			"readFileRegionAdjustingFailed" : {
				"owner": "dbaeumer",
				"comment": "Information about the failure to adjust the requested region to read",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"lines": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of line to read", "isMeasurement": true },
				"reason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The reason why adjusting the requested region failed" },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language ID of the document snapshot" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('readFileRegionAdjustingFailed',
			{
				requestId: options.chatRequestId,
				reason,
				languageId: documentSnapshot.languageId,
			}, {
				lines: endLine - startLine + 1
			}
		);
	}

	async resolveInput(input: IReadFileParamsV1, promptContext: IBuildPromptContext): Promise<IReadFileParamsV1> {
		this._promptContext = promptContext;
		return input;
	}
}

ToolRegistry.registerTool(ReadFileTool);


interface ReadFileResultProps extends BasePromptElementProps {
	uri: URI;
	startLine: number;
	endLine: number;
	truncated: boolean;
	snapshot: TextDocumentSnapshot | NotebookDocumentSnapshot;
	languageModel: vscode.LanguageModelChat | undefined;
	useCodeFences: boolean;
}

class ReadFileResult extends PromptElement<ReadFileResultProps> {
	constructor(
		props: PromptElementProps<ReadFileResultProps>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override async render() {
		// Only check content exclusion (copilot ignore) - external file confirmation was already handled in prepareInvocation
		await this.instantiationService.invokeFunction(accessor => assertFileNotContentExcluded(accessor, this.props.uri));

		const documentSnapshot = this.props.snapshot;

		const documentText = documentSnapshot.getText();
		if (documentText.length === 0) {
			return <>(The file `{this.promptPathRepresentationService.getFilePath(this.props.uri)}` exists, but is empty)</>;
		} else if (documentText.trim().length === 0) {
			return <>(The file `{this.promptPathRepresentationService.getFilePath(this.props.uri)}` exists, but contains only whitespace)</>;
		}

		const range = new Range(
			this.props.startLine - 1, 0,
			this.props.endLine - 1, Infinity,
		);
		const rawContents = documentSnapshot.getText(range);
		let hadLongLines = false;
		let contents = rawContents.split('\n').map(line => {
			if (line.length > MAX_LINE_LENGTH) {
				hadLongLines = true;
				let end = MAX_LINE_LENGTH;
				if (isHighSurrogate(line.charCodeAt(end - 1)) && isLowSurrogate(line.charCodeAt(end))) {
					end--;
				}
				return line.slice(0, end) + ' [truncated]';
			}
			return line;
		}).join('\n');

		if (hadLongLines) {
			contents += `\n[One or more long lines were truncated at ${MAX_LINE_LENGTH} characters]\n`;
		}

		if (this.props.truncated) {
			contents += `\n[File content truncated at line ${this.props.endLine}. Use ${ToolName.ReadFile} with offset/limit parameters to view more.]\n`;
		}

		return <>
			{this.props.useCodeFences && range.end.line + 1 !== documentSnapshot.lineCount || this.props.truncated ? <>File: `{this.promptPathRepresentationService.getFilePath(this.props.uri)}`. Lines {range.start.line + 1} to {range.end.line + 1} ({documentSnapshot.lineCount} lines total): <br /></> : undefined}
			<CodeBlock
				uri={this.props.uri}
				code={contents}
				languageId={documentSnapshot.languageId}
				shouldTrim={false}
				includeFilepath={false}
				references={[new PromptReference(this.props.uri, undefined, { isFromTool: true })]}
				lineBasedPriority
				fence={this.props.useCodeFences ? undefined : ''}
			/>
		</>;
	}
}
