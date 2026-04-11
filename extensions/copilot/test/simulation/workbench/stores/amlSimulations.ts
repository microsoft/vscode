/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import * as path from 'path';
import { RunOnceScheduler } from '../../../../src/util/vs/base/common/async';
import { Disposable, toDisposable } from '../../../../src/util/vs/base/common/lifecycle';
import { AML_OUTPUT_PATH, STDOUT_FILENAME } from '../../shared/sharedTypes';
import { REPO_ROOT } from '../utils/utils';
import { SimulationStorage, SimulationStorageValue } from './simulationStorage';

const AML_OUTPUT_FOLDER_PATH = path.join(REPO_ROOT, AML_OUTPUT_PATH);

export enum AMLRunKind {
	Fix = 'fix',
	Doc = 'doc',
	WorkspaceE2E = 'workspace-e2e',
	TestGen = 'test_gen',
	MethodGen = 'method_gen',
	EditFix = 'edit_fix',
	Unknown = 'unknown',
	Swebench = 'swebench',
	FixTestFailure = 'fix_test_failure',
	HumanEval = 'human_eval',
	SafetyPrompt = 'safety_prompt',
}

function pathIfExists(filePath: string): string | undefined {
	return fs.existsSync(filePath) ? filePath : undefined;
}

export class AMLRun {

	public readonly scoreCardCsvPath: string | undefined;
	public readonly scoreCardByLanguageJsonPath: string | undefined;
	public readonly scoredPredictionsJSONL: string | undefined;
	public readonly simulationInputPath: string;

	constructor(
		public readonly kind: AMLRunKind,
		public readonly name: string,
		public readonly runPath: string,
		public readonly stat: fs.Stats,
		public readonly stdoutPath: string,
	) {
		this.scoreCardCsvPath = kind !== 'unknown' ? pathIfExists(path.join(runPath, `eval/${kind}_scorecard.csv`)) : undefined;
		this.scoreCardByLanguageJsonPath = pathIfExists(path.join(runPath, `eval/metric_scorecard_by_language.json`));

		this.scoredPredictionsJSONL = kind !== 'unknown' ? pathIfExists(path.join(runPath, `eval/${kind}_scored_predictions.jsonl`)) : undefined;
		this.simulationInputPath = path.join(runPath, 'simulate', 'simulator_input');
	}
}

/**
 * Detects possible AML runs
 */
export class AMLProvider extends Disposable {

	private readonly _updateSoon = this._register(new RunOnceScheduler(() => this._update(), 50));

	@mobx.observable
	public runs: AMLRun[] = [];

	@mobx.observable
	public selectedName: SimulationStorageValue<string>;

	@mobx.observable
	public compareAgainstRunName: SimulationStorageValue<string>;

	@mobx.computed
	public get selected(): AMLRun | undefined {
		return this.runs.find(r => r.name === this.selectedName.value);
	}

	@mobx.computed
	public get compareAgainstRun(): AMLRun | undefined {
		return this.runs.find(r => r.name === this.compareAgainstRunName.value);
	}

	constructor(storage: SimulationStorage) {
		super();

		this.selectedName = new SimulationStorageValue(storage, 'selectedAML', '');
		this.compareAgainstRunName = new SimulationStorageValue(storage, 'compareAgainstAML', '');

		mobx.makeObservable(this);

		const listener = () => {
			if (!this._updateSoon.isScheduled()) {
				this._updateSoon.schedule();
			}
		};

		fs.promises.mkdir(AML_OUTPUT_FOLDER_PATH, { recursive: true }).then(() => {
			fs.watch(AML_OUTPUT_FOLDER_PATH, { recursive: false }, listener);
			this._register(toDisposable(() => fs.unwatchFile(AML_OUTPUT_FOLDER_PATH, listener)));
			this._update();
		});
	}

	private async _update(): Promise<void> {
		const amlOutputFolders = await fs.promises.readdir(AML_OUTPUT_FOLDER_PATH);
		const rawEntries = await Promise.all(
			amlOutputFolders.map(async (entry) => {
				const entryPath = path.join(AML_OUTPUT_FOLDER_PATH, entry);
				const stat = await fs.promises.stat(entryPath);
				const stdoutPath = path.join(entryPath, 'simulate', 'simulator_output_dir', 'simulator_output', STDOUT_FILENAME);
				try {
					const stdoutStat = await fs.promises.stat(stdoutPath);
					if (!stdoutStat.isFile()) {
						return undefined;
					}
				} catch (err) {
					// stdout does not exist
					return undefined;
				}
				const kind = await AMLProvider.determineKind(entryPath);
				return new AMLRun(kind, entry, entryPath, stat, stdoutPath);
			})
		);

		let entries = rawEntries.filter((entry): entry is AMLRun => !!entry);
		entries = entries.filter(({ stat }) => stat.isDirectory());
		entries.sort((a, b) => b.stat.ctimeMs - a.stat.ctimeMs);

		mobx.runInAction(() => {
			this.runs = entries;

			// if no run is selected, pre-select first output folder
			if (this.runs.length > 0 && !this.selected) {
				this.selectedName.value = this.runs[0].name;
			}
		});
	}

	/**
	 * Determines the kind (fix/doc/workspace-e2e/etc) of an AML run based on job_parameters.json.
	 * @param amlRunPath - The path to the AML run directory.
	 * @returns The kind of AML run.
	 */
	private static async determineKind(amlRunPath: string): Promise<AMLRunKind> {

		const defaultKind = AMLRunKind.Unknown;
		const jobParametersPath = path.join(amlRunPath, 'simulate', 'simulator_output_dir', 'simulator_output', 'job_parameters.json');
		try {
			const file = await fs.promises.readFile(jobParametersPath);
			const jobParameters = JSON.parse(file.toString());
			if (Object.values(AMLRunKind).includes(jobParameters.dataset)) {
				return jobParameters.dataset as AMLRunKind;
			}

			console.error(`Unknown AML run kind: ${jobParameters.dataset}; considering it as 'unknown'`);
		} catch (err) {
			console.error(`Error determining AML run kind: Unable to read ${jobParametersPath}`);
		}
		return defaultKind;
	}
}
