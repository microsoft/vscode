/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { TestExplorerViewMode, TestExplorerViewSorting } from './constants.js';
import { TestRunProfileBitset } from './testTypes.js';

export namespace TestingContextKeys {
	export const providerCount = new RawContextKey('testing.providerCount', 0);
	export const canRefreshTests = new RawContextKey('testing.canRefresh', false, { type: 'boolean', description: localize('testing.canRefresh', 'Indicates whether any test controller has an attached refresh handler.') });
	export const isRefreshingTests = new RawContextKey('testing.isRefreshing', false, { type: 'boolean', description: localize('testing.isRefreshing', 'Indicates whether any test controller is currently refreshing tests.') });
	export const isContinuousModeOn = new RawContextKey<boolean>('testing.isContinuousModeOn', false, { type: 'boolean', description: localize('testing.isContinuousModeOn', 'Indicates whether continuous test mode is on.') });
	export const hasDebuggableTests = new RawContextKey('testing.hasDebuggableTests', false, { type: 'boolean', description: localize('testing.hasDebuggableTests', 'Indicates whether any test controller has registered a debug configuration') });
	export const hasRunnableTests = new RawContextKey('testing.hasRunnableTests', false, { type: 'boolean', description: localize('testing.hasRunnableTests', 'Indicates whether any test controller has registered a run configuration') });
	export const hasCoverableTests = new RawContextKey('testing.hasCoverableTests', false, { type: 'boolean', description: localize('testing.hasCoverableTests', 'Indicates whether any test controller has registered a coverage configuration') });
	export const hasNonDefaultProfile = new RawContextKey('testing.hasNonDefaultProfile', false, { type: 'boolean', description: localize('testing.hasNonDefaultConfig', 'Indicates whether any test controller has registered a non-default configuration') });
	export const hasConfigurableProfile = new RawContextKey('testing.hasConfigurableProfile', false, { type: 'boolean', description: localize('testing.hasConfigurableConfig', 'Indicates whether any test configuration can be configured') });
	export const supportsContinuousRun = new RawContextKey('testing.supportsContinuousRun', false, { type: 'boolean', description: localize('testing.supportsContinuousRun', 'Indicates whether continous test running is supported') });
	export const isParentRunningContinuously = new RawContextKey('testing.isParentRunningContinuously', false, { type: 'boolean', description: localize('testing.isParentRunningContinuously', 'Indicates whether the parent of a test is continuously running, set in the menu context of test items') });
	export const activeEditorHasTests = new RawContextKey('testing.activeEditorHasTests', false, { type: 'boolean', description: localize('testing.activeEditorHasTests', 'Indicates whether any tests are present in the current editor') });
	export const cursorInsideTestRange = new RawContextKey('testing.cursorInsideTestRange', false, { type: 'boolean', description: localize('testing.cursorInsideTestRange', 'Whether the cursor is currently inside a test range') });
	export const isTestCoverageOpen = new RawContextKey('testing.isTestCoverageOpen', false, { type: 'boolean', description: localize('testing.isTestCoverageOpen', 'Indicates whether a test coverage report is open') });
	export const hasCoverageInFile = new RawContextKey('testing.hasCoverageInFile', false, { type: 'boolean', description: localize('testing.hasCoverageInFile', 'Indicates coverage has been reported in the curent editor.') });
	export const hasPerTestCoverage = new RawContextKey('testing.hasPerTestCoverage', false, { type: 'boolean', description: localize('testing.hasPerTestCoverage', 'Indicates whether per-test coverage is available') });
	export const hasInlineCoverageDetails = new RawContextKey('testing.hasInlineCoverageDetails', false, { type: 'boolean', description: localize('testing.hasInlineCoverageDetails', 'Indicates whether detailed per-line coverage is available for inline display') });
	export const isCoverageFilteredToTest = new RawContextKey('testing.isCoverageFilteredToTest', false, { type: 'boolean', description: localize('testing.isCoverageFilteredToTest', 'Indicates whether coverage has been filterd to a single test') });
	export const coverageToolbarEnabled = new RawContextKey('testing.coverageToolbarEnabled', true, { type: 'boolean', description: localize('testing.coverageToolbarEnabled', 'Indicates whether the coverage toolbar is enabled') });
	export const inlineCoverageEnabled = new RawContextKey('testing.inlineCoverageEnabled', false, { type: 'boolean', description: localize('testing.inlineCoverageEnabled', 'Indicates whether inline coverage is shown') });
	export const canGoToRelatedCode = new RawContextKey('testing.canGoToRelatedCode', false, { type: 'boolean', description: localize('testing.canGoToRelatedCode', 'Whether a controller implements a capability to find code related to a test') });
	export const canGoToRelatedTest = new RawContextKey('testing.canGoToRelatedTest', false, { type: 'boolean', description: localize('testing.canGoToRelatedTest', 'Whether a controller implements a capability to find tests related to code') });
	export const peekHasStack = new RawContextKey('testing.peekHasStack', false, { type: 'boolean', description: localize('testing.peekHasStack', 'Whether the message shown in a peek view has a stack trace') });

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
	export const testProfileContextGroup = new RawContextKey<string>('testing.profile.context.group', undefined, {
		type: 'string',
		description: localize('testing.profile.context.group', 'Type of menu where the configure testing profile submenu exists. Either "run", "debug", or "coverage"')
	});
}
