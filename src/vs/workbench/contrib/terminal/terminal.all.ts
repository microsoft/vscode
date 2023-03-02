/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Primary workbench contribution
import 'vs/workbench/contrib/terminal/browser/terminal.contribution';

// Misc extensions to the workbench contribution
import 'vs/workbench/contrib/terminal/common/environmentVariable.contribution';
import 'vs/workbench/contrib/terminal/common/terminalExtensionPoints.contribution';
import 'vs/workbench/contrib/terminal/browser/terminalView';

// Terminal contributions - Standalone extensions to the terminal, these cannot be imported from the
// primary workbench contribution)
import 'vs/workbench/contrib/terminal/contrib/accessibility/browser/terminal.accessibility.contribution';
import 'vs/workbench/contrib/terminal/contrib/find/browser/terminal.find.contribution';
import 'vs/workbench/contrib/terminal/contrib/links/browser/terminal.links.contribution';
