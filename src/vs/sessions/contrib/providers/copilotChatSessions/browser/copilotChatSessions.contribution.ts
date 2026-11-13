/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { DefaultSessionsProviderContribution } from '../../../../../workbench/contrib/sessions/providers/copilotChatSessions/browser/copilotChatSessionsProvidersRegistration.js';

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
