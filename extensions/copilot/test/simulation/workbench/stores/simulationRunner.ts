/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from 'electron';
import * as fs from 'fs';
import minimist from 'minimist';
import * as mobx from 'mobx';
import * as path from 'path';
import { Result } from '../../../../src/util/common/result';
import { AsyncIterableObject } from '../../../../src/util/vs/base/common/async';
import { CancellationTokenSource } from '../../../../src/util/vs/base/common/cancellation';
import { Disposable } from '../../../../src/util/vs/base/common/lifecycle';
import { IInitialTestSummaryOutput, OutputType, RunOutput, SIMULATION_FOLDER_NAME, STDOUT_FILENAME, generateOutputFolderName } from '../../shared/sharedTypes';
import { spawnSimulationFromMainProcess } from '../utils/simulationExec';
import { ObservablePromise, REPO_ROOT } from '../utils/utils';
import { CacheMode, RunnerOptions } from './runnerOptions';
import { RunnerTestStatus } from './runnerTestStatus';
import { SimulationStorage, SimulationStorageValue } from './simulationStorage';
import { TestRun } from './testRun';

const SIMULATION_FOLDER_PATH = path.join(REPO_ROOT, SIMULATION_FOLDER_NAME);

export interface RunConfig {
	grep: string;
	cacheMode: CacheMode;
	n: number;
	noFetch: boolean;
	additionalArgs: string;
	/** NES external scenarios path. When set, `--nes=external` and `--external-scenarios` are added. */
	nesExternalScenariosPath?: string;
}

export const enum StateKind {
	Initializing,
	Running,
	Stopped
}

type State =
	| { kind: StateKind.Initializing }
	| { kind: StateKind.Running }
	| { kind: StateKind.Stopped };

/** Constructors for {@link State} discriminated union */
const State = {
	Initializing: () => ({ kind: StateKind.Initializing }),
	Running: () => ({ kind: StateKind.Running }),
	Stopped: () => ({ kind: StateKind.Stopped }),
};

export class TestRuns {
	constructor(
		public readonly name: string,
		public readonly runs: TestRun[],
		public readonly simulationInputPath?: string,
		public activeEditorLanguageId?: string,
	) { }
}

class DeserialisedTestRuns {

	constructor(
		public readonly name: string,
		public readonly expectedRuns: number,
		public readonly runs: TestRun[] = []
	) { }

	public addRun(run: TestRun) {
		this.runs.push(run);
		this.runs.sort((a, b) => {
			return (a.runNumber ?? 0) - (b.runNumber ?? 0);
		});
	}
}

export class SimulationRunner extends Disposable {

	public static async readFromPreviousRun(outputFolderName: string): Promise<TestRuns[]> {
		const outputFolder = path.join(SIMULATION_FOLDER_PATH, outputFolderName);
		const stdoutFilePath = path.join(outputFolder, STDOUT_FILENAME);
		return SimulationRunner.readFromStdoutJSON(stdoutFilePath);
	}

	public static async readFromStdoutJSON(stdoutFilePath: string, simulationInputPath?: string): Promise<TestRuns[]> {
		const entries = JSON.parse(await fs.promises.readFile(stdoutFilePath, 'utf8')) as RunOutput[];
		const testRuns = SimulationRunner.createFromRunOutput(stdoutFilePath, entries);
		return testRuns.map(tr => new TestRuns(tr.name, tr.runs));
	}

	public static createFromRunOutput(stdoutFilePath: string, runOutput: RunOutput[],): DeserialisedTestRuns[] {
		const summaryEntry = findInitialTestSummary(runOutput);
		const nRuns = summaryEntry?.nRuns ?? 1;
		const allTestRuns = new Map<string, DeserialisedTestRuns>();
		for (const entry of runOutput) {
			if (entry.type !== OutputType.testRunEnd) {
				continue;
			}
			let testRuns = allTestRuns.get(entry.name);
			if (!testRuns) {
				testRuns = new DeserialisedTestRuns(entry.name, nRuns);
				allTestRuns.set(entry.name, testRuns);
			}

			testRuns.addRun(new TestRun(
				entry.runNumber,
				entry.pass,
				entry.explicitScore,
				entry.error,
				entry.duration,
				path.dirname(stdoutFilePath),
				entry.writtenFiles,
				entry.averageRequestDuration,
				entry.requestCount,
				entry.hasCacheMiss,
				entry.annotations,
			));
		}
		return Array.from(allTestRuns.values());
	}

