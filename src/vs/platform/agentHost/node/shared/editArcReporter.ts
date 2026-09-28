/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey, TimeoutTimer } from '../../../../base/common/async.js';
import { EditArcTracker, IArcTextEdit } from '../../../../base/common/editArcTracker.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { dirname, extname } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { FileChangeType, FileOperationResult, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IEditArcTelemetryClassification, IEditArcTelemetryEvent } from '../../../telemetry/common/editArcTelemetry.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentHostEditTelemetryEnabledConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { isAhpChatChannel, isSubagentChatUri, isSubagentSession, parseRequiredSessionUriFromChatUri } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostTelemetryService, isAgentHostTelemetryService } from '../agentHostTelemetryService.js';
import { toInitiatorTelemetry, type IAgentHostEventClassification, type IAgentHostEventTelemetry } from '../agentHostTelemetryReporter.js';

type IAgentHostEditArcTelemetryEvent = IEditArcTelemetryEvent & IAgentHostEventTelemetry;

type IAgentHostEditArcTelemetryClassification = IEditArcTelemetryClassification & IAgentHostEventClassification;

export interface IEditArcReporterLaunchParams {
	readonly clientContext?: IAgentHostClientTelemetryContext;
	readonly sessionUri: string;
	readonly turnId: string;
	readonly toolCallId: string;
	readonly filePath: string;
	readonly beforeText: string;
	readonly afterText: string;
	readonly initialEdit: IArcTextEdit;
	readonly modelId?: string;
	readonly toolName?: string;
	readonly mode?: string;
	readonly completionTime: number;
}

export const IEditArcReporterService = createDecorator<IEditArcReporterService>('editArcReporterService');

export interface IEditArcReporterService {
	readonly _serviceBrand: undefined;
	reportEdit(params: IEditArcReporterLaunchParams): Promise<void>;
}

export class NullEditArcReporterService implements IEditArcReporterService {
	readonly _serviceBrand: undefined;
	async reportEdit(_params: IEditArcReporterLaunchParams): Promise<void> { }
}

interface IResourceState extends IDisposable {
	readonly resource: URI;
	readonly gitWorkingDirectory: Promise<URI>;
	readonly reporters: Set<EditArcReporter>;
	logicalText: string;
	isDisposing: boolean;
}

const SAMPLE_SCHEDULE_MS = [0, 60_000, 300_000];
const MAX_TRACKED_FILE_SIZE_CHARS = 5 * 1024 * 1024;
const MAX_REPORTERS_PER_RESOURCE = 20;
const MAX_REPORTERS_HOST_WIDE = 200;
const MAX_RETAINED_CHARACTERS_HOST_WIDE = 100 * 1024 * 1024;

export class EditArcReporterService extends Disposable implements IEditArcReporterService {
	declare readonly _serviceBrand: undefined;

	private readonly _resourceSequencer = new SequencerByKey<string>();
	private readonly _resources = this._register(new DisposableMap<string, IResourceState>());
	private _reporterCount = 0;
	private _retainedCharacters = 0;

