/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { TestExplorerViewMode, TestExplorerViewGrouping } from 'vs/workbench/contrib/testing/common/constants';

export namespace TestingContextKeys {
	export const providerCount = new RawContextKey('testingProviderCount', 0);
	export const viewMode = new RawContextKey('testExplorerViewMode', TestExplorerViewMode.List);
	export const viewGrouping = new RawContextKey('testExplorerViewGrouping', TestExplorerViewGrouping.ByLocation);
	export const isRunning = new RawContextKey('testIsrunning', false);
	export const peekVisible = new RawContextKey('testPeekVisible', false);
}
