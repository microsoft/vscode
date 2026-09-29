/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';
import { TestRun } from './testRun';


export class RunnerTestStatus {

	@mobx.observable
	public readonly runs: TestRun[];

	@mobx.observable
	public isNowRunning: number;

	@mobx.observable
	public isCancelled: boolean;

	@mobx.observable
	public isSkipped: boolean;

	constructor(
		public readonly name: string,
		public readonly expectedRuns: number,
		runs: TestRun[],
		isNowRunning: number = 0,
		isCancelled: boolean = false,
		isSkipped: boolean = false
	) {
		this.runs = runs;
		this.isNowRunning = isNowRunning;
		this.isCancelled = isCancelled;
		this.isSkipped = isSkipped;
		mobx.makeObservable(this);
	}

	public addRun(run: TestRun) {
		this.runs.push(run);
		this.runs.sort((a, b) => {
			return (a.runNumber ?? 0) - (b.runNumber ?? 0);
		});
	}
}
