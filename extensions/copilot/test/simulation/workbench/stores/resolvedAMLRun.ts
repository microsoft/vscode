/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as mobx from 'mobx';
import * as readline from 'readline';
import { ObservablePromise } from '../utils/utils';
import { parseScoredPredictionsCsv } from './amlResults';
import { AMLProvider, AMLRun } from './amlSimulations';
import { SimulationRunner, TestRuns } from './simulationRunner';


export class ResolvedAMLRun {

	@mobx.computed
	public get tests(): ObservablePromise<TestRuns[]> {
		const selected = this.amlProvider.selected;
		if (!selected) {
			return ObservablePromise.resolve([]);
		}
		return new ObservablePromise((async () => {
			return this.testsForRun(selected);
		})(), []);
	}

	@mobx.computed
	public get testsToCompareAgainst(): ObservablePromise<TestRuns[]> {
		const compareAgainstRun = this.amlProvider.compareAgainstRun;
		if (!compareAgainstRun) {
			return ObservablePromise.resolve([]);
		}
		return new ObservablePromise((async () => {
			return this.testsForRun(compareAgainstRun);
		})(), []);
	}

	private async testsForRun(run: AMLRun): Promise<TestRuns[]> {
		const testRuns = await SimulationRunner.readFromStdoutJSON(run.stdoutPath, run.simulationInputPath);

		if (run.scoredPredictionsJSONL) {
			const contents = await this.readContentsLineByLine(run.scoredPredictionsJSONL);
			const evals = parseScoredPredictionsCsv(run.kind, contents);

			const testRunsMap = new Map<string, TestRuns>();
			for (const testRun of testRuns) {
				testRunsMap.set(testRun.name, testRun);
			}

			for (const evaluation of evals) {
				const testRun = testRunsMap.get(evaluation.caseName);
				if (!testRun) {
					console.warn(`Could not find test run for ${evaluation.caseName}`);
					continue;
				}
				testRun.activeEditorLanguageId = evaluation.activeEditorLanguageId;
				testRun.runs.forEach((run, i) => {
					run.pass = evaluation.isEachTestRunSuccess[i];
					run.errorsOnlyInBefore = evaluation.errorsOnlyInBefore;
					run.errorsOnlyInAfter = evaluation.errorsOnlyInAfter;
					run.stdout = evaluation.stdout;
					run.stderr = evaluation.stderr;
					run.error ??= evaluation.evaluatorError;
					if (evaluation.annotations) {
						run.annotations.push(...evaluation.annotations);
					}
					run.generatedTestCaseCount = evaluation.generatedTestCaseCount;
					run.generatedAssertCount = evaluation.generatedAssertCount;
					run.expectedDiff = evaluation.expectedDiff;
				});
			}
		}

		return testRuns;
	}

	private async readContentsLineByLine(filePath: string): Promise<string[]> {
		return new Promise((resolve) => {
			const contents: string[] = [];
			const rd = readline.createInterface({
				input: fs.createReadStream(filePath)
			});
			rd.on('line', function (line) {
				contents.push(line);
			});
			rd.on('close', function () {
				resolve(contents);
			});
		});
	}

	constructor(
		private readonly amlProvider: AMLProvider
	) {
		mobx.makeObservable(this);
	}
}
