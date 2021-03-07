/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { getTestSubscriptionKey, ISerializedTestResults, ITestState, RunTestsRequest, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { HydratedTestResult, ITestResultService, LiveTestResult } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ExtHostContext, ExtHostTestingResource, ExtHostTestingShape, IExtHostContext, MainContext, MainThreadTestingShape } from '../common/extHost.protocol';

const reviveDiff = (diff: TestsDiff) => {
	for (const entry of diff) {
		if (entry[0] === TestDiffOpType.Add || entry[0] === TestDiffOpType.Update) {
			const item = entry[1];
			if (item.item.location) {
				item.item.location.uri = URI.revive(item.item.location.uri);
				item.item.location.range = Range.lift(item.item.location.range);
			}
		}
	}
};

@extHostNamedCustomer(MainContext.MainThreadTesting)
export class MainThreadTesting extends Disposable implements MainThreadTestingShape {
	private readonly proxy: ExtHostTestingShape;
	private readonly testSubscriptions = new Map<string, IDisposable>();
	private readonly testProviderRegistrations = new Map<string, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@ITestService private readonly testService: ITestService,
		@ITestResultService private readonly resultService: ITestResultService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostTesting);
		this._register(this.testService.onShouldSubscribe(args => this.proxy.$subscribeToTests(args.resource, args.uri)));
		this._register(this.testService.onShouldUnsubscribe(args => this.proxy.$unsubscribeFromTests(args.resource, args.uri)));


		const prevResults = resultService.results.map(r => r.toJSON()).filter(isDefined);
		if (prevResults.length) {
			this.proxy.$publishTestResults(prevResults);
		}

		this._register(resultService.onResultsChanged(evt => {
			const results = 'completed' in evt ? evt.completed : ('inserted' in evt ? evt.inserted : undefined);
			const serialized = results?.toJSON();
			if (serialized) {
				this.proxy.$publishTestResults([serialized]);
			}
		}));

		testService.updateRootProviderCount(1);

		for (const { resource, uri } of this.testService.subscriptions) {
			this.proxy.$subscribeToTests(resource, uri);
		}
	}

	/**
	 * @inheritdoc
	 */
	$publishExtensionProvidedResults(results: ISerializedTestResults, persist: boolean): void {
		this.resultService.push(new HydratedTestResult(results, persist));
	}

	/**
	 * @inheritdoc
	 */
	$retireTest(extId: string): void {
		for (const result of this.resultService.results) {
			if (result instanceof LiveTestResult) {
				result.retire(extId);
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	$updateTestStateInRun(runId: string, testId: string, state: ITestState): void {
		const r = this.resultService.getResult(runId);
		if (r && r instanceof LiveTestResult) {
			for (const message of state.messages) {
				if (message.location) {
					message.location.uri = URI.revive(message.location.uri);
					message.location.range = Range.lift(message.location.range);
				}
			}

			r.updateState(testId, state);
		}
	}

	/**
	 * @inheritdoc
	 */
	public $registerTestProvider(id: string) {
		const disposable = this.testService.registerTestController(id, {
			runTests: (req, token) => this.proxy.$runTestsForProvider(req, token),
			lookupTest: test => this.proxy.$lookupTest(test),
		});

		this.testProviderRegistrations.set(id, disposable);
	}

	/**
	 * @inheritdoc
	 */
	public $unregisterTestProvider(id: string) {
		this.testProviderRegistrations.get(id)?.dispose();
		this.testProviderRegistrations.delete(id);
	}

	/**
	 * @inheritdoc
	 */
	$subscribeToDiffs(resource: ExtHostTestingResource, uriComponents: UriComponents): void {
		const uri = URI.revive(uriComponents);
		const disposable = this.testService.subscribeToDiffs(resource, uri,
			diff => this.proxy.$acceptDiff(resource, uriComponents, diff));
		this.testSubscriptions.set(getTestSubscriptionKey(resource, uri), disposable);
	}

	/**
	 * @inheritdoc
	 */
	public $unsubscribeFromDiffs(resource: ExtHostTestingResource, uriComponents: UriComponents): void {
		const key = getTestSubscriptionKey(resource, URI.revive(uriComponents));
		this.testSubscriptions.get(key)?.dispose();
		this.testSubscriptions.delete(key);
	}

	/**
	 * @inheritdoc
	 */
	public $publishDiff(resource: ExtHostTestingResource, uri: UriComponents, diff: TestsDiff): void {
		reviveDiff(diff);
		this.testService.publishDiff(resource, URI.revive(uri), diff);
	}

	public async $runTests(req: RunTestsRequest, token: CancellationToken): Promise<string> {
		const result = await this.testService.runTests(req, token);
		return result.id;
	}

	public dispose() {
		super.dispose();
		this.testService.updateRootProviderCount(-1);
		for (const subscription of this.testSubscriptions.values()) {
			subscription.dispose();
		}
		this.testSubscriptions.clear();
	}
}