	private _selectedRun: SelectedRun;
	private _diskSelectedRun: DiskSelectedRun;
	private _simulationExecutor: SimulationExecutor;

	@mobx.computed
	public get selectedRun(): string {
		return this._selectedRun.name;
	}

	@mobx.computed
	public get state(): State {
		return this._simulationExecutor.state;
	}

	@mobx.computed
	public get maybeTestStatus(): Result<readonly RunnerTestStatus[], Error> {
		return (
			this._selectedRun.isFromDisk
				? this._diskSelectedRun.testStatus
				: this._simulationExecutor.testStatus
		);
	}

	@mobx.computed
	public get testStatus(): readonly RunnerTestStatus[] {
		if (this.maybeTestStatus.isOk()) {
			return this.maybeTestStatus.val;
		}
		return [];
	}

	@mobx.computed
	public get terminationReason(): string | undefined {
		return (
			this._selectedRun.isFromDisk
				? this._diskSelectedRun.terminationReason
				: this._simulationExecutor.terminationReason
		);
	}

	constructor(storage: SimulationStorage, private readonly runnerOptions: RunnerOptions) {
		super();

		// TODO: add support for init args (parseInitEventArgs)
		this._selectedRun = new SelectedRun(storage);
		this._diskSelectedRun = new DiskSelectedRun(this._selectedRun);
		this._simulationExecutor = new SimulationExecutor(this._selectedRun);

		mobx.makeObservable(this);
	}

	public setSelectedRunFromDisk(name: string) {
		mobx.runInAction(() => {
			this._selectedRun.set(name, true);
		});
	}

	public startRunningFromRunnerOptions(): Result<string, 'AlreadyRunning'> {
		return this._simulationExecutor.startRunning({
			grep: this.runnerOptions.grep.value,
			cacheMode: this.runnerOptions.cacheMode.value,
			n: parseInt(this.runnerOptions.n.value),
			noFetch: this.runnerOptions.noFetch.value,
			additionalArgs: this.runnerOptions.additionalArgs.value,
		});
	}

	public startRunning(runConfig: RunConfig): Result<string, 'AlreadyRunning'> {
		return this._simulationExecutor.startRunning(runConfig);
	}

	public stopRunning(): void {
		this._simulationExecutor.stopRunning();
	}

	public async renameRun(oldName: string, newName: string): Promise<boolean> {
		if (oldName === '' || newName === '') {
			console.log('Cannot rename: old or new name is empty', { oldName, newName });
			return false;
		}

		const oldPath = path.join(SIMULATION_FOLDER_PATH, oldName);
		const newPath = path.join(SIMULATION_FOLDER_PATH, newName);

		try {
			// Check if old path exists and new path doesn't
			const oldExists = await fs.promises.stat(oldPath).then(() => true).catch(() => false);
			const newExists = await fs.promises.stat(newPath).then(() => true).catch(() => false);

			if (!oldExists) {
				console.log('Cannot rename: old path does not exist', oldPath);
				return false;
			}
			if (newExists) {
				console.log('Cannot rename: new path already exists', newPath);
				return false;
			}

			// Rename the directory
			console.log('Renaming directory from', oldPath, 'to', newPath);
			await fs.promises.rename(oldPath, newPath);
			console.log('Successfully renamed directory');

			// Update selected run if it was the renamed one
			if (this._selectedRun.name === oldName) {
				console.log('Updating selected run name from', oldName, 'to', newName);
				mobx.runInAction(() => {
					this._selectedRun.set(newName, true);
				});
			}

			return true;
		} catch (e) {
			console.error('Failed to rename run:', e);
			return false;
		}
	}
}

class SelectedRun {
	private _name: SimulationStorageValue<string>;

	@mobx.observable
	public isFromDisk: boolean = true;

	@mobx.computed
	public get name(): string {
		return this._name.value;
	}

	constructor(storage: SimulationStorage) {
		// TODO: add support for init args (parseInitEventArgs)
		this._name = new SimulationStorageValue(storage, 'selectedRun', '');

		mobx.makeObservable(this);
	}

	/**
	 * Should be called in a MobX action.
	 */
	set(name: string, isFromDisk: boolean): void {
		this._name.value = name;
		this.isFromDisk = isFromDisk;
	}
}