	constructor(
		private readonly _sampleScheduleMs: readonly number[] = SAMPLE_SCHEDULE_MS,
		@IFileService private readonly _fileService: IFileService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			if (!this._isEnabled()) {
				this._disposeAllReporters('configuration disabled');
			}
		}));
	}

	async reportEdit(params: IEditArcReporterLaunchParams): Promise<void> {
		const resource = URI.file(params.filePath);
		const key = extUriBiasedIgnorePathCase.getComparisonKey(resource);
		await this._resourceSequencer.queue(key, async () => {
			if (!this._isEnabled()) {
				this._logService.trace(`[EditArcReporter] Skipping ${params.filePath}: telemetry is disabled`);
				return;
			}
			if (extname(params.filePath).toLowerCase() === '.ipynb') {
				this._logService.trace(`[EditArcReporter] Skipping notebook: ${params.filePath}`);
				return;
			}
			const retainedCharacters = params.beforeText.length + params.afterText.length;
			if (Math.max(params.beforeText.length, params.afterText.length) > MAX_TRACKED_FILE_SIZE_CHARS) {
				this._logService.warn(`[EditArcReporter] Skipping oversized file: ${params.filePath}`);
				return;
			}

			let state = this._resources.get(key);
			if (state) {
				if (!await this._applyCompletedEdit(state, params)) {
					return;
				}
				if (!this._isEnabled() || this._resources.get(key) !== state) {
					return;
				}
			}

			if (state && state.reporters.size >= MAX_REPORTERS_PER_RESOURCE) {
				this._logService.warn(`[EditArcReporter] Skipping edit: per-resource reporter limit reached for ${params.filePath}`);
				return;
			}
			if (this._reporterCount >= MAX_REPORTERS_HOST_WIDE || this._retainedCharacters + retainedCharacters > MAX_RETAINED_CHARACTERS_HOST_WIDE) {
				this._logService.warn(`[EditArcReporter] Skipping edit: host reporter memory limit reached`);
				return;
			}

			state ??= this._createResourceState(key, resource, params.afterText);
			const resourceState = state;
			const reporter: EditArcReporter = new EditArcReporter(params, this._sampleScheduleMs, resourceState.gitWorkingDirectory, this._gitService, this._telemetryService, this._logService, (timeDelayMs): Promise<void> => this.reconcileAndSample(resourceState, reporter, timeDelayMs), () => {
				resourceState.reporters.delete(reporter);
				this._reporterCount--;
				this._retainedCharacters -= retainedCharacters;
				if (!resourceState.isDisposing && resourceState.reporters.size === 0) {
					this._resources.deleteAndDispose(key);
				}
			});
			resourceState.reporters.add(reporter);
			this._reporterCount++;
			this._retainedCharacters += retainedCharacters;
		});
	}

	private _createResourceState(key: string, resource: URI, logicalText: string): IResourceState {
		const store = new DisposableStore();
		const fileDirectory = URI.file(dirname(resource.fsPath));
		const state: IResourceState = {
			resource,
			gitWorkingDirectory: this._gitService.getRepositoryRoot(fileDirectory).then(repositoryRoot => repositoryRoot ?? fileDirectory),
			logicalText,
			reporters: new Set(),
			isDisposing: false,
			dispose: () => {
				state.isDisposing = true;
				store.dispose();
			},
		};
		store.add(toDisposable(() => {
			for (const reporter of [...state.reporters]) {
				reporter.dispose();
			}
		}));
		try {
			const watcher = store.add(this._fileService.createWatcher(URI.file(dirname(resource.fsPath)), { recursive: false, excludes: [] }));
			store.add(watcher.onDidChange(event => {
				if (event.contains(resource, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED)) {
					this._resourceSequencer.queue(key, async () => {
						try {
							await this._reconcileFromDisk(state, false);
						} catch (error) {
							this._logService.warn(`[EditArcReporter] Watcher reconciliation failed for ${resource.fsPath}`, error);
						}
					});
				}
			}));
		} catch (error) {
			this._logService.warn(`[EditArcReporter] Failed to watch ${resource.fsPath}; delayed samples will use forced reconciliation`, error);
		}
		this._resources.set(key, state);
		return state;
	}

	private async _applyCompletedEdit(state: IResourceState, params: IEditArcReporterLaunchParams): Promise<boolean> {
		if (state.logicalText === params.afterText) {
			return true;
		}
		if (state.logicalText === params.beforeText) {
			await this._applyEdit(state, params.initialEdit, params.afterText);
			return true;
		}

		const detailed = await this._diffComputeService.computeDetailedDiff(state.logicalText, params.afterText);
		if (detailed.hitTimeout) {
			this._logService.warn(`[EditArcReporter] Could not update older reporters before ${params.toolCallId}: detailed diff timed out`);
			return false;
		}
		await this._applyEdit(state, { replacements: detailed.replacements }, params.afterText);
		return true;
	}

	private async _reconcileFromDisk(state: IResourceState, sample: boolean): Promise<boolean> {
		let currentText: string;
		try {
			currentText = (await this._fileService.readFile(state.resource)).value.toString();
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				currentText = '';
			} else {
				this._logService.warn(`[EditArcReporter] Failed to read ${state.resource.fsPath}${sample ? ' before sample' : ''}`, error);
				return false;
			}
		}
		if (currentText === state.logicalText) {
			return true;
		}

		const detailed = await this._diffComputeService.computeDetailedDiff(state.logicalText, currentText);
		if (detailed.hitTimeout) {
			this._logService.warn(`[EditArcReporter] Detailed diff timed out for ${state.resource.fsPath}`);
			return false;
		}
		await this._applyEdit(state, { replacements: detailed.replacements }, currentText);
		return true;
	}

	private async _applyEdit(state: IResourceState, edit: IArcTextEdit, afterText: string): Promise<void> {
		for (const reporter of state.reporters) {
			reporter.handleEdit(edit);
		}
		state.logicalText = afterText;
	}

	private _isEnabled(): boolean {
		return this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE
			&& this._configurationService.getRootValue(platformRootSchema, AgentHostEditTelemetryEnabledConfigKey) !== false;
	}

	private _disposeAllReporters(reason: string): void {
		if (this._reporterCount > 0) {
			this._logService.info(`[EditArcReporter] Disposing ${this._reporterCount} active reporters: ${reason}`);
		}
		this._resources.clearAndDisposeAll();
		this._reporterCount = 0;
		this._retainedCharacters = 0;
	}

	async reconcileAndSample(state: IResourceState, reporter: EditArcReporter, timeDelayMs: number): Promise<void> {
		const key = extUriBiasedIgnorePathCase.getComparisonKey(state.resource);
		await this._resourceSequencer.queue(key, async () => {
			if (!this._isEnabled()) {
				reporter.dispose();
				return;
			}
			if (timeDelayMs !== 0 && !await this._reconcileFromDisk(state, true)) {
				return;
			}
			await reporter.emit(timeDelayMs);
		});
	}
}

