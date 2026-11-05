/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostCustomizationService } from '../../agentHost/browser/agentHostCustomizationService.js';
import { ISessionsService, SessionsService } from './sessionsService.js';
import { ISessionHostService, IFocusedSessionHostService } from './sessionHost.js';
import { SessionHostService, FocusedSessionHostService } from './sessionHostService.js';
import { IChatHostOpenerService, ChatHostOpenerService } from './chatHostOpener.js';
import { ISessionsListModelService, SessionsListModelService } from './sessionsListModelService.js';
import { ISessionGroupsService, SessionGroupsService } from './sessionGroupsService.js';
import { ISessionComparisonService } from '../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { SessionComparisonService } from './sessionComparisonService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from './sessionSectionOrderService.js';
import { IAgentHostFilterService } from '../../agentHostFilter/common/agentHostFilter.js';
import { AgentHostFilterService } from '../../agentHostFilter/browser/agentHostFilterService.js';
import { ISessionRepositoryPicker } from '../../presentation/browser/sessionRepositoryPicker.js';
import { DefaultSessionRepositoryPicker } from '../../presentation/browser/defaultSessionRepositoryPicker.js';
import { ISessionsListPresentation } from '../../presentation/browser/sessionsListPresentation.js';
import { DefaultSessionsListPresentation } from '../../presentation/browser/defaultSessionsListPresentation.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from './sessionOpenTelemetryService.js';
import { ISessionsProvidersService, SessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from './sessionsRecentWorkspacesService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionsManagementService } from './sessionsManagementService.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../workbench/contrib/sessions/common/sessionChangesStatsCache.js';

// The session services are implemented in modules that do not register themselves, so that a window loads them only
// when its entry point imports this module.
registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
registerSingleton(IAgentHostCustomizationService, AgentHostCustomizationService, InstantiationType.Delayed);
registerSingleton(IChatHostOpenerService, ChatHostOpenerService, InstantiationType.Delayed);
registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
registerSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
registerSingleton(ISessionOpenTelemetryService, SessionOpenTelemetryService, InstantiationType.Delayed);
registerSingleton(ISessionsService, SessionsService, InstantiationType.Eager);
registerSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
registerSingleton(ISessionSectionOrderService, SessionSectionOrderService, InstantiationType.Delayed);
registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
registerSingleton(ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService, InstantiationType.Delayed);
registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
registerSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
registerSingleton(ISessionRepositoryPicker, DefaultSessionRepositoryPicker, InstantiationType.Delayed);
registerSingleton(ISessionsListPresentation, DefaultSessionsListPresentation, InstantiationType.Delayed);
registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
