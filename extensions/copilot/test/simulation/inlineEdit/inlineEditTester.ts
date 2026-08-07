/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rename } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { VisualizationTestRun } from '../../../src/extension/inlineChat/node/rendererVisualization';
import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { createNextEditProvider } from '../../../src/extension/inlineEdits/node/createNextEditProvider';
import { DebugRecorder } from '../../../src/extension/inlineEdits/node/debugRecorder';
import { NESInlineCompletionContext, NextEditProvider } from '../../../src/extension/inlineEdits/node/nextEditProvider';
import { NextEditProviderTelemetryBuilder } from '../../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { NextEditResult } from '../../../src/extension/inlineEdits/node/nextEditResult';
import { ConfigKey, IConfigurationService } from '../../../src/platform/configuration/common/configurationService';
import { IGitExtensionService } from '../../../src/platform/git/common/gitExtensionService';
import { DocumentId } from '../../../src/platform/inlineEdits/common/dataTypes/documentId';
import { RootedEdit } from '../../../src/platform/inlineEdits/common/dataTypes/edit';
import { deserializeStringEdit, SerializedEdit, serializeStringEdit } from '../../../src/platform/inlineEdits/common/dataTypes/editUtils';
import { InlineEditRequestLogContext } from '../../../src/platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../src/platform/inlineEdits/common/observableGit';
import { ObservableWorkspace } from '../../../src/platform/inlineEdits/common/observableWorkspace';
import { IHistoryContextProvider } from '../../../src/platform/inlineEdits/common/workspaceEditTracker/historyContextProvider';
import { NesHistoryContextProvider } from '../../../src/platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../src/platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { INotebookService } from '../../../src/platform/notebook/common/notebookService';
import { IExperimentationService } from '../../../src/platform/telemetry/common/nullExperimentationService';
import { TestingServiceCollection } from '../../../src/platform/test/node/services';
import { IWorkspaceService } from '../../../src/platform/workspace/common/workspaceService';
import { TaskQueue } from '../../../src/util/common/async';
import { getLanguageForResource } from '../../../src/util/common/languages';
import { CachedFunction } from '../../../src/util/vs/base/common/cache';
import { CancellationToken } from '../../../src/util/vs/base/common/cancellation';
import { BugIndicatingError } from '../../../src/util/vs/base/common/errors';
import { assertReturnsDefined } from '../../../src/util/vs/base/common/types';
import { URI } from '../../../src/util/vs/base/common/uri';
import { generateUuid } from '../../../src/util/vs/base/common/uuid';
import { StringEdit, StringReplacement } from '../../../src/util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../src/util/vs/editor/common/core/text/abstractText';
import { IInstantiationService, ServicesAccessor } from '../../../src/util/vs/platform/instantiation/common/instantiation';
import { ISimulationTestRuntime } from '../../base/stest';
import { CriticalError } from '../../testExecutor';
import { fileExists } from '../../util';
import { ISerializedFileEdit, ISerializedNesUserEditsHistory, NES_LOG_CONTEXT_TAG, NES_USER_EDITS_HISTORY_TAG, NEXT_EDIT_SUGGESTION_TAG } from '../shared/sharedTypes';
import { ITestInformation } from '../testInformation';
import { IInlineEditBaseFile, ILoadedFile } from './fileLoading';
import { inlineEditScoringService } from './inlineEditScoringService';

export interface IInlineEditTest {
	recentEdit: IInlineEditTestDocument | IInlineEditTestDocument[];
}

export interface IInlineEditTestDocument {
	base: IInlineEditBaseFile;
	edit: SerializedEdit;
}

export interface IInlineEditTestRunResult {
	aiEditDocumentUri: DocumentId;
	aiEditDocumentValue: StringText;
	nextUserEdit: StringEdit;
	recordingData: IRecordingInformation;
	aiRootedEdit?: RootedEdit;
	aiEdit?: StringEdit;
	nextEdit?: StringReplacement;
	textAfterAiEdit?: StringText;
}

export class EditNotScoredError extends CriticalError {
	constructor(scoredEditsFilePath: string) {
		super(`Edit is not scored yet in \n${scoredEditsFilePath}\n! Please manually score it and run the test again.`);
	}
}

export type NextCursorPosition = /* lineNumber (1-based) */ number | { cursorOffset: number };

export class InlineEditTester {
	constructor(
		private readonly _includeNextEditSelection: boolean = false,
	) { }

	private readonly _renameQueues = new CachedFunction({ getCacheKey: JSON.stringify }, (arg: unknown) => new TaskQueue());