class EditArcReporter extends Disposable {
	private readonly _tracker: EditArcTracker;
	private readonly _uniqueEditId = generateUuid();
	private readonly _initialBranch: Promise<string | undefined>;
	private _sampleIndex = 0;

	constructor(
		private readonly _params: IEditArcReporterLaunchParams,
		private readonly _sampleScheduleMs: readonly number[],
		private readonly _gitWorkingDirectory: Promise<URI>,
		private readonly _gitService: IAgentHostGitService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _logService: ILogService,
		private readonly _sample: (timeDelayMs: number) => Promise<void>,
		onDispose: () => void,
	) {
		super();
		this._tracker = new EditArcTracker(_params.beforeText, _params.initialEdit);
		this._initialBranch = this._getCurrentBranchName();
		this._register(toDisposable(onDispose));
		this._scheduleNext();
	}

	handleEdit(edit: IArcTextEdit): void {
		this._tracker.handleEdits(edit);
	}

	private _scheduleNext(): void {
		if (this._store.isDisposed) {
			return;
		}
		if (this._sampleIndex >= this._sampleScheduleMs.length) {
			this.dispose();
			return;
		}
		const delay = Math.max(0, this._params.completionTime + this._sampleScheduleMs[this._sampleIndex] - Date.now());
		const timer = this._register(new TimeoutTimer());
		timer.setIfNotSet(async () => {
			const timeDelayMs = this._sampleScheduleMs[this._sampleIndex++];
			try {
				await this._sample(timeDelayMs);
			} catch (error) {
				this._logService.warn(`[EditArcReporter] Failed to sample ${this._params.filePath} after ${timeDelayMs}ms`, error);
			} finally {
				this._scheduleNext();
			}
		}, delay);
	}

	async emit(timeDelayMs: number): Promise<void> {
		const sessionUri = isAhpChatChannel(this._params.sessionUri) ? parseRequiredSessionUriFromChatUri(this._params.sessionUri) : this._params.sessionUri;
		const provider = AgentSession.provider(sessionUri) ?? 'unknown';
		const originalLineCounts = new EditArcTracker(this._params.beforeText, this._params.initialEdit).getLineCountInfo();
		const currentLineCounts = this._tracker.getLineCountInfo();
		const event: IAgentHostEditArcTelemetryEvent = {
			...toInitiatorTelemetry(this._params.clientContext),
			sourceKeyCleaned: 'source:Chat.applyEdits',
			extensionId: undefined,
			extensionVersion: undefined,
			opportunityId: undefined,
			editSessionId: AgentSession.id(sessionUri),
			requestId: this._params.turnId,
			modelId: this._params.modelId,
			languageId: undefined,
			mode: this._params.mode,
			uniqueEditId: this._uniqueEditId,
			provider,
			agentSessionId: AgentSession.id(sessionUri),
			isSubagentSession: isSubagentChatUri(this._params.sessionUri) || isSubagentSession(sessionUri) ? 'true' : 'false',
			didBranchChange: await this._initialBranch === await this._getCurrentBranchName() ? 0 : 1,
			timeDelayMs,
			originalCharCount: this._tracker.getOriginalCharacterCount(),
			originalLineCount: originalLineCounts.insertedLineCounts,
			originalDeletedLineCount: originalLineCounts.deletedLineCounts,
			arc: this._tracker.getAcceptedRestrainedCharactersCount(),
			currentLineCount: currentLineCounts.insertedLineCounts,
			currentDeletedLineCount: currentLineCounts.deletedLineCounts,
		};
		this._telemetryService.publicLog2<IAgentHostEditArcTelemetryEvent, IAgentHostEditArcTelemetryClassification>('editTelemetry.reportEditArc', event);
		if (provider === 'copilotcli' && isAgentHostTelemetryService(this._telemetryService)) {
			const {
				didBranchChange,
				timeDelayMs: delay,
				originalCharCount,
				originalLineCount,
				originalDeletedLineCount,
				arc,
				currentLineCount,
				currentDeletedLineCount,
				initiatorClientType: _,
				initiatorConnectionKind: _2,
				initiatorTransportKind: _3,
				hostLaunchKind: _4,
				initiatorMachineId: _5,
				initiatorDevDeviceId: _6,
				...properties
			} = event;
			const telemetry = this._telemetryService as IAgentHostTelemetryService;
			telemetry.sendGHTelemetryEvent('vscode.editTelemetry.reportEditArc', withoutUndefined(properties), {
				didBranchChange,
				timeDelayMs: delay,
				originalCharCount,
				originalLineCount,
				originalDeletedLineCount,
				arc,
				currentLineCount,
				currentDeletedLineCount,
			});
		}
		if (timeDelayMs === this._sampleScheduleMs.at(-1)) {
			this.dispose();
		}
	}

	private async _getCurrentBranchName(): Promise<string | undefined> {
		const workingDirectory = await this._gitWorkingDirectory;
		return this._gitService.getCurrentBranchName?.(workingDirectory) ?? this._gitService.getCurrentBranch(workingDirectory);
	}
}

function withoutUndefined(values: Record<string, string | undefined>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(values)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}
