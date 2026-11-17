/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

/** Context of one automation for its More Actions menu, shared by the cards and the experimental layouts. */
export const AutomationCardCanDeleteContext = new RawContextKey<boolean>('sessionsAutomationCardCanDelete', false);
export const AutomationCardCanUpdateContext = new RawContextKey<boolean>('sessionsAutomationCardCanUpdate', false);
export const AutomationCardHasExternalResourceContext = new RawContextKey<boolean>('sessionsAutomationCardHasExternalResource', false);
export const AutomationCardEnabledContext = new RawContextKey<boolean>('sessionsAutomationCardEnabled', false);
export const AutomationCardHasLimitsContext = new RawContextKey<boolean>('sessionsAutomationCardHasLimits', false);
export const AutomationCardIsCloudContext = new RawContextKey<boolean>('sessionsAutomationCardIsCloud', false);
export const AutomationCardHasEventTriggerContext = new RawContextKey<boolean>('sessionsAutomationCardHasEventTrigger', false);
