/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { AutomationScheduler } from './automationScheduler.js';
import { AutomationService } from './automationService.js';

registerSingleton(IAutomationService, AutomationService, InstantiationType.Delayed);

registerWorkbenchContribution2(AutomationScheduler.ID, AutomationScheduler, WorkbenchPhase.AfterRestored);
