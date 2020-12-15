/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';


export const testingViewIcon = registerIcon('testing-view-icon', Codicon.beaker, localize('testingViewIcon', 'View icon of the testing view.'));
export const testingRunIcon = registerIcon('testing-run-icon', Codicon.debugStart, localize('testingRunIcon', 'Icon of the "run test" action.'));
export const testingDebugIcon = registerIcon('testing-debug-icon', Codicon.debugAlt, localize('testingDebugIcon', 'Icon of the "debug test" action.'));

export const testingShowAsList = registerIcon('testing-show-as-list-icon', Codicon.listTree, localize('testingShowAsList', 'Icon shown when the test explorer is disabled as a tree.'));
export const testingShowAsTree = registerIcon('testing-show-as-list-icon', Codicon.listFlat, localize('testingShowAsTree', 'Icon shown when the test explorer is disabled as a list.'));
