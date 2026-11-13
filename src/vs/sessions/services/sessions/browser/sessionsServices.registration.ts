/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './sessionsCoreServices.registration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostFilterService } from '../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { AgentHostFilterService } from '../../../../workbench/contrib/sessions/browser/agentHostFilterService.js';
import { ISessionRepositoryPicker } from '../../../../workbench/contrib/sessions/browser/sessionRepositoryPicker.js';
import { DefaultSessionRepositoryPicker } from '../../../../workbench/contrib/sessions/browser/defaultSessionRepositoryPicker.js';
import { ISessionsListPresentation } from '../../../../workbench/contrib/sessions/browser/sessionsListPresentation.js';
import { DefaultSessionsListPresentation } from '../../../../workbench/contrib/sessions/browser/defaultSessionsListPresentation.js';

registerSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
registerSingleton(ISessionRepositoryPicker, DefaultSessionRepositoryPicker, InstantiationType.Delayed);
registerSingleton(ISessionsListPresentation, DefaultSessionsListPresentation, InstantiationType.Delayed);
