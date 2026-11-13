/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionsNavigationService } from '../../../../workbench/contrib/sessions/browser/sessionsNavigationService.js';
import { SessionsServiceNavigationService } from '../../../../workbench/contrib/sessions/browser/sessionsServiceNavigationService.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostCustomizationService } from '../../../../workbench/contrib/sessions/browser/agentHostCustomizationService.js';
import { ISessionsService, SessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionHostService, IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { SessionHostService, FocusedSessionHostService } from '../../../../workbench/contrib/sessions/browser/sessionHostService.js';
import { IChatHostOpenerService, ChatHostOpenerService } from '../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionGroupsService, SessionGroupsService } from '../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ISessionComparisonService } from '../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { SessionComparisonService } from '../../../../workbench/contrib/sessions/browser/sessionComparisonService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../workbench/services/sessions/browser/sessionSectionOrderService.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../../../../workbench/contrib/sessions/browser/sessionOpenTelemetryService.js';
import { ISessionsProvidersService, SessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from '../../../../workbench/contrib/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionsManagementService } from '../../../../workbench/contrib/sessions/browser/sessionsManagementService.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../workbench/services/sessions/common/sessionChangesStatsCache.js';
import { ISessionDraftsService, SessionDraftsService } from '../../../../workbench/contrib/sessions/browser/sessionDraftsService.js';
import { IScheduledChatsService, ScheduledChatsService } from '../../../../workbench/contrib/sessions/browser/scheduledChatsService.js';

// The session services are implemented in modules that do not register themselves, so that a window loads them only
// when its entry point imports this module.
registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
registerSingleton(IAgentHostCustomizationService, AgentHostCustomizationService, InstantiationType.Delayed);
registerSingleton(IChatHostOpenerService, ChatHostOpenerService, InstantiationType.Delayed);
registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
registerSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
registerSingleton(ISessionOpenTelemetryService, SessionOpenTelemetryService, InstantiationType.Delayed);
registerSingleton(ISessionsService, SessionsService, InstantiationType.Eager);
registerSingleton(ISessionsNavigationService, SessionsServiceNavigationService, InstantiationType.Delayed);
registerSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
registerSingleton(ISessionSectionOrderService, SessionSectionOrderService, InstantiationType.Delayed);
registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
registerSingleton(ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService, InstantiationType.Delayed);
registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
registerSingleton(ISessionDraftsService, SessionDraftsService, InstantiationType.Delayed);
registerSingleton(IScheduledChatsService, ScheduledChatsService, InstantiationType.Delayed);
