/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { TestExplorerViewMode, TestExplorerViewSorting } from 'vs/workbench/contrib/testing/common/constants';
import { TestRunConfigurationBitset } from 'vs/workbench/contrib/testing/common/testCollection';

export namespace TestingContextKeys {
	export const providerCount = new RawContextKey('testing.providerCount', 0);
	export const hasDebuggableTests = new RawContextKey('testing.hasDebuggableTests', false, { type: 'boolean', description: localize('testing.hasDebuggableTests', 'Indicates whether any test controller has registered a debug configuration') });
	export const hasRunnableTests = new RawContextKey('testing.hasRunnableTests', false, { type: 'boolean', description: localize('testing.hasRunnableTests', 'Indicates whether any test controller has registered a run configuration') });
	export const hasCoverableTests = new RawContextKey('testing.hasCoverableTests', false, { type: 'boolean', description: localize('testing.hasCoverableTests', 'Indicates whether any test controller has registered a coverage configuration') });
	export const hasNonDefaultProfile = new RawContextKey('testing.hasNonDefaultConfig', false, { type: 'boolean', description: localize('testing.hasNonDefaultConfig', 'Indicates whether any test controller has registered a non-default configuration') });
	export const hasConfigurableConfig = new RawContextKey('testing.hasConfigurableConfig', false, { type: 'boolean', description: localize('testing.hasConfigurableConfig', 'Indicates whether any test configuration can be configured') });

	export const capabilityToContextKey: { [K in TestRunConfigurationBitset]: RawContextKey<boolean> } = {
		[TestRunConfigurationBitset.Run]: hasRunnableTests,
		[TestRunConfigurationBitset.Coverage]: hasCoverableTests,
		[TestRunConfigurationBitset.Debug]: hasDebuggableTests,
		[TestRunConfigurationBitset.HasNonDefaultConfig]: hasNonDefaultProfile,
		[TestRunConfigurationBitset.HasConfigurable]: hasConfigurableConfig,
	};

	export const hasAnyResults = new RawContextKey('testing.hasAnyResults', false);
	export const viewMode = new RawContextKey('testing.explorerViewMode', TestExplorerViewMode.List);
	export const viewSorting = new RawContextKey('testing.explorerViewSorting', TestExplorerViewSorting.ByLocation);
	export const isRunning = new RawContextKey('testing.isRunning', false);
	export const isInPeek = new RawContextKey('testing.isInPeek', true);
	export const isPeekVisible = new RawContextKey('testing.isPeekVisible', false);
	export const explorerLocation = new RawContextKey('testing.explorerLocation', ViewContainerLocation.Sidebar);
	export const autoRun = new RawContextKey('testing.autoRun', false);

	export const peekItemType = new RawContextKey<string | undefined>('peekItemType', undefined, {
		type: 'string',
		description: localize('testing.peekItemType', 'Type of the item in the output peek view. Either a "test", "message", "task", or "result".'),
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
}