class DiskSelectedRun {

	@mobx.computed
	public get runOutput(): ObservablePromise<Result<RunOutput[], Error>> {
		return new ObservablePromise((async () => {
			if (!this._selectedRun.isFromDisk) {
				return Result.fromString(`This run is not from disk!`);
			}
			if (this._selectedRun.name === '') {
				return Result.ok([]);
			}
			const outputFolderPath = path.join(SIMULATION_FOLDER_PATH, this._selectedRun.name);
			const stdoutFile = path.join(outputFolderPath, STDOUT_FILENAME);
			try {
				const stdoutFileContents = await fs.promises.readFile(stdoutFile, 'utf8');
				return Result.ok(JSON.parse(stdoutFileContents) as RunOutput[]);
			} catch (e) {
				return Result.error(e);
			}
		})(), Result.ok([]));
	}

	@mobx.computed
	public get testStatus(): Result<readonly RunnerTestStatus[], Error> {

		if (!this._selectedRun.isFromDisk) {
			return Result.fromString(`This run is not from disk!`);
		}

		if (!this.runOutput.value.isOk()) {
			return this.runOutput.value;
		}

		const entries = this.runOutput.value.val;
		for (const entry of entries) {
			if (entry.type === OutputType.terminated) {
				return Result.fromString(`Terminated: ${entry.reason}`);
			}
		}

		const outputFolderPath = path.join(SIMULATION_FOLDER_PATH, this._selectedRun.name);
		const stdoutFilePath = path.join(outputFolderPath, STDOUT_FILENAME);
		const testRuns = SimulationRunner.createFromRunOutput(stdoutFilePath, entries);
		const testStatus = testRuns.map(tr => new RunnerTestStatus(tr.name, tr.expectedRuns, tr.runs));
		return Result.ok(testStatus);
	}

	@mobx.computed
	public get terminationReason(): string | undefined {
		if (!this.testStatus.isOk()) {
			return this.testStatus.err.stack;
		}
		return undefined;
	}

	constructor(
		private readonly _selectedRun: SelectedRun
	) {
		mobx.makeObservable(this);
	}
}

class SimulationExecutor {

	private currentCancellationTokenSource: CancellationTokenSource | undefined;

	@mobx.observable
	public state: State = State.Initializing();

	@mobx.observable
	public terminationReason: string | undefined = undefined;

	@mobx.observable
	public runningTestStatus: Map<string, RunnerTestStatus> = new Map<string, RunnerTestStatus>();

	/** Tests registered for the current run via `initialTestSummary`. Used to scope incompleteness checks. */
	private currentRunTests: Set<string> = new Set();

	@mobx.computed
	public get testStatus(): Result<readonly RunnerTestStatus[], Error> {
		return Result.ok(Array.from(this.runningTestStatus.values()));
	}

	constructor(
		private readonly _selectedRun: SelectedRun
	) {
		mobx.makeObservable(this);
	}

	public startRunning(runConfig: RunConfig): Result<string, 'AlreadyRunning'> {
		if (this.state.kind === StateKind.Running) {
			return Result.error('AlreadyRunning');
		}
		const isNesExternal = !!runConfig.nesExternalScenariosPath;
		const outputFolder = path.join(REPO_ROOT, SIMULATION_FOLDER_NAME, generateOutputFolderName(isNesExternal ? 'external' : undefined));
		const stdoutFile = path.join(outputFolder, STDOUT_FILENAME);

		this.currentCancellationTokenSource = new CancellationTokenSource();
		mobx.runInAction(() => {
			this.state = State.Running();
			this.terminationReason = undefined;
			this.currentRunTests = new Set();
			this._selectedRun.set(path.basename(outputFolder), false);
		});

		const args: string[] = ['--json'];
		if (runConfig.grep) {
			args.push(`--grep=${runConfig.grep}`);
		}
		switch (runConfig.cacheMode) {
			case CacheMode.Disable:
				args.push(`--skip-cache`);
				break;
			case CacheMode.Regenerate:
				args.push(`--regenerate-cache`);
				break;
			case CacheMode.Require:
				args.push(`--require-cache`);
				break;
		}
		if (runConfig.n) {
			args.push(`--n=${runConfig.n}`);
		}
		if (runConfig.noFetch) {
			args.push(`--no-fetch`);
		}
		args.push(`--output=${outputFolder}`);
		if (runConfig.nesExternalScenariosPath) {
			args.push(`--nes=external`);
			args.push(`--external-scenarios=${runConfig.nesExternalScenariosPath}`);
		}
		Object.entries(minimist(runConfig.additionalArgs.split(' '))).filter(([k]) => k !== '_' && k !== '--').forEach(([k, v]) => {
			args.push(v !== undefined ? `--${k}=${v}` : `--${k}`);
		});
		const stream = spawnSimulationFromMainProcess<RunOutput>({ args }, this.currentCancellationTokenSource.token);
		this.interpretOutput(stream, stdoutFile);

		return Result.ok(outputFolder);
	}

