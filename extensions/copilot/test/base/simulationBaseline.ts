/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { IBaselineTestSummary } from '../simulation/shared/sharedTypes';

export class SimulationBaseline {

	private prevBaseline = new Map<string, IBaselineTestSummary>();
	private currBaseline = new Map<string, IBaselineTestSummary>();
	private currSkipped = new Set<string>();

	public get current(): IterableIterator<IBaselineTestSummary> {
		return this.currBaseline.values();
	}

	public get currentScore(): number {
		return this._computeScore(Array.from(this.currBaseline.values()));
	}

	public get overallScore(): number {
		return this._computeScore(this.testSummaries);
	}

	private _computeScore(summaries: IBaselineTestSummary[]) {
		const totalScore = summaries.reduce((acc, curr) => acc + curr.score, 0);
		return (totalScore / summaries.length) * 100;
	}

	public static DEFAULT_BASELINE_PATH = path.join(__dirname, '../test/simulation', 'baseline.json');

	public static async readFromDisk(baselinePath: string, runningAllTests: boolean): Promise<SimulationBaseline> {
		let baselineFileContents = '[]';
		try {
			baselineFileContents = (await fs.promises.readFile(baselinePath)).toString();
		} catch {
			// No baseline file exists yet, create one
			await fs.promises.writeFile(baselinePath, '[]');
		}
		const parsedBaseline = JSON.parse(baselineFileContents) as IBaselineTestSummary[];
		return new SimulationBaseline(baselinePath, parsedBaseline, runningAllTests);
	}

	constructor(
		public readonly baselinePath: string,
		parsedBaseline: IBaselineTestSummary[],
		private readonly _runningAllTests: boolean
	) {
		this.prevBaseline = new Map<string, IBaselineTestSummary>();
		parsedBaseline.forEach(el => this.prevBaseline.set(el.name, el));
	}

	public setCurrentResult(testSummary: IBaselineTestSummary): TestBaselineComparison {
		this.currBaseline.set(testSummary.name, testSummary);
		const prevBaseline = this.prevBaseline.get(testSummary.name);
		return (
			prevBaseline
				? new ExistingBaselineComparison(prevBaseline, testSummary)
				: { isNew: true }
		);
	}

	public setSkippedTest(name: string): void {
		this.currSkipped.add(name);
	}

	public async writeToDisk(pathToWriteTo?: string): Promise<void> {
		const path = pathToWriteTo ?? this.baselinePath;
		await fs.promises.writeFile(path, JSON.stringify(this.testSummaries, undefined, 2));
	}

	/**
	 * Returns a sorted array of test summaries.
	 * This also includes skipped tests as this is meant to represent the baseline.json which would be written to disk.
	 */
	private get testSummaries(): IBaselineTestSummary[] {
		const testSummaries = Array.from(this.currBaseline.values());

		// Skipped tests remain in the baseline
		for (const name of this.currSkipped) {
			const prevBaseline = this.prevBaseline.get(name);
			if (prevBaseline) {
				testSummaries.push(prevBaseline);
			}
		}

		if (!this._runningAllTests) {
			// When running a subset of tests, we will copy over the old existing test results for tests that were not executed
			const executedTests = new Set(testSummaries.map(el => el.name));
			for (const testSummary of this.prevBaseline.values()) {
				if (!executedTests.has(testSummary.name)) {
					testSummaries.push(testSummary);
				}
			}
		}

		testSummaries.sort((a, b) => a.name.localeCompare(b.name));
		return testSummaries;
	}

	public compare(): ICompleteBaselineComparison {
		const prevMandatory = new Map<string, IBaselineTestSummary>();
		const currMandatory = new Map<string, IBaselineTestSummary>();
		const prevOptional = new Map<string, IBaselineTestSummary>();
		const currOptional = new Map<string, IBaselineTestSummary>();

		for (const [_, value] of this.prevBaseline) {
			if (value.optional) {
				prevOptional.set(value.name, value);
			} else {
				prevMandatory.set(value.name, value);
			}
		}
		for (const [_, value] of this.currBaseline) {
			if (value.optional) {
				currOptional.set(value.name, value);
			} else {
				currMandatory.set(value.name, value);
			}
		}
		const mandatory = SimulationBaseline.compare(prevMandatory, currMandatory, this.currSkipped);
		const optional = SimulationBaseline.compare(prevOptional, currOptional, this.currSkipped);
		return {
			mandatory,
			optional,
			nUnchanged: mandatory.nUnchanged + optional.nUnchanged,
			nImproved: mandatory.nImproved + optional.nImproved,
			nWorsened: mandatory.nWorsened + optional.nWorsened,
			addedScenarios: mandatory.addedScenarios + optional.addedScenarios,
			removedScenarios: mandatory.removedScenarios + optional.removedScenarios,
			skippedScenarios: mandatory.skippedScenarios + optional.skippedScenarios,
			improvedScenarios: mandatory.improvedScenarios.concat(optional.improvedScenarios),
			worsenedScenarios: mandatory.worsenedScenarios.concat(optional.worsenedScenarios)
		};
	}

