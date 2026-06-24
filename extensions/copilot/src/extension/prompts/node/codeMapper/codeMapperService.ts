/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

import { NotebookDocumentSnapshot } from '../../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { EditSurvivalResult } from '../../../../platform/editSurvivalTracking/common/editSurvivalReporter';
import { IEditSurvivalTrackerService, IEditSurvivalTrackingSession } from '../../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { inferAlternativeNotebookContentFormat } from '../../../../platform/notebook/common/alternativeContent';
import { IAlternativeNotebookContentEditGenerator, NotebookEditGenrationSource } from '../../../../platform/notebook/common/alternativeContentEditGenerator';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { emitEditSurvivalEvent } from '../../../../platform/otel/common/genAiEvents';
import { GenAiMetrics } from '../../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../../platform/otel/common/otelService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { findNotebook } from '../../../../util/common/notebooks';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Queue } from '../../../../util/vs/base/common/async';
import { Disposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { isEqual } from '../../../../util/vs/base/common/resources';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Range, TextEdit } from '../../../../vscodeTypes';
import { OutcomeAnnotation } from '../../../inlineChat/node/promptCraftingTypes';
import { IWorkingSet } from '../../../prompt/common/intents';
import { EXISTING_CODE_MARKER } from '../panel/codeBlockFormattingRules';
import { CodeMapper, CodeMapperOutcomeTelemetry, ICodeMapperDocument, ICodeMapperRequestInput, processFullRewriteNewNotebook } from './codeMapper';

export type CodeBlock = { readonly code: string; readonly resource: vscode.Uri; readonly markdownBeforeBlock?: string };
export type ResourceTextEdits = { readonly target: vscode.Uri; readonly edits: TextEdit | TextEdit[] };

export interface ICodeMapperTelemetryInfo {
	readonly isAgent?: boolean;
	readonly chatRequestId?: string;
	readonly chatSessionId?: string;
	readonly chatRequestSource?: string;
	readonly chatRequestModel?: string;
}

export const ICodeMapperService = createServiceIdentifier<ICodeMapperService>('ICodeMapperService');

export interface IMapCodeRequest {
	readonly codeBlock: CodeBlock;
	readonly workingSet?: IWorkingSet;
	readonly location?: string;
}

export interface IMapCodeResult {
	readonly errorDetails?: vscode.ChatErrorDetails;
	readonly annotations?: OutcomeAnnotation[];
	readonly telemetry?: CodeMapperOutcomeTelemetry;
}

export interface ICodeMapperService {
	readonly _serviceBrand: undefined;
	mapCode(request: IMapCodeRequest, responseStream: vscode.MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: vscode.CancellationToken): Promise<IMapCodeResult | undefined>;
}

export class CodeMapperService extends Disposable implements ICodeMapperService {

	readonly _serviceBrand: undefined;

	private readonly _queues: ResourceMap<Queue<IMapCodeResult | undefined>> = new ResourceMap();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookService private readonly notebookService: INotebookService,
	) {
		super();
		this._register(toDisposable(() => this._queues.clear()));
	}

	async mapCode(request: IMapCodeRequest, responseStream: vscode.MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: vscode.CancellationToken): Promise<IMapCodeResult | undefined> {
		let queue = this._queues.get(request.codeBlock.resource);
		if (!queue) {
			queue = new Queue<IMapCodeResult | undefined>();
			this._queues.set(request.codeBlock.resource, queue);
		}

		return queue.queue(() => this._doMapCode(request, responseStream, telemetryInfo, token));
	}

	private async _doMapCode(request: IMapCodeRequest, responseStream: vscode.MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: vscode.CancellationToken): Promise<IMapCodeResult | undefined> {
		const codeMapper = this.notebookService.hasSupportedNotebooks(request.codeBlock.resource) ?
			this.instantiationService.createInstance(NotebookCodeMapper) :
			this.instantiationService.createInstance(DocumentCodeMapper);

		return codeMapper.mapCode(request, responseStream, telemetryInfo, token);
	}
}

class DocumentCodeMapper extends Disposable implements ICodeMapperService {

