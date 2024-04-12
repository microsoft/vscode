/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShowAccessibilityAnnouncementHelp, ShowSignalSoundHelp } from 'vs/workbench/contrib/accessibilitySignals/browser/commands';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IAccessibilitySignalService, AccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { AccessibilitySignalLineDebuggerContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignalDebuggerContribution';
import { SignalLineFeatureContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignalLineFeatureContribution';

registerSingleton(IAccessibilitySignalService, AccessibilitySignalService, InstantiationType.Delayed);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SignalLineFeatureContribution, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AccessibilitySignalLineDebuggerContribution, LifecyclePhase.Restored);

registerAction2(ShowSignalSoundHelp);
registerAction2(ShowAccessibilityAnnouncementHelp);

