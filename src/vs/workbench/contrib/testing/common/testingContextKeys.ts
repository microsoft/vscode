/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { TestExplorerViewMode, TestExplorerViewSorting } from 'vs/workbench/contrib/testing/common/constants';
import { TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';

export namespace TestingContextKeys {
	export const providerCount = new RawContextKey('testing.providerCount', 0);
	export const canRefreshTests = new RawContextKey('testing.canRefresh', false, { type: 'boolean', description: localize('testing.canRefresh', 'Indicates whether any test controller has an attached refresh handler.') });
	export const isRefreshingTests = new RawContextKey('testing.isRefreshing', false, { type: 'boolean', description: localize('testing.isRefreshing', 'Indicates whether any test controller is currently refreshing tests.') });
	export const isContinuousModeOn = new RawContextKey('testing.isContinuousModeOn', false, { type: 'boolean', description: localize('testing.isContinuousModeOn', 'Indicates whether continuous test mode is on.') });
	export const hasDebuggableTests = new RawContextKey('testing.hasDebuggableTests', false, { type: 'boolean', description: localize('testing.hasDebuggableTests', 'Indicates whether any test controller has registered a debug configuration') });
	export const hasRunnableTests = new RawContextKey('testing.hasRunnableTests', false, { type: 'boolean', description: localize('testing.hasRunnableTests', 'Indicates whether any test controller has registered a run configuration') });
	export const hasCoverableTests = new RawContextKey('testing.hasCoverableTests', false, { type: 'boolean', description: localize('testing.hasCoverableTests', 'Indicates whether any test controller has registered a coverage configuration') });
	export const hasNonDefaultProfile = new RawContextKey('testing.hasNonDefaultProfile', false, { type: 'boolean', description: localize('testing.hasNonDefaultConfig', 'Indicates whether any test controller has registered a non-default configuration') });
	export const hasConfigurableProfile = new RawContextKey('testing.hasConfigurableProfile', false, { type: 'boolean', description: localize('testing.hasConfigurableConfig', 'Indicates whether any test configuration can be configured') });
	export const supportsContinuousRun = new RawContextKey('testing.supportsContinuousRun', false, { type: 'boolean', description: localize('testing.supportsContinuousRun', 'Indicates whether continous test running is supported') });
	export const isParentRunningContinuously = new RawContextKey('testing.isParentRunningContinuously', false, { type: 'boolean', description: localize('testing.isParentRunningContinuously', 'Indicates whether the parent of a test is continuously running, set in the menu context of test items') });
	export const activeEditorHasTests = new RawContextKey('testing.activeEditorHasTests', false, { type: 'boolean', description: localize('testing.activeEditorHasTests', 'Indicates whether any tests are present in the current editor') });
	export const isTestCoverageOpen = new RawContextKey('testing.isTestCoverageOpen', false, { type: 'boolean', description: localize('testing.isTestCoverageOpen', 'Indicates whether a test coverage report is open') });
	export const hasPerTestCoverage = new RawContextKey('testing.hasPerTestCoverage', false, { type: 'boolean', description: localize('testing.hasPerTestCoverage', 'Indicates whether per-test coverage is available') });
	export const isCoverageFilteredToTest = new RawContextKey('testing.isCoverageFilteredToTest', false, { type: 'boolean', description: localize('testing.isCoverageFilteredToTest', 'Indicates whether coverage has been filterd to a single test') });
	export const coverageToolbarEnabled = new RawContextKey('testing.coverageToolbarEnabled', true, { type: 'boolean', description: localize('testing.coverageToolbarEnabled', 'Indicates whether the coverage toolbar is enabled') });

	export const capabilityToContextKey: { [K in TestRunProfileBitset]: RawContextKey<boolean> } = {
		[TestRunProfileBitset.Run]: hasRunnableTests,
		[TestRunProfileBitset.Coverage]: hasCoverableTests,
		[TestRunProfileBitset.Debug]: hasDebuggableTests,
		[TestRunProfileBitset.HasNonDefaultProfile]: hasNonDefaultProfile,
		[TestRunProfileBitset.HasConfigurable]: hasConfigurableProfile,
		[TestRunProfileBitset.SupportsContinuousRun]: supportsContinuousRun,
	};

	export const hasAnyResults = new RawContextKey<boolean>('testing.hasAnyResults', false);
	export const viewMode = new RawContextKey<TestExplorerViewMode>('testing.explorerViewMode', TestExplorerViewMode.List);
	export const viewSorting = new RawContextKey<TestExplorerViewSorting>('testing.explorerViewSorting', TestExplorerViewSorting.ByLocation);
	export const isRunning = new RawContextKey<boolean>('testing.isRunning', false);
	export const isInPeek = new RawContextKey<boolean>('testing.isInPeek', false);
	export const isPeekVisible = new RawContextKey<boolean>('testing.isPeekVisible', false);

	export const peekItemType = new RawContextKey<string | undefined>('peekItemType', undefined, {
		type: 'string',
		description: localize('testing.peekItemType', 'Type of the item in the output peek view. Either a "test", "message", "task", or "result".'),
	});
	export const controllerId = new RawContextKey<string | undefined>('controllerId', undefined, {
		type: 'string',
		description: localize('testing.controllerId', 'Controller ID of the current test item')
	});
	export const testItemExtId = new RawContextKey<string | undefined>('testId', undefined, {
		type: 'string',
		description: localize('testing.testId', 'ID of the current test item, set when creating or opening menus on test items')
	});
	export const testItemHasUri = new RawContextKey<boolean>('testing.testItemHasUri', false, {
		type: 'boolean',
		description: localize('testing.testItemHasUri', 'Boolean indicating whether the test item has a URI defined')
	});
	export const testItemIsHidden = new RawContextKey<boolean>('testing.testItemIsHidden', false, {
		type: 'boolean',
		description: localize('testing.testItemIsHidden', 'Boolean indicating whether the test item is hidden')
	});
	export const testMessageContext = new RawContextKey<string>('testMessage', undefined, {
		type: 'string',
		description: localize('testing.testMessage', 'Value set in `testMessage.contextValue`, available in editor/content and testing/message/context')
	});
	export const testResultOutdated = new RawContextKey<boolean>('testResultOutdated', undefined, {
		type: 'boolean',
		description: localize('testing.testResultOutdated', 'Value available in editor/content and testing/message/context when the result is outdated')
	});
	export const testResultState = new RawContextKey<string>('testResultState', undefined, {
		type: 'string',
		description: localize('testing.testResultState', 'Value available testing/item/result indicating the state of the item.')
	});
}
