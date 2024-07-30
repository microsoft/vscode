/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DynamicSpeechAccessibilityConfiguration, registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { UnfocusedViewDimmingContribution } from 'vs/workbench/contrib/accessibility/browser/unfocusedViewDimmingContribution';
import { AccessibilityStatus } from 'vs/workbench/contrib/accessibility/browser/accessibilityStatus';
import { EditorAccessibilityHelpContribution } from 'vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp';
import { SaveAccessibilitySignalContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/saveAccessibilitySignal';
import { DiffEditorActiveAnnouncementContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/openDiffEditorAnnouncement';
import { SpeechAccessibilitySignalContribution } from 'vs/workbench/contrib/speech/browser/speechAccessibilitySignal';
import { AccessibleViewInformationService, IAccessibleViewInformationService } from 'vs/workbench/services/accessibility/common/accessibleViewInformationService';
import { IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccesibleViewHelpContribution, AccesibleViewContributions } from 'vs/workbench/contrib/accessibility/browser/accessibleViewContributions';
import { ExtensionAccessibilityHelpDialogContribution } from 'vs/workbench/contrib/accessibility/browser/extensionAccesibilityHelp.contribution';

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