	readonly _serviceBrand: undefined;
	private readonly codeMapper: CodeMapper;
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEditSurvivalTrackerService private readonly _editSurvivalTrackerService: IEditSurvivalTrackerService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IOTelService private readonly _otelService: IOTelService,
	) {
		super();
		this.codeMapper = this.instantiationService.createInstance(CodeMapper);
	}

	async mapCode(request: IMapCodeRequest, responseStream: vscode.MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: vscode.CancellationToken): Promise<IMapCodeResult | undefined> {
		const { codeBlock } = request;
		const documentContext = await this._getDocumentContextForCodeBlock(codeBlock);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if ((!documentContext || (documentContext.getText().length === 0)) && !codeBlock.code.includes(EXISTING_CODE_MARKER)) {
			// for non existing, empty file and no '...existing code... content, we can emit the code block as is
			// Fast path: the base request already gave us the content to apply in full, we can avoid going to the speculative decoding endpoint
			responseStream.textEdit(codeBlock.resource, new TextEdit(new Range(0, 0, 0, 0), codeBlock.code));
			/* __GDPR__
				"codemapper.completeCodeBlock" : {
					"owner": "aeschli",
					"comment": "Sent when a codemapper request is received for a complete code block that contains no ...existing code... comments."
				}
				*/
			this._telemetryService.sendMSFTTelemetryEvent('codemapper.completeCodeBlock');
			return {};
		}


		let editSurvivalTracker: IEditSurvivalTrackingSession | undefined;
		// set up edit survival tracking currently only when we are modifying an existing document
		if (documentContext) {
			const tracker = editSurvivalTracker = this._editSurvivalTrackerService.initialize(documentContext.document);
			responseStream = spyResponseStream(responseStream, (_target, edits) => { tracker.collectAIEdits(edits); });
		}

		const result = await mapCode(request, responseStream, documentContext, this.codeMapper, this._telemetryService, telemetryInfo, token);
		const telemetry = result?.telemetry;
		if (telemetry) {
			editSurvivalTracker?.startReporter(res => reportEditSurvivalEvent(res, telemetry, this._otelService));
		}
		return result;
	}

	private async _getDocumentContextForCodeBlock(codeblock: CodeBlock): Promise<TextDocumentSnapshot | undefined> {
		try {
			const existingDoc = this._workspaceService.textDocuments.find(doc => isEqual(doc.uri, codeblock.resource));
			if (existingDoc) {
				return TextDocumentSnapshot.create(existingDoc);
			}

			const existsOnDisk = await this._fileSystemService.stat(codeblock.resource).then(() => true, () => false);
			if (!existsOnDisk) {
				return undefined;
			}

			return await this._workspaceService.openTextDocumentAndSnapshot(codeblock.resource);
		} catch (ex) {
			// ignore, probably an invalid URI or the like.
			console.error(`Failed to get document context for ${codeblock.resource.toString()}`, ex);
			return undefined;
		}
	}
}

class NotebookCodeMapper extends Disposable implements ICodeMapperService {

	readonly _serviceBrand: undefined;