	async runAndScoreTestFromRecording(collection: TestingServiceCollection, recording: ILoadedFile): Promise<void> {
		const { isScored, scoredEditsFilePath } = await this.runAndScoreFromRecording(collection, recording);
		if (!isScored) {
			throw new EditNotScoredError(scoredEditsFilePath);
		}
	}

	async runAndScoreFromRecording(collectionOrAccessor: TestingServiceCollection | ServicesAccessor, recording: ILoadedFile): Promise<{ result: IInlineEditTestRunResult; scoredEditsFilePath: string; isScored: boolean }> {
		const accessor = collectionOrAccessor instanceof TestingServiceCollection ? collectionOrAccessor.createTestingAccessor() : collectionOrAccessor;
		const recordingData = JSON.parse(recording.fileContents) as IRecordingInformation;
		const result = await this.runTestFromRecording(accessor, recordingData);
		const testInfo = accessor.get(ITestInformation);

		const scoredEditsFilePath = await this._renameQueues.get([testInfo.testFileName, recording.filePath]).schedule(() => getScoredEditsFilePath(testInfo, recording.filePath));

		const score = await inlineEditScoringService.scoreEdit(scoredEditsFilePath, { kind: 'recording', recording: result.recordingData }, result.aiEditDocumentUri, result.aiEditDocumentValue, result.aiRootedEdit);

		if (!score) {
			return { result, scoredEditsFilePath, isScored: false };
		} else {
			const runtime = accessor.get(ISimulationTestRuntime);
			runtime.setExplicitScore(score.getScoreValue());
			return { result, scoredEditsFilePath, isScored: true };
		}
	}

	async runTestFromRecording(accessor: ServicesAccessor, recordingData: IRecordingInformation): Promise<IInlineEditTestRunResult> {
		const replayer = new ObservableWorkspaceRecordingReplayer(recordingData, this._includeNextEditSelection);
		const obsGit = accessor.get(IInstantiationService).createInstance(ObservableGit);
		const historyContextProvider = new NesHistoryContextProvider(replayer.workspace, obsGit);
		const nesXtabHistoryTracker = new NesXtabHistoryTracker(replayer.workspace, undefined, accessor.get(IConfigurationService), accessor.get(IExperimentationService));
		const debugRecorder = new DebugRecorder(replayer.workspace);

		const { lastDocId } = replayer.replay();

		const expectedEdit = deserializeStringEdit(recordingData.nextUserEdit?.edit ?? serializeStringEdit(StringEdit.empty));
		const result = await this._runTest(accessor, lastDocId, replayer.workspace, historyContextProvider, nesXtabHistoryTracker, debugRecorder);

		const r = { ...result, nextUserEdit: expectedEdit, recordingData };
		return r;
	}

	private async _runTest(accessor: ServicesAccessor, docId: DocumentId, workspace: ObservableWorkspace, historyContextProvider: IHistoryContextProvider, nesXtabHistoryTracker: NesXtabHistoryTracker, debugRecorder: DebugRecorder | undefined) {
		const instaService = accessor.get(IInstantiationService);
		const configService = accessor.get(IConfigurationService);
		const expService = accessor.get(IExperimentationService);
		const gitExtensionService = accessor.get(IGitExtensionService);
		const notebookService = accessor.get(INotebookService);
		const workspaceService = accessor.get(IWorkspaceService);

		const history = historyContextProvider.getHistoryContext(docId)!;
		let i = 0;
		for (const e of history.documents) {
			i++;
			VisualizationTestRun.instance?.addData('recentEdit_' + i, () => ({
				...{ $fileExtension: 'diff.w' },
				original: e.lastEdit.base.value,
				modified: e.lastEdit.getEditedState().value,
			}));
		}

		const stestRuntime = (() => {
			try {
				return accessor.get(ISimulationTestRuntime);
			} catch {
				return undefined;
			}
		})();

		if (stestRuntime) {
			const nesUserEditHistory: ISerializedNesUserEditsHistory = {
				edits: history.documents.map((doc): ISerializedFileEdit => ({
					id: getUserFriendlyFilePath(doc.docId),
					languageId: getLanguageIdFromDocumentId(doc.docId),
					original: doc.lastEdit.base.value,
					modified: doc.lastEdit.getEditedState().value,
				})),
				currentDocumentIndex: history.documents.length - 1,
			};
			stestRuntime.writeFile('nesUserEditHistory.json', JSON.stringify(nesUserEditHistory, null, 2), NES_USER_EDITS_HISTORY_TAG);
		}

		const nextEditProviderId = configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsProviderId, expService);
		const statelessNextEditProvider = createNextEditProvider(nextEditProviderId, instaService);
		const nextEditProvider = instaService.createInstance(NextEditProvider, workspace, statelessNextEditProvider, historyContextProvider, nesXtabHistoryTracker, debugRecorder);

