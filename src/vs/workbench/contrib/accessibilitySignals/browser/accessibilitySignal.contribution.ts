/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibilitySignalService, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService';
import { registerAction2 } from '../../../../platform/actions/common/actions';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions';
import { AccessibilitySignalLineDebuggerContribution } from './accessibilitySignalDebuggerContribution';
import { ShowAccessibilityAnnouncementHelp, ShowSignalSoundHelp } from './commands';
import { EditorTextPropertySignalsContribution } from './editorTextPropertySignalsContribution';
import { wrapInReloadableClass0 } from '../../../../platform/observable/common/wrapInReloadableClass';

registerSingleton(IAccessibilitySignalService, AccessibilitySignalService, InstantiationType.Delayed);

registerWorkbenchContribution2('EditorTextPropertySignalsContribution', wrapInReloadableClass0(() => EditorTextPropertySignalsContribution), WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('AccessibilitySignalLineDebuggerContribution', AccessibilitySignalLineDebuggerContribution, WorkbenchPhase.AfterRestored);

registerAction2(ShowSignalSoundHelp);
registerAction2(ShowAccessibilityAnnouncementHelp);