	private readonly codeMapper: CodeMapper;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IAlternativeNotebookContentEditGenerator private readonly alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator,
	) {
		super();
		this.codeMapper = this.instantiationService.createInstance(CodeMapper);
	}

	async mapCode(request: IMapCodeRequest, responseStream: vscode.MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: vscode.CancellationToken): Promise<IMapCodeResult | undefined> {
		const { codeBlock } = request;
		const documentContext = await this._getDocumentContextForCodeBlock(codeBlock);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if ((!documentContext || (documentContext.getText().length === 0)) && !codeBlock.code.includes(EXISTING_CODE_MARKER)) {
			// for non existing, empty file and no '...existing code... content, we can emit the code block as is
			// Fast path: the base request already gave us the content to apply in full, we can avoid going to the speculative decoding endpoint
			await processFullRewriteNewNotebook(codeBlock.resource, codeBlock.code, responseStream, this.alternativeNotebookEditGenerator, { source: NotebookEditGenrationSource.newNotebookIntent, model: telemetryInfo?.chatRequestModel, requestId: telemetryInfo?.chatRequestId }, token);
			/* __GDPR__
				"codemapper.completeCodeBlock" : {
					"owner": "aeschli",
					"comment": "Sent when a codemapper request is received for a complete code block that contains no ...existing code... comments."
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('codemapper.completeCodeBlock');
			return {};
		}

		return mapCode(request, responseStream, documentContext, this.codeMapper, this._telemetryService, telemetryInfo, token);
	}

	private async _getDocumentContextForCodeBlock(codeblock: CodeBlock): Promise<ICodeMapperDocument | undefined> {
		try {
			const format = inferAlternativeNotebookContentFormat(codeblock.code);
			const notebookDocument = findNotebook(codeblock.resource, this._workspaceService.notebookDocuments);
			if (notebookDocument) {
				return NotebookDocumentSnapshot.create(notebookDocument, format);
			}

			const existsOnDisk = await this._fileSystemService.stat(codeblock.resource).then(() => true, () => false);
			if (!existsOnDisk) {
				return undefined;
			}
			return await this._workspaceService.openNotebookDocumentAndSnapshot(codeblock.resource, format);
		} catch (ex) {
			// ignore, probably an invalid URI or the like.
			console.error(`Failed to get document context for ${codeblock.resource.toString()}`, ex);
			return undefined;
		}

	}

}

async function mapCode(request: IMapCodeRequest, responseStream: vscode.MappedEditsResponseStream, documentContext: ICodeMapperDocument | undefined, codeMapper: CodeMapper, telemetryService: ITelemetryService, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: vscode.CancellationToken): Promise<IMapCodeResult | undefined> {
	const { codeBlock, workingSet, location } = request;
	const requestInput: ICodeMapperRequestInput = (documentContext && (documentContext.getText().length > 0)) ?
		{
			createNew: false,
			codeBlock: codeBlock.code,
			uri: codeBlock.resource,
			markdownBeforeBlock: codeBlock.markdownBeforeBlock,
			existingDocument: documentContext,
			location
		} : {
			createNew: true,
			codeBlock: codeBlock.code,
			uri: codeBlock.resource,
			markdownBeforeBlock: codeBlock.markdownBeforeBlock,
			existingDocument: undefined,
			workingSet: workingSet?.map(entry => entry.document) || []
		};


	const result = await codeMapper.mapCode(requestInput, responseStream, telemetryInfo, token);
	if (result) {
		reportTelemetry(telemetryService, result);
	}
	return result;

}
function reportTelemetry(telemetryService: ITelemetryService, { telemetry, annotations }: IMapCodeResult) {
	if (!telemetry) {
		return; // cancelled
	}

	/* __GDPR__
		"codemapper.request" : {
			"owner": "aeschli",
			"comment": "Metadata about the code mapper request",
			"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
			"requestSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source from where the request was made" },
			"mapper": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The mapper used: One of 'fast', 'fast-lora', 'full' and 'patch'" },
			"outcomeAnnotations": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Annotations about the outcome of the request." }
		}
	*/
	telemetryService.sendMSFTTelemetryEvent('codemapper.request', {
		requestId: telemetry.requestId,
		requestSource: telemetry.requestSource,
		mapper: telemetry.mapper,
		outcomeAnnotations: annotations?.map(a => a.label).join(','),
	}, {
	});
}

function spyResponseStream(responseStream: vscode.MappedEditsResponseStream, callback: (target: vscode.Uri, edits: TextEdit | TextEdit[]) => void): vscode.MappedEditsResponseStream {
	return {
		textEdit: (target: vscode.Uri, edits: TextEdit | TextEdit[]) => {
			callback(target, edits);
			responseStream.textEdit(target, edits);
		},
		notebookEdit(target, edits) {
			responseStream.notebookEdit(target, edits);
		},
	};
}

function reportEditSurvivalEvent(res: EditSurvivalResult, { requestId, speculationRequestId, requestSource, mapper, chatRequestModel }: CodeMapperOutcomeTelemetry, otelService: IOTelService) {

	/* __GDPR__
		"codeMapper.trackEditSurvival" : {
			"owner": "aeschli",
			"comment": "Tracks how much percent of the AI edits survived after 5 minutes of accepting",
			"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
			"speculationRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the speculation request." },
			"requestSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source from where the request was made" },
			"chatRequestModel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model used for the base chat request to generate the edit object." },
			"mapper": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The code mapper used: One of 'fast', 'fast-lora', 'full' and 'patch'" },
			"survivalRateFourGram": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the AI edit is still present in the document." },
			"survivalRateNoRevert": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the ranges the AI touched ended up being reverted." },
			"didBranchChange": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Indicates if the branch changed in the meantime. If the branch changed (value is 1), this event should probably be ignored." },
			"timeDelayMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The time delay between the user accepting the edit and measuring the survival rate." }
		}
	*/
	res.telemetryService.sendMSFTTelemetryEvent('codeMapper.trackEditSurvival', { requestId, speculationRequestId, requestSource, chatRequestModel, mapper }, {
		survivalRateFourGram: res.fourGram,
		survivalRateNoRevert: res.noRevert,
		timeDelayMs: res.timeDelayMs,
		didBranchChange: res.didBranchChange ? 1 : 0,
	});
	res.telemetryService.sendInternalMSFTTelemetryEvent('codeMapper.trackEditSurvival', {
		requestId,
		speculationRequestId,
		requestSource,
		chatRequestModel,
		mapper,
		currentFileContent: res.currentFileContent,
		textBeforeAiEdits: res.textBeforeAiEdits ? JSON.stringify(res.textBeforeAiEdits) : undefined,
		textAfterAiEdits: res.textAfterAiEdits ? JSON.stringify(res.textAfterAiEdits) : undefined,
		textAfterUserEdits: res.textAfterUserEdits ? JSON.stringify(res.textAfterUserEdits) : undefined,
	}, {
		survivalRateFourGram: res.fourGram,
		survivalRateNoRevert: res.noRevert,
		timeDelayMs: res.timeDelayMs,
		didBranchChange: res.didBranchChange ? 1 : 0,
	});
	res.telemetryService.sendEnhancedGHTelemetryEvent('fastApply/trackEditSurvival', {
		providerId: mapper,
		headerRequestId: speculationRequestId,
		completionTextJson: res.currentFileContent,
		chatRequestModel,
		requestSource,
		headBranchName: res.workspace?.headBranchName,
		headCommitHash: res.workspace?.headCommitHash,
		remoteUrl: res.workspace?.remoteUrl,
		fileRelativePath: res.workspace?.fileRelativePath,
	}, {
		timeDelayMs: res.timeDelayMs,
		survivalRateFourGram: res.fourGram,
		survivalRateNoRevert: res.noRevert,
	});

	emitEditSurvivalEvent(otelService, 'code_mapper', res.fourGram, res.noRevert, res.timeDelayMs, res.didBranchChange, requestId ?? '', res.workspace);
	GenAiMetrics.recordEditSurvivalFourGram(otelService, 'code_mapper', res.fourGram, res.timeDelayMs);
	GenAiMetrics.recordEditSurvivalNoRevert(otelService, 'code_mapper', res.noRevert, res.timeDelayMs);
}