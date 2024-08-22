/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { DynamicSpeechAccessibilityConfiguration, registerAccessibilityConfiguration } from './accessibilityConfiguration';
import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import { Registry } from '../../../../platform/registry/common/platform';
import { UnfocusedViewDimmingContribution } from './unfocusedViewDimmingContribution';
import { AccessibilityStatus } from './accessibilityStatus';
import { EditorAccessibilityHelpContribution } from './editorAccessibilityHelp';
import { SaveAccessibilitySignalContribution } from '../../accessibilitySignals/browser/saveAccessibilitySignal';
import { DiffEditorActiveAnnouncementContribution } from '../../accessibilitySignals/browser/openDiffEditorAnnouncement';
import { SpeechAccessibilitySignalContribution } from '../../speech/browser/speechAccessibilitySignal';
import { AccessibleViewInformationService, IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView';
import { AccessibleViewService } from './accessibleView';
import { AccesibleViewHelpContribution, AccesibleViewContributions } from './accessibleViewContributions';
import { ExtensionAccessibilityHelpDialogContribution } from './extensionAccesibilityHelp.contribution';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);
registerSingleton(IAccessibleViewInformationService, AccessibleViewInformationService, InstantiationType.Delayed);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UnfocusedViewDimmingContribution, LifecyclePhase.Restored);

workbenchRegistry.registerWorkbenchContribution(AccesibleViewHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(AccesibleViewContributions, LifecyclePhase.Eventually);

registerWorkbenchContribution2(AccessibilityStatus.ID, AccessibilityStatus, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ExtensionAccessibilityHelpDialogContribution.ID, ExtensionAccessibilityHelpDialogContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SaveAccessibilitySignalContribution.ID, SaveAccessibilitySignalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SpeechAccessibilitySignalContribution.ID, SpeechAccessibilitySignalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DiffEditorActiveAnnouncementContribution.ID, DiffEditorActiveAnnouncementContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DynamicSpeechAccessibilityConfiguration.ID, DynamicSpeechAccessibilityConfiguration, WorkbenchPhase.AfterRestored);
