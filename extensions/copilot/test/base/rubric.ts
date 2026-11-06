/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { ISimulationTestRuntime } from './stest';

export function rubric(accessor: ITestingServicesAccessor, ...assertions: (() => void)[]) {
	const runtime = accessor.get(ISimulationTestRuntime);

	let passed = 0;
	for (const a of assertions) {
		try {
			a();
			passed++;
		} catch (e) {
			runtime.log(String(e));
			// ignored
		}
	}

	if (passed === 0) {
		runtime.setOutcome({ kind: 'failed', hitContentFilter: false, error: 'no passed assertions', critical: false });
	} else {
		runtime.setExplicitScore(passed / assertions.length);
	}
}
