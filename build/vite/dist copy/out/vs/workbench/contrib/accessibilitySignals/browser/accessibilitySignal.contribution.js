/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibilitySignalService, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { AccessibilitySignalLineDebuggerContribution } from './accessibilitySignalDebuggerContribution.js';
import { ShowAccessibilityAnnouncementHelp, ShowSignalSoundHelp } from './commands.js';
import { EditorTextPropertySignalsContribution } from './editorTextPropertySignalsContribution.js';
import { wrapInReloadableClass0 } from '../../../../platform/observable/common/wrapInReloadableClass.js';
registerSingleton(IAccessibilitySignalService, AccessibilitySignalService, 1 /* InstantiationType.Delayed */);
registerWorkbenchContribution2('EditorTextPropertySignalsContribution', wrapInReloadableClass0(() => EditorTextPropertySignalsContribution), 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2('AccessibilitySignalLineDebuggerContribution', AccessibilitySignalLineDebuggerContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerAction2(ShowSignalSoundHelp);
registerAction2(ShowAccessibilityAnnouncementHelp);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eVNpZ25hbC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5U2lnbmFscy9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWwuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGdGQUFnRixDQUFDO0FBQ3pKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLDhCQUE4QixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSwyQ0FBMkMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUN2RixPQUFPLEVBQUUscUNBQXFDLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV6RyxpQkFBaUIsQ0FBQywyQkFBMkIsRUFBRSwwQkFBMEIsb0NBQTRCLENBQUM7QUFFdEcsOEJBQThCLENBQUMsdUNBQXVDLEVBQUUsc0JBQXNCLENBQUMsR0FBRyxFQUFFLENBQUMscUNBQXFDLENBQUMsdUNBQStCLENBQUM7QUFDM0ssOEJBQThCLENBQUMsNkNBQTZDLEVBQUUsMkNBQTJDLHVDQUErQixDQUFDO0FBRXpKLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3JDLGVBQWUsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDIn0=