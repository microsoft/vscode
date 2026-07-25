/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../../base/common/async.js';
import { Disposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { extname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agentService.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri } from '../../common/state/sessionState.js';
import { computeChunkedEditSurvival, computeWholeFileEditSurvival } from './editSurvivalTracker.js';

/**
 * Parameters describing a single completed tool-driven file edit that the
 * agent host wants to follow over time.
 *
 * Only first-party edit tools that go through `FileEditTracker` produce
 * these — file modifications from shell tools like `Bash` are not
 * observable here.
 *
 * Notebook tools (`NotebookEdit`) are skipped by the launcher for now
 * to avoid the complexity of scoring against notebook JSON. We may
 * revisit when we have a notebook-aware tracker.
 */
export interface IEditSurvivalReporterLaunchParams {
	/** Full session URI string (e.g. `claude:/abc123`). */
	readonly sessionUri: string;
	readonly turnId: string;
	readonly toolCallId: string;
	/** Absolute file path on the agent host's local file system. */
	readonly filePath: string;
	/** File content snapshotted before the tool ran (empty for creates). */
	readonly beforeText: string;
	/** File content after the tool ran (the AI's output). */
	readonly afterText: string;
	/** Whether the tool created a new file (no prior content existed). */
	readonly isCreate: boolean;
	/** Name of the edit tool, e.g. `Edit`, `apply_patch`. Empty if unknown. */
	readonly toolName?: string;
	/**
	 * Model that produced this edit, e.g. `claude-sonnet-4.5`. Optional
	 * defensively, but always expected to be set
	 */
	readonly modelId?: string;
	/**
	 * Explicit AI-written text chunks extracted from the tool input
	 * (see `editChunkExtractor.ts`). When provided, survival is scored
	 * against just these chunks; when omitted or empty, the reporter
	 * falls back to whole-file scoring and tags the event with
	 * `scoringMode='whole-file'`.
	 */
	readonly aiChunks?: readonly string[];
}

export const IEditSurvivalReporterFactory = createDecorator<IEditSurvivalReporterFactory>('editSurvivalReporterFactory');

/**
 * Launches background reporters that sample the on-disk file after a tool
 * edit and emit edit-survival telemetry over the next 15 minutes.
 */
export interface IEditSurvivalReporterFactory {
	readonly _serviceBrand: undefined;
	/**
	 * Begin tracking a single file edit. The returned disposable can be
	 * used to cancel sampling early; otherwise the reporter cleans itself
	 * up after the final 15-minute sample.
	 */
	launch(params: IEditSurvivalReporterLaunchParams): IDisposable;
}

/** No-op factory, useful for tests and environments without telemetry. */
export class NullEditSurvivalReporterFactory implements IEditSurvivalReporterFactory {
	readonly _serviceBrand: undefined;
	launch(_params: IEditSurvivalReporterLaunchParams): IDisposable {
		return { dispose() { } };
	}
}

interface IEditSurvivalTelemetryEvent {
	provider: string;
	modelId: string;
	toolName: string;
	agentSessionId: string;
	turnId: string;
	toolCallId: string;
	fileExtension: string;
	survivalRateFourGram: number;
	survivalRateNoRevert: number;
	scoringMode: string;
	aiChunkCount: number;
	aiCharCount: number;
	timeDelayMs: number;
	didFileGetDeleted: number;
	isCreate: number;
	beforeTextLength: number;
	afterTextLength: number;
	currentTextLength: number;
}

type IEditSurvivalTelemetryClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model that produced the edit, e.g. "claude-sonnet-4.5" or "gpt-5-mini". Empty if the host could not determine the per-edit model.' };
	toolName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of the edit tool that produced the edit, e.g. "Edit", "apply_patch". Empty if unknown.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host turn identifier this edit belongs to.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool call identifier that produced the edit.' };
	fileExtension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The file extension (including the leading dot) of the edited file, or empty if the file has no extension.' };
	survivalRateFourGram: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'A number between 0 and 1 representing the share of 4-grams the AI wrote that are still present in the file.' };
	survivalRateNoRevert: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'A number between 0 and 1; 1 means the user kept the AI edit and 0 means the user fully reverted it.' };
	scoringMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How survivalRateFourGram was computed: "chunked" (asymmetric, denominator bounded by the AI-written text) or "whole-file" (symmetric, denominator includes the whole file).' };
	aiChunkCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct AI-written text chunks contributing to chunked scoring (0 when scoringMode is "whole-file").' };
	aiCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sum of character lengths of the AI-written chunks (suitable for char-weighted dashboard rollups). Always 0 when scoringMode is "whole-file" because we cannot accurately determine the AI char count from a whole-file snapshot.' };
	timeDelayMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since the edit completed when this sample was taken.' };
	didFileGetDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: '1 if the file could not be read when the sample was taken (deleted or moved), otherwise 0.' };
	isCreate: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: '1 if the tool call created a new file, otherwise 0.' };
	beforeTextLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Length in characters of the file content before the AI edit.' };
	afterTextLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Length in characters of the file content the AI wrote.' };
	currentTextLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Length in characters of the file content at the time of the sample (0 if the file is missing).' };
	owner: 'roblourens';
	comment: 'Tracks how long AI-produced file edits survive in the user\'s file over the 15 minutes following a tool call in an agent host session. No file contents are reported.';
};

