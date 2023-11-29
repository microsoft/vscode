/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalStickyScrollContribution } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollContribution';

import './terminalStickyScrollColorRegistry';
import { importCss } from 'vs/base/browser/importCss';

importCss('./media/stickyScroll.css', import.meta.url)


registerTerminalContribution(TerminalStickyScrollContribution.ID, TerminalStickyScrollContribution, true);
