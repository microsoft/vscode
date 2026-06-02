/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { SessionsAutomationRunner } from './sessionsAutomationRunner.js';

// Override the placeholder runner registered by the workbench contribution
// with the real sessions-aware runner. Singleton registry consumers use the
// last registration for a given identifier, so this works as long as
// `sessions.common.main.ts` imports this file AFTER it imports the workbench
// `automations.contribution.js`.
registerSingleton(IAutomationRunner, SessionsAutomationRunner, InstantiationType.Delayed);