		const historyContext = historyContextProvider.getHistoryContext(docId)!;
		const activeDocument = historyContext.getMostRecentDocument(); // TODO
		const context: NESInlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() + 200, enforceCacheDelay: false };
		const logContext = new InlineEditRequestLogContext(activeDocument.docId.toString(), 1, context);
		const telemetryBuilder = new NextEditProviderTelemetryBuilder(gitExtensionService, notebookService, workspaceService, nextEditProvider.ID, workspace.getDocument(activeDocument.docId)!);

		let nextEditResult: NextEditResult;
		try {
			nextEditResult = await nextEditProvider.getNextEdit(activeDocument.docId, context, logContext, CancellationToken.None, telemetryBuilder.nesBuilder);
		} finally {
			nextEditProvider.dispose();
			telemetryBuilder.dispose();
		}

		const logDocument = logContext.toLogDocument();

		VisualizationTestRun.instance?.addData('prompt', () => logContext.prompt);
		VisualizationTestRun.instance?.addData('log', () => logDocument, 'log_copilotmd');
		VisualizationTestRun.instance?.reload();

		if (stestRuntime) {
			stestRuntime.writeFile('nesLogContext.json', JSON.stringify(logDocument, null, 2), NES_LOG_CONTEXT_TAG);
		}

		const targetDocId = nextEditResult.result?.targetDocumentId;
		const targetDocument = targetDocId !== undefined ? assertReturnsDefined(historyContext.getDocument(targetDocId)) : activeDocument;

		const aiRootedEdit = new RootedEdit(targetDocument.lastEdit.getEditedState(), nextEditResult.result?.edit?.toEdit() ?? StringEdit.empty);

		if (!nextEditResult.result || !nextEditResult.result.edit) {
			return {
				aiEditDocumentUri: targetDocument.docId,
				aiEditDocumentValue: aiRootedEdit.base
			};
		}

		if (stestRuntime) {
			const serializedNextEdit: ISerializedFileEdit = {
				id: getUserFriendlyFilePath(targetDocument.docId),
				languageId: getLanguageIdFromDocumentId(targetDocument.docId),
				original: aiRootedEdit.base.value,
				modified: aiRootedEdit.getEditedState().value,
			};
			stestRuntime.writeFile('proposedNextEdit.json', JSON.stringify(serializedNextEdit, null, 2), NEXT_EDIT_SUGGESTION_TAG);
		}

		VisualizationTestRun.instance?.addData('proposedNextEdit', () => ({
			...{ $fileExtension: 'diff.w' },
			original: aiRootedEdit.base.value,
			modified: aiRootedEdit.getEditedState().value,
		}));

		return {
			aiRootedEdit,
			aiEdit: aiRootedEdit.edit,
			aiEditDocumentUri: targetDocument.docId,
			nextEdit: nextEditResult.result.edit,
			textAfterAiEdit: aiRootedEdit.getEditedState(),
			aiEditDocumentValue: aiRootedEdit.base,
		};
	}
}

function getLanguageIdFromDocumentId(docId: DocumentId): string {
	return getLanguageForResource(URI.file(`/path/file.${docId.extension}`)).languageId;
}

function getUserFriendlyFilePath(docId: DocumentId): string {
	return basename(docId.path);
}

async function getScoredEditsFilePath(test: ITestInformation, recordingFilePath: string | undefined): Promise<string> {
	const paths: string[] = [];

	if (test.testFileName !== undefined) {
		const testDirName = dirname(test.testFileName);
		const filePath = join(testDirName, 'scores', sanitizeFileName(stripTestFlavor(test.fullTestName)) + '.scoredEdits.w.json');
		paths.push(filePath);
	}

	if (recordingFilePath !== undefined) {
		const path = recordingFilePath.replace('recording.w.json', 'scoredEdits.w.json');
		if (path === recordingFilePath) {
			throw new BugIndicatingError();
		}
		paths.push(path);
	}

	for (let i = 0; i < paths.length; i++) {
		if (i === paths.length - 1) {
			return paths[i];
		} else {
			if (await fileExists(paths[i]) && !await fileExists(paths[i + 1])) {
				await rename(paths[i], paths[i + 1]);
			}
		}
	}

	throw new BugIndicatingError();
}

function sanitizeFileName(name: string) {
	return name.replace(/[^a-z0-9 \[\]-]/gi, '_');
}

/** This's used to make sure different flavors of a single test reuse the same scoring file. */
function stripTestFlavor(name: string) {
	return name.replace(/ \(\[([a-zA-Z0-9\-])+\]\)/, '');
}
