/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { SimpleRPC } from '../../src/extension/onboardDebug/node/copilotDebugWorker/rpc';
import { createServiceIdentifier } from '../../src/util/common/services';
import { ITestRunResult } from '../testExecutor';
import { SimulationTest, toDirname } from './stest';


export const ISimulationOutcome = createServiceIdentifier<ISimulationOutcome>('ISimulationOutcome');

export interface ISimulationOutcome {
	readonly _serviceBrand: undefined;
	get(test: SimulationTest): Promise<OutcomeEntry | undefined>;
	set(test: SimulationTest, results: ITestRunResult[]): Promise<void>;
}

type TestSubset = Pick<SimulationTest, 'outcomeCategory' | 'fullName'>;

export class ProxiedSimulationOutcome implements ISimulationOutcome {

	declare readonly _serviceBrand: undefined;

	public static registerTo(instance: ISimulationOutcome, rpc: SimpleRPC): ISimulationOutcome {
		rpc.registerMethod('ProxiedSimulationOutcome.get', (test) => instance.get(test));
		rpc.registerMethod('ProxiedSimulationOutcome.set', ({ test, results }) => instance.set(test, results));
		return instance;
	}

	constructor(
		private readonly rpc: SimpleRPC,
	) {
	}

	get(test: TestSubset): Promise<OutcomeEntry | undefined> {
		return this.rpc.callMethod('ProxiedSimulationOutcome.get', { fullName: test.fullName, outcomeCategory: test.outcomeCategory } satisfies TestSubset);
	}

	set(test: TestSubset, results: ITestRunResult[]): Promise<void> {
		return this.rpc.callMethod('ProxiedSimulationOutcome.set', { test: { fullName: test.fullName, outcomeCategory: test.outcomeCategory } satisfies TestSubset, results });
	}
}

export const outcomePath = path.join(__dirname, '../test/outcome');

export class SimulationOutcomeImpl implements ISimulationOutcome {

	declare readonly _serviceBrand: undefined;

	private readonly outcome: Map<string, OutcomeEntry[]> = new Map();

	constructor(
		private readonly _runningAllTests: boolean
	) {
	}

	async get(test: TestSubset): Promise<OutcomeEntry | undefined> {
		const filePath = path.join(outcomePath, this._getCategoryFilename(test.outcomeCategory));
		const entriesBuffer = await fs.promises.readFile(filePath, 'utf8');
		const entries = JSON.parse(entriesBuffer) as OutcomeEntry[];
		return entries.find(entry => entry.name === test.fullName);
	}

	set(test: TestSubset, results: ITestRunResult[]): Promise<void> {
		const requestsSet = new Set<string>();
		for (const testRun of results) {
			for (const cacheInfo of testRun.cacheInfo) {
				if (cacheInfo.type === 'request') {
					requestsSet.add(cacheInfo.key);
				}
			}
		}

		const requests = Array.from(requestsSet).sort();

		let entries: OutcomeEntry[];
		if (!this.outcome.has(test.outcomeCategory)) {
			entries = [];
			this.outcome.set(test.outcomeCategory, entries);
		} else {
			entries = this.outcome.get(test.outcomeCategory)!;
		}

		entries.push({
			name: test.fullName,
			requests
		});

		return Promise.resolve();
	}

	public async write(): Promise<void> {
		for (const [category, entries] of this.outcome) {
			// When running a subset of tests, we will copy over the old existing test results for tests that were not executed
			const filePath = path.join(outcomePath, this._getCategoryFilename(category));

			if (!this._runningAllTests) {
				let prevEntriesBuffer: string | undefined;
				try {
					prevEntriesBuffer = await fs.promises.readFile(filePath, 'utf8');
				} catch (err) {
				}
				if (prevEntriesBuffer) {
					try {
						const prevEntries: OutcomeEntry[] = JSON.parse(prevEntriesBuffer);
						const currentEntries = new Set<string>(entries.map(el => el.name));
						for (const prevEntry of prevEntries) {
							if (!currentEntries.has(prevEntry.name)) {
								entries.push(prevEntry);
							}
						}
					} catch (err) {
						console.error(err);
					}
				}
			}

			entries.sort((a, b) => a.name.localeCompare(b.name));
			await fs.promises.writeFile(filePath, JSON.stringify(entries, undefined, '\t'));
		}
		// console.log(this.outcome);
	}

	private _getCategoryFilename(category: string): string {
		return `${toDirname(category.toLowerCase())}.json`;
	}

	public async cleanFolder(): Promise<void> {
		// Clean the outcome folder
		const names = await fs.promises.readdir(outcomePath);
		const entries = new Set(names.filter(name => name.endsWith('.json')));
		for (const [category, _] of this.outcome) {
			entries.delete(this._getCategoryFilename(category));
		}
		if (entries.size > 0) {
			await Promise.all(
				Array.from(entries.values()).map(entry => fs.promises.unlink(path.join(outcomePath, entry)))
			);
		}
	}
}

interface OutcomeEntry {
	name: string;
	requests: string[];
}
