/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { TestsDiff, RunTestsRequest, RunTestsResult, collectTestResults } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestService, MainTestController } from 'vs/workbench/contrib/testing/common/testService';

export class TestService extends Disposable implements ITestService {
	declare readonly _serviceBrand: undefined;
	private diffEmitter = this._register(new Emitter<TestsDiff>());
	private testControllers = new Map<string, MainTestController>();

	public readonly onDidReceiveDiff = this.diffEmitter.event;

	publishDiff(diff: TestsDiff): void {
		this.diffEmitter.fire(diff);
	}

	async runTests(req: RunTestsRequest): Promise<RunTestsResult> {
		const tests = groupBy(req.tests, (a, b) => a.providerId === b.providerId ? 0 : 1);
		const requests = tests.map(group => {
			const providerId = group[0].providerId;
			const controller = this.testControllers.get(providerId);
			return controller?.runTests({ providerId, debug: req.debug, ids: group.map(t => t.testId) });
		}).filter(isDefined);

		return collectTestResults(await Promise.all(requests));
	}

	registerTestController(id: string, controller: MainTestController): void {
		this.testControllers.set(id, controller);
	}

	unregisterTestController(id: string): void {
		this.testControllers.delete(id);
	}
}
