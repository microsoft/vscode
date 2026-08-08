/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';
import { Disposable } from '../../../../src/util/vs/base/common/lifecycle';
import { IBaselineTestSummary } from '../../shared/sharedTypes';
import { EvaluationError } from './amlResults';
import { AMLProvider } from './amlSimulations';
import { BaselineJSONProvider } from './baselineJSONProvider';
import { DetectedTests } from './detectedTests';
import { NesExternalOptions } from './nesExternalOptions';
import { ResolvedAMLRun } from './resolvedAMLRun';
import { ResolvedSimulationRun } from './resolvedSimulationRun';
import { RunnerTestStatus } from './runnerTestStatus';
import { SimulationRunsProvider } from './simulationBaseline';
import { SimulationRunner, TestRuns } from './simulationRunner';
import { TestSource, TestSourceValue } from './testSource';

export interface ISimulationTest {
	name: string;
	suiteName: string;
	baselineJSON: IBaselineTestSummary | undefined;
	baseline: TestRuns | undefined;
	/** `runnerStatus` is undefined when the test hasn't been run  */
	runnerStatus: RunnerTestStatus | undefined;
	activeEditorLangId?: string;
	errorsOnlyInBefore?: EvaluationError[];
	errorsOnlyInAfter?: EvaluationError[];
	simulationInputPath?: string;
}

export class SimulationTestsProvider extends Disposable {

	private readonly detectedTests: DetectedTests;
	private readonly nesDetectedTests: DetectedTests;
	private readonly resolvedBaseline: ResolvedSimulationRun;
	private readonly resolvedAMLRun: ResolvedAMLRun;

	readonly baselineJSONProvider: BaselineJSONProvider;

	@mobx.observable
	public comparedBaselineJSON: 'workingTreeBaselineJSON' | 'beforeRunBaselineJSON' = 'workingTreeBaselineJSON';

	@mobx.computed
	public get allLanguageIds(): readonly string[] {
		const res = new Set<string>();
		for (const test of this.tests) {
			if (test.activeEditorLangId) {
				res.add(test.activeEditorLangId);
			}
		}
		return [...res];
	}

	@mobx.computed
	public get tests(): readonly ISimulationTest[] {
		switch (this.testSource.value) {
			case TestSource.External: {
				const runs = this.resolvedAMLRun.tests;
				const compareAgainstRun = this.resolvedAMLRun.testsToCompareAgainst;

				const compareAgainstRunMap = new Map<string /* test name */, TestRuns>();
				compareAgainstRun.value.forEach(testRun => compareAgainstRunMap.set(testRun.name, testRun));

				return runs.value.map((el): ISimulationTest => {
					const runnerStatus = new RunnerTestStatus(el.name, el.runs.length, el.runs, 0);
					return {
						name: el.name,
						suiteName: '',
						baselineJSON: undefined,
						baseline: compareAgainstRunMap.get(el.name),
						runnerStatus,
						activeEditorLangId: el.activeEditorLanguageId,
						errorsOnlyInBefore: el.runs[el.runs.length - 1].errorsOnlyInBefore,
						errorsOnlyInAfter: el.runs[el.runs.length - 1].errorsOnlyInAfter,
						simulationInputPath: el.simulationInputPath
					};
				});
			}
			case TestSource.NesExternal: {
				const nesTests = this.nesDetectedTests.tests;
				const baselineRunsArr = this.resolvedBaseline.runs.value;
				const statusArr = this.runner.testStatus;

				const baselineRunsMap = new Map<string, TestRuns>();
				for (const el of baselineRunsArr) {
					baselineRunsMap.set(el.name, el);
				}

				const statusMap = new Map<string, RunnerTestStatus>();
				for (const el of statusArr) {
					statusMap.set(el.name, el);
				}

				return nesTests.map((el): ISimulationTest => ({
					name: el.name,
					suiteName: el.suiteName,
					baselineJSON: undefined,
					baseline: baselineRunsMap.get(el.name),
					runnerStatus: statusMap.get(el.name),
				}));
			}
			case TestSource.Local: {
				const detectedTests = this.detectedTests.tests;
				const baselineJSONArr = this.comparedBaselineJSON === 'beforeRunBaselineJSON'
					? this.baselineJSONProvider.baselineJSONBeforeCurrentRun
					: this.baselineJSONProvider.workingTreeBaselineJSON;
				const baselineRunsArr = this.resolvedBaseline.runs.value;
				const statusArr = this.runner.testStatus;

				const baselineJSONMap = new Map<string, IBaselineTestSummary>();
				for (const el of baselineJSONArr) {
					baselineJSONMap.set(el.name, el);
				}

				const baselineRunsMap = new Map<string, TestRuns>();
				for (const el of baselineRunsArr) {
					baselineRunsMap.set(el.name, el);
				}

				const statusMap = new Map<string, RunnerTestStatus>();
				for (const el of statusArr) {
					statusMap.set(el.name, el);
				}

				return detectedTests.map((el): ISimulationTest => ({
					name: el.name,
					suiteName: el.suiteName,
					baselineJSON: baselineJSONMap.get(el.name),
					baseline: baselineRunsMap.get(el.name),
					runnerStatus: statusMap.get(el.name),
				}));
			}
		}
	}

	constructor(
		public readonly testSource: TestSourceValue,
		private readonly runner: SimulationRunner,
		baselineProvider: SimulationRunsProvider,
		amlProvider: AMLProvider,
		nesExternalOptions: NesExternalOptions,
	) {
		super();

		mobx.makeObservable(this);

		this.detectedTests = this._register(new DetectedTests());
		this.nesDetectedTests = this._register(new DetectedTests(() => {
			const scenariosPath = nesExternalOptions.externalScenariosPath.value;
			if (!scenariosPath) {
				return [];
			}
			const devNull = process.platform === 'win32' ? 'NUL' : '/dev/null';
			return ['--nes=external', `--external-scenarios=${scenariosPath}`, `--output=${devNull}`];
		}));
		this.baselineJSONProvider = this._register(new BaselineJSONProvider(runner));
		this.resolvedBaseline = new ResolvedSimulationRun(baselineProvider);
		this.resolvedAMLRun = new ResolvedAMLRun(amlProvider);
	}
}
