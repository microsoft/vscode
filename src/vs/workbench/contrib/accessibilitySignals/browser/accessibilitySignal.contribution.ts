/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibilitySignalService, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { AccessibilitySignalLineDebuggerContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignalDebuggerContribution';
import { ShowAccessibilityAnnouncementHelp, ShowSignalSoundHelp } from 'vs/workbench/contrib/accessibilitySignals/browser/commands';
import { EditorTextPropertySignalsContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/editorTextPropertySignalsContribution';
import { wrapInReloadableClass } from 'vs/workbench/contrib/accessibilitySignals/browser/reloadableWorkbenchContribution';

registerSingleton(IAccessibilitySignalService, AccessibilitySignalService, InstantiationType.Delayed);

registerWorkbenchContribution2('EditorTextPropertySignalsContribution', wrapInReloadableClass(() => EditorTextPropertySignalsContribution), WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('AccessibilitySignalLineDebuggerContribution', AccessibilitySignalLineDebuggerContribution, WorkbenchPhase.AfterRestored);

registerAction2(ShowSignalSoundHelp);
registerAction2(ShowAccessibilityAnnouncementHelp);

