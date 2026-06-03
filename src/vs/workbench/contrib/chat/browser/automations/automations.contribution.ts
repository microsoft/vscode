/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { AutomationsAccessibilityHelp } from '../aiCustomization/automationsAccessibilityHelp.js';
import { IAutomationRunner } from '../../common/automations/automationRunner.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { PlaceholderAutomationRunner } from './automationRunner.js';
import { AutomationScheduler } from './automationScheduler.js';
import { AutomationService } from './automationService.js';

registerSingleton(IAutomationService, AutomationService, InstantiationType.Delayed);
registerSingleton(IAutomationRunner, PlaceholderAutomationRunner, InstantiationType.Delayed);

registerWorkbenchContribution2(AutomationScheduler.ID, AutomationScheduler, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register(new AutomationsAccessibilityHelp());
