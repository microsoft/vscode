/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon, registerIcon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';

export const debugConsoleViewIcon = registerIcon('debug-console-view-icon', Codicon.debugConsole, localize('debugConsoleViewIcon', 'View icon of the debug console view.'));
export const runViewIcon = registerIcon('run-view-icon', Codicon.debugAlt, localize('runViewIcon', 'View icon of the run view.'));
export const variablesViewIcon = registerIcon('variables-view-icon', Codicon.debugAlt, localize('variablesViewIcon', 'View icon of the variables view.'));
export const watchViewIcon = registerIcon('watch-view-icon', Codicon.debugAlt, localize('watchViewIcon', 'View icon of the watch view.'));
export const callStackViewIcon = registerIcon('callstack-view-icon', Codicon.debugAlt, localize('callStackViewIcon', 'View icon of the call stack view.'));
export const breakpointsViewIcon = registerIcon('breakpoints-view-icon', Codicon.debugAlt, localize('breakpointsViewIcon', 'View icon of the breakpoints view.'));
export const loadedScriptsViewIcon = registerIcon('loaded-scripts-view-icon', Codicon.debugAlt, localize('loadedScriptsViewIcon', 'View icon of the loaded scripts view.'));
