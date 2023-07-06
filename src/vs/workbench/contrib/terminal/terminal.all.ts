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
import 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminal.accessibility.contribution';
import 'vs/workbench/contrib/terminalContrib/developer/browser/terminal.developer.contribution';
import 'vs/workbench/contrib/terminalContrib/environmentChanges/browser/terminal.environmentChanges.contribution';
import 'vs/workbench/contrib/terminalContrib/find/browser/terminal.find.contribution';
import 'vs/workbench/contrib/terminalContrib/links/browser/terminal.links.contribution';
import 'vs/workbench/contrib/terminalContrib/quickFix/browser/terminal.quickFix.contribution';
import 'vs/workbench/contrib/terminalContrib/typeAhead/browser/terminal.typeAhead.contribution';