/**
 * Schedule of samples (in milliseconds since the edit completed) at
 * which we read the file again and emit a telemetry event. Matches the
 * chat extension's schedule so the resulting data is comparable.
 */
const SAMPLE_SCHEDULE_MS = [0, 5_000, 30_000, 120_000, 300_000, 600_000, 900_000];

class SessionEditSurvivalReporter extends Disposable {
	private readonly _startTime = Date.now();
	private _samplesTaken = 0;

	constructor(
		private readonly _params: IEditSurvivalReporterLaunchParams,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._scheduleNext();
	}

	private _scheduleNext(): void {
		if (this._samplesTaken >= SAMPLE_SCHEDULE_MS.length) {
			this.dispose();
			return;
		}

		const elapsed = Date.now() - this._startTime;
		const delay = Math.max(0, SAMPLE_SCHEDULE_MS[this._samplesTaken] - elapsed);
		const timer = this._register(new TimeoutTimer());
		timer.setIfNotSet(() => this._takeSample(), delay);
	}

	private async _takeSample(): Promise<void> {
		const sampleIndex = this._samplesTaken++;
		const timeDelayMs = SAMPLE_SCHEDULE_MS[sampleIndex];

		try {
			let currentText: string;
			let didFileGetDeleted = false;
			try {
				const content = await this._fileService.readFile(URI.file(this._params.filePath));
				currentText = content.value.toString();
			} catch (err) {
				// Only treat genuine "file is gone" as a delete event.
				// Other failures (permissions, transient provider hiccups,
				// FILE_TOO_LARGE, etc.) shouldn't bias the telemetry as
				// reverts -- skip this sample and try again next time.
				if (toFileOperationResult(err) === FileOperationResult.FILE_NOT_FOUND) {
					didFileGetDeleted = true;
					currentText = '';
				} else {
					this._logService.warn(`[EditSurvivalReporter] readFile failed for ${this._params.filePath}, skipping sample: ${err}`);
					this._scheduleNext();
					return;
				}
			}

			const aiChunks = this._params.aiChunks ?? [];
			const useChunked = aiChunks.length > 0;
			const aiCharCount = useChunked ? aiChunks.reduce((sum, c) => sum + c.length, 0) : 0;
			const scores = didFileGetDeleted
				? { fourGram: 0, noRevert: 0 }
				: useChunked
					? computeChunkedEditSurvival(this._params.beforeText, this._params.afterText, aiChunks, currentText)
					: computeWholeFileEditSurvival(this._params.beforeText, this._params.afterText, currentText);

			// Sub-channel URIs (e.g. `ahp-chat:` for the default chat or
			// subagent chats) encode the parent session URI; resolve them
			// back so provider/id reflect the underlying harness rather than
			// the chat scheme. See telemetry gap #6 in #8209.
			const sessionUri = isAhpChatChannel(this._params.sessionUri) ? parseRequiredSessionUriFromChatUri(this._params.sessionUri) : this._params.sessionUri;
			this._telemetryService.publicLog2<IEditSurvivalTelemetryEvent, IEditSurvivalTelemetryClassification>(
				'agentHost.trackEditSurvival',
				{
					provider: AgentSession.provider(sessionUri) ?? 'unknown',
					modelId: this._params.modelId ?? '',
					toolName: this._params.toolName ?? '',
					agentSessionId: AgentSession.id(sessionUri),
					turnId: this._params.turnId,
					toolCallId: this._params.toolCallId,
					fileExtension: extname(this._params.filePath),
					survivalRateFourGram: scores.fourGram,
					survivalRateNoRevert: scores.noRevert,
					scoringMode: useChunked ? 'chunked' : 'whole-file',
					aiChunkCount: aiChunks.length,
					aiCharCount,
					timeDelayMs,
					didFileGetDeleted: didFileGetDeleted ? 1 : 0,
					isCreate: this._params.isCreate ? 1 : 0,
					beforeTextLength: this._params.beforeText.length,
					afterTextLength: this._params.afterText.length,
					currentTextLength: didFileGetDeleted ? 0 : currentText.length,
				},
			);

			if (didFileGetDeleted) {
				// Once the file is gone all further samples would report
				// the same; stop early.
				this.dispose();
				return;
			}
		} catch (err) {
			this._logService.warn(`[EditSurvivalReporter] sample failed for ${this._params.filePath}: ${err}`);
		}

		this._scheduleNext();
	}
}

const MAX_TRACKED_FILE_SIZE_CHARS = 5 * 1024 * 1024;

export class EditSurvivalReporterFactory implements IEditSurvivalReporterFactory {
	readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	launch(params: IEditSurvivalReporterLaunchParams): IDisposable {
		// Skip notebooks for now: scoring against the on-disk JSON
		// (including output cells) doesn't reflect user intent. We may
		// revisit with a notebook-aware tracker.
		if (extname(params.filePath).toLowerCase() === '.ipynb') {
			return { dispose() { } };
		}
		// Skip very large files to avoid putting pressure on memory and perf.
		if (Math.max(params.beforeText.length, params.afterText.length) > MAX_TRACKED_FILE_SIZE_CHARS) {
			return { dispose() { } };
		}
		return new SessionEditSurvivalReporter(params, this._fileService, this._logService, this._telemetryService);
	}
}