	private static compare(prevMap: Map<string, IBaselineTestSummary>, currMap: Map<string, IBaselineTestSummary>, currSkipped: Set<string>): IBaselineComparison {
		let nUnchanged = 0;
		let nImproved = 0;
		let nWorsened = 0;
		let addedScenarios = 0;
		let removedScenarios = 0;
		let skippedScenarios = 0;
		const improvedScenarios: IModifiedScenario[] = [];
		const worsenedScenarios: IModifiedScenario[] = [];

		for (const [_, curr] of currMap) {
			const prev = prevMap.get(curr.name);
			if (prev) {
				const comparison = new ExistingBaselineComparison(prev, curr);
				if (comparison.isImproved) {
					nImproved++;
					improvedScenarios.push({ prevScore: prev.score, currScore: curr.score, name: curr.name });
				} else if (comparison.isWorsened) {
					nWorsened++;
					worsenedScenarios.push({ prevScore: prev.score, currScore: curr.score, name: curr.name });
				} else {
					nUnchanged++;
				}
			} else {
				addedScenarios++;
			}
		}

		for (const [_, prev] of prevMap) {
			if (!currMap.has(prev.name)) {
				if (currSkipped.has(prev.name)) {
					// this test is missing but it was skipped intentionally
					skippedScenarios++;
				} else {
					removedScenarios++;
				}
			}
		}

		return { nUnchanged, nImproved, nWorsened, addedScenarios, removedScenarios, skippedScenarios, improvedScenarios, worsenedScenarios };
	}

	public clear() {
		this.currBaseline.clear();
		this.currSkipped.clear();
	}
}

export interface IBaselineComparison {
	nUnchanged: number;
	nImproved: number;
	nWorsened: number;
	addedScenarios: number;
	removedScenarios: number;
	skippedScenarios: number;
	improvedScenarios: IModifiedScenario[];
	worsenedScenarios: IModifiedScenario[];
}

export interface IModifiedScenario {
	name: string;
	prevScore: number;
	currScore: number;
}

export interface ICompleteBaselineComparison extends IBaselineComparison {
	mandatory: IBaselineComparison;
	optional: IBaselineComparison;
}

export type TestBaselineComparison = (
	{ isNew: true }
	| { isNew: false; isImproved: boolean; isWorsened: boolean; isUnchanged: boolean; prevScore: number; currScore: number }
);

export class ExistingBaselineComparison {
	public readonly isNew = false;
	public readonly isImproved: boolean;
	public readonly isWorsened: boolean;
	public readonly isUnchanged: boolean;

	public readonly prevScore: number;
	public readonly currScore: number;

	constructor(
		prev: IBaselineTestSummary,
		curr: IBaselineTestSummary,
	) {
		this.prevScore = prev.score;
		const prevN = prev.passCount + prev.failCount;
		this.currScore = curr.score;
		const currN = curr.passCount + curr.failCount;

		const prevPassCount = Math.round(this.prevScore * prevN);
		const currPassCount = Math.round(this.currScore * currN);

		// Here we want to mark a change only if this is clearly a change also when the `prevN` would equal `currN`
		let prevMinScore = this.prevScore;
		let prevMaxScore = this.prevScore;
		let currMinScore = this.currScore;
		let currMaxScore = this.currScore;

		if (prevN > currN) {
			// We are now running less iterations than before
			currMinScore = currPassCount / prevN;
			currMaxScore = (currPassCount + (prevN - currN)) / prevN;
		} else if (prevN < currN) {
			// We are now running more iterations than before
			prevMinScore = prevPassCount / currN;
			prevMaxScore = (prevPassCount + (currN - prevN)) / currN;
		}

		if (currMinScore > prevMaxScore) {
			this.isImproved = true;
			this.isWorsened = false;
			this.isUnchanged = false;
		} else if (currMaxScore < prevMinScore) {
			this.isImproved = false;
			this.isWorsened = true;
			this.isUnchanged = false;
		} else {
			this.isImproved = false;
			this.isWorsened = false;
			this.isUnchanged = true;
		}
	}
}
