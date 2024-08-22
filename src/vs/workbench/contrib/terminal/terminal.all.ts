/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Primary workbench contribution
import './browser/terminal.contribution';

// Misc extensions to the workbench contribution
import './common/environmentVariable.contribution';
import './common/terminalExtensionPoints.contribution';
import './browser/terminalView';

// Terminal contributions - Standalone extensions to the terminal, these cannot be imported from the
// primary workbench contribution)
import '../terminalContrib/accessibility/browser/terminal.accessibility.contribution';
import '../terminalContrib/developer/browser/terminal.developer.contribution';
import '../terminalContrib/environmentChanges/browser/terminal.environmentChanges.contribution';
import '../terminalContrib/find/browser/terminal.find.contribution';
import '../terminalContrib/chat/browser/terminal.chat.contribution';
import '../terminalContrib/commandGuide/browser/terminal.commandGuide.contribution';
import '../terminalContrib/links/browser/terminal.links.contribution';
import '../terminalContrib/zoom/browser/terminal.zoom.contribution';
import '../terminalContrib/stickyScroll/browser/terminal.stickyScroll.contribution';
import '../terminalContrib/quickFix/browser/terminal.quickFix.contribution';
import '../terminalContrib/typeAhead/browser/terminal.typeAhead.contribution';
import '../terminalContrib/suggest/browser/terminal.suggest.contribution';
import '../terminalContrib/chat/browser/terminal.initialHint.contribution';

