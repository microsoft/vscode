/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { TestExplorerViewMode, TestExplorerViewSorting } from 'vs/workbench/contrib/testing/common/constants';

export namespace TestingContextKeys {
	export const providerCount = new RawContextKey('testing.providerCount', 0);
	export const hasDebuggableTests = new RawContextKey('testing.hasDebuggableTests', false);
	export const hasRunnableTests = new RawContextKey('testing.hasRunnableTests', false);
	export const viewMode = new RawContextKey('testing.explorerViewMode', TestExplorerViewMode.List);
	export const viewSorting = new RawContextKey('testing.explorerViewSorting', TestExplorerViewSorting.ByLocation);
	export const isRunning = new RawContextKey('testing.isRunning', false);
	export const isInPeek = new RawContextKey('testing.isInPeek', true);
	export const isPeekVisible = new RawContextKey('testing.isPeekVisible', false);
	export const explorerLocation = new RawContextKey('testing.explorerLocation', ViewContainerLocation.Sidebar);
	export const autoRun = new RawContextKey('testing.autoRun', false);
	export const testItemExtId = new RawContextKey<string | undefined>('testId', undefined, {
		type: 'string',
		description: localize('testing.testId', 'ID of the current test item, set when creating or opening menus on test items')
	});
}
