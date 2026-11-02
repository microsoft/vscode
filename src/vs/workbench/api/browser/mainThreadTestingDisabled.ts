/*---------------------------------------------------------------------------------------------
 *  Disabled Testing API bridge for profiles without Testing support.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadTestingShape } from '../common/extHost.protocol.js';

const unsupported = (): Error => new Error('Testing support is disabled in this build.');

@extHostNamedCustomer(MainContext.MainThreadTesting)
export class MainThreadTestingDisabled extends Disposable implements MainThreadTestingShape {
	constructor(_context: IExtHostContext) { super(); }
	$registerTestController(..._args: Parameters<MainThreadTestingShape['$registerTestController']>): void { }
	$updateController(..._args: Parameters<MainThreadTestingShape['$updateController']>): void { }
	$unregisterTestController(..._args: Parameters<MainThreadTestingShape['$unregisterTestController']>): void { }
	$subscribeToDiffs(..._args: Parameters<MainThreadTestingShape['$subscribeToDiffs']>): void { }
	$unsubscribeFromDiffs(..._args: Parameters<MainThreadTestingShape['$unsubscribeFromDiffs']>): void { }
	$publishDiff(..._args: Parameters<MainThreadTestingShape['$publishDiff']>): void { }
	$getCoverageDetails(..._args: Parameters<MainThreadTestingShape['$getCoverageDetails']>): ReturnType<MainThreadTestingShape['$getCoverageDetails']> { return Promise.resolve([]); }
	$publishTestRunProfile(..._args: Parameters<MainThreadTestingShape['$publishTestRunProfile']>): void { }
	$updateTestRunConfig(..._args: Parameters<MainThreadTestingShape['$updateTestRunConfig']>): void { }
	$removeTestProfile(..._args: Parameters<MainThreadTestingShape['$removeTestProfile']>): void { }
	$runTests(..._args: Parameters<MainThreadTestingShape['$runTests']>): ReturnType<MainThreadTestingShape['$runTests']> { return Promise.reject(unsupported()); }
	$addTestsToRun(..._args: Parameters<MainThreadTestingShape['$addTestsToRun']>): void { }
	$updateTestStateInRun(..._args: Parameters<MainThreadTestingShape['$updateTestStateInRun']>): void { }
	$appendTestMessagesInRun(..._args: Parameters<MainThreadTestingShape['$appendTestMessagesInRun']>): void { }
	$appendOutputToRun(..._args: Parameters<MainThreadTestingShape['$appendOutputToRun']>): void { }
	$appendCoverage(..._args: Parameters<MainThreadTestingShape['$appendCoverage']>): void { }
	$startedTestRunTask(..._args: Parameters<MainThreadTestingShape['$startedTestRunTask']>): void { }
	$finishedTestRunTask(..._args: Parameters<MainThreadTestingShape['$finishedTestRunTask']>): void { }
	$startedExtensionTestRun(..._args: Parameters<MainThreadTestingShape['$startedExtensionTestRun']>): void { }
	$finishedExtensionTestRun(..._args: Parameters<MainThreadTestingShape['$finishedExtensionTestRun']>): void { }
	$markTestRetired(..._args: Parameters<MainThreadTestingShape['$markTestRetired']>): void { }
}
