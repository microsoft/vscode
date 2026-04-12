/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DynamicSpeechAccessibilityConfiguration, registerAccessibilityConfiguration } from './accessibilityConfiguration.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { UnfocusedViewDimmingContribution } from './unfocusedViewDimmingContribution.js';
import { AccessibilityStatus } from './accessibilityStatus.js';
import { EditorAccessibilityHelpContribution } from './editorAccessibilityHelp.js';
import { SaveAccessibilitySignalContribution } from '../../accessibilitySignals/browser/saveAccessibilitySignal.js';
import { DiffEditorActiveAnnouncementContribution } from '../../accessibilitySignals/browser/openDiffEditorAnnouncement.js';
import { SpeechAccessibilitySignalContribution } from '../../speech/browser/speechAccessibilitySignal.js';
import { AccessibleViewInformationService, IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewService } from './accessibleView.js';
import { AccesibleViewHelpContribution, AccesibleViewContributions } from './accessibleViewContributions.js';
import { ExtensionAccessibilityHelpDialogContribution } from './extensionAccesibilityHelp.contribution.js';
registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAccessibleViewInformationService, AccessibleViewInformationService, 1 /* InstantiationType.Delayed */);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(UnfocusedViewDimmingContribution, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(AccesibleViewHelpContribution, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(AccesibleViewContributions, 4 /* LifecyclePhase.Eventually */);
registerWorkbenchContribution2(AccessibilityStatus.ID, AccessibilityStatus, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ExtensionAccessibilityHelpDialogContribution.ID, ExtensionAccessibilityHelpDialogContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(SaveAccessibilitySignalContribution.ID, SaveAccessibilitySignalContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(SpeechAccessibilitySignalContribution.ID, SpeechAccessibilitySignalContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(DiffEditorActiveAnnouncementContribution.ID, DiffEditorActiveAnnouncementContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(DynamicSpeechAccessibilityConfiguration.ID, DynamicSpeechAccessibilityConfiguration, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlILE9BQU8sRUFBbUQsVUFBVSxJQUFJLG1CQUFtQixFQUFFLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFdEssT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25GLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BILE9BQU8sRUFBRSx3Q0FBd0MsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQzVILE9BQU8sRUFBRSxxQ0FBcUMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ2pLLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzVELE9BQU8sRUFBRSw2QkFBNkIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdHLE9BQU8sRUFBRSw0Q0FBNEMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTNHLGtDQUFrQyxFQUFFLENBQUM7QUFDckMsaUJBQWlCLENBQUMsc0JBQXNCLEVBQUUscUJBQXFCLG9DQUE0QixDQUFDO0FBQzVGLGlCQUFpQixDQUFDLGlDQUFpQyxFQUFFLGdDQUFnQyxvQ0FBNEIsQ0FBQztBQUVsSCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQWtDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3RHLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLG1DQUFtQyxvQ0FBNEIsQ0FBQztBQUNoSCxpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQyxnQ0FBZ0Msa0NBQTBCLENBQUM7QUFFM0csaUJBQWlCLENBQUMsNkJBQTZCLENBQUMsNkJBQTZCLG9DQUE0QixDQUFDO0FBQzFHLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLDBCQUEwQixvQ0FBNEIsQ0FBQztBQUV2Ryw4QkFBOEIsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsbUJBQW1CLHNDQUE4QixDQUFDO0FBQ3pHLDhCQUE4QixDQUFDLDRDQUE0QyxDQUFDLEVBQUUsRUFBRSw0Q0FBNEMsc0NBQThCLENBQUM7QUFDM0osOEJBQThCLENBQUMsbUNBQW1DLENBQUMsRUFBRSxFQUFFLG1DQUFtQyx1Q0FBK0IsQ0FBQztBQUMxSSw4QkFBOEIsQ0FBQyxxQ0FBcUMsQ0FBQyxFQUFFLEVBQUUscUNBQXFDLHVDQUErQixDQUFDO0FBQzlJLDhCQUE4QixDQUFDLHdDQUF3QyxDQUFDLEVBQUUsRUFBRSx3Q0FBd0MsdUNBQStCLENBQUM7QUFDcEosOEJBQThCLENBQUMsdUNBQXVDLENBQUMsRUFBRSxFQUFFLHVDQUF1Qyx1Q0FBK0IsQ0FBQyJ9