/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { RunTestsRequest, RunTestsResult, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostTestingShape, IExtHostContext, MainContext, MainThreadTestingShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadTesting)
export class MainThreadTesting extends Disposable implements MainThreadTestingShape {
	private readonly proxy: ExtHostTestingShape;

	constructor(
		extHostContext: IExtHostContext,
		@ITestService private readonly testService: ITestService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostTesting);
		this._register(testService.onDidReceiveDiff(diff => this.proxy.$acceptDiff(diff)));
	}

	public $registerTestProvider(id: string) {
		this.testService.registerTestController(id, {
			runTests: req => this.proxy.$runTestsForProvider(req),
		});
	}

	public $unregisterTestProvider(id: string) {
		this.testService.unregisterTestController(id);
	}

	public $publishDiff(diff: TestsDiff): void {
		this.proxy.$acceptDiff(diff);
	}

	public $runTests(req: RunTestsRequest): Promise<RunTestsResult> {
		return this.testService.runTests(req);
	}

	public dispose() {
		// no-op
	}
}
