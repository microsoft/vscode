/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';
import { ObservablePromise } from '../utils/utils';
import { SimulationRunsProvider } from './simulationBaseline';
import { SimulationRunner, TestRuns } from './simulationRunner';

/**
 * Provides the current selected baseline (resolved with test runs info)
 */

export class ResolvedSimulationRun {

	@mobx.computed
	public get runs(): ObservablePromise<TestRuns[]> {
		const outputFolderName = this.simulationRunsProvider.selectedBaselineRun?.name ?? '';
		if (!outputFolderName) {
			return ObservablePromise.resolve([]);
		}
		return new ObservablePromise(SimulationRunner.readFromPreviousRun(outputFolderName), []);
	}

	constructor(
		private readonly simulationRunsProvider: SimulationRunsProvider
	) {
		mobx.makeObservable(this);
	}
}
