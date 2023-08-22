/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IAccessibleViewService, AccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { UnfocusedViewDimmingContribution } from 'vs/workbench/contrib/accessibility/browser/unfocusedViewDimmingContribution';
import { EditorAccessibilityHelpContribution, HoverAccessibleViewContribution, InlineCompletionsAccessibleViewContribution, NotificationAccessibleViewContribution } from 'vs/workbench/contrib/accessibility/browser/accessibilityContributions';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UnfocusedViewDimmingContribution, LifecyclePhase.Restored);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(HoverAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(NotificationAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineCompletionsAccessibleViewContribution, LifecyclePhase.Eventually);