	public stopRunning(): void {
		if (this.state.kind !== StateKind.Running) {
			return;
		}
		if (this.currentCancellationTokenSource === undefined) {
			console.warn('currentCancellationTokenSource is undefined');
			return;
		}
		try { this.currentCancellationTokenSource!.cancel(); } catch (_) { } // to avoid unhandled promise rejection
		mobx.runInAction(() => {
			this.state = State.Stopped();
			for (const [_, status] of this.runningTestStatus) {
				if (status.runs.length < status.expectedRuns) {
					status.isCancelled = true;
				}
			}
		});
		this.currentCancellationTokenSource = undefined;
	}

	private async interpretOutput(stream: AsyncIterableObject<RunOutput>, stdoutFile: string): Promise<void> {
		const writtenFilesBaseDir = path.dirname(stdoutFile);
		const entries: RunOutput[] = [];
		try {
			for await (const entry of stream) {
				entries.push(entry);
				mobx.runInAction(() => this.interpretOutputEntry(writtenFilesBaseDir, entry)); // TODO@ulugbekna: we should batch updates
			}
		} catch (e) {
			console.error('interpretOutput', JSON.stringify(e, null, '\t'));
			mobx.runInAction(() => {
				const hasIncompleteTests = this.currentRunTests.size === 0 || Array.from(this.currentRunTests).some(
					name => {
						const status = this.runningTestStatus.get(name);
						return !status || status.runs.length < status.expectedRuns;
					}
				);
				if (hasIncompleteTests) {
					this.terminationReason = typeof e === 'string' ? e : e instanceof Error ? (e.stack ?? e.message) : String(e);
				}
				for (const [_, status] of this.runningTestStatus) {
					if (status.runs.length < status.expectedRuns) {
						status.isCancelled = true;
					}
				}
			});
		} finally {
			await fs.promises.writeFile(stdoutFile, JSON.stringify(entries, null, '\t'));
			this.currentCancellationTokenSource = undefined;
			mobx.runInAction(() => {
				this.state = State.Stopped();
			});
		}
	}

	/** @remarks MUST be called within `mobx.runInAction` */
	private interpretOutputEntry(writtenFilesBaseDir: string, entry: RunOutput): void {
		switch (entry.type) {
			case OutputType.initialTestSummary:
				for (const testName of entry.testsToRun) {
					this.currentRunTests.add(testName);
					this.runningTestStatus.set(testName, new RunnerTestStatus(testName, entry.nRuns, []));
				}
				return;
			case OutputType.testRunStart:
				this.runningTestStatus.get(entry.name)!.isNowRunning++;
				return;
			case OutputType.testRunEnd:
				this.runningTestStatus.get(entry.name)!.isNowRunning--;
				this.runningTestStatus.get(entry.name)!.addRun(new TestRun(
					entry.runNumber,
					entry.pass,
					entry.explicitScore,
					entry.error,
					entry.duration,
					writtenFilesBaseDir,
					entry.writtenFiles,
					entry.averageRequestDuration,
					entry.requestCount,
					entry.hasCacheMiss,
					entry.annotations
				));
				return;
			case OutputType.skippedTest:
				this.runningTestStatus.get(entry.name)!.isSkipped = true;
				return;
			case OutputType.terminated:
				this.terminationReason = entry.reason;
				return;
			case OutputType.deviceCodeCallback:
				ipcRenderer.send('open-link', entry.url);
				return;
		}
	}
}

function findInitialTestSummary(runOutput: RunOutput[]): IInitialTestSummaryOutput | undefined {
	for (const entry of runOutput) {
		if (entry.type === OutputType.initialTestSummary) {
			return entry;
		}
	}
	return undefined;
}
