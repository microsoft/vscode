/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSession } from '../../../../platform/agentHost/common/agent.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { parseRemoteAgentHostHarness } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { getAutomationTelemetryIsolation, getAutomationTelemetryMode, getAutomationTelemetryPermissionLevel, getAutomationTelemetryProvider, type IAutomationConfigurationTelemetry, type IAutomationRunTelemetry } from '../../../../platform/telemetry/common/automationTelemetry.js';
import { toTelemetryModel } from '../../../../platform/telemetry/common/languageModelTelemetry.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { isByokModel } from '../../../../workbench/contrib/chat/common/chatSelectedModel.js';
import { isAgentHostTarget, isLocalAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import type { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { hashSessionIdForTelemetry } from '../../../common/sessionsTelemetry.js';

export function getAutomationConfigurationTelemetry(automation: IAutomationDescriptor, languageModelsService: ILanguageModelsService): IAutomationConfigurationTelemetry {
	const template = automation.sessionTemplate;
	const configuredModelId = template ? template.modelId : automation.modelId;
	const metadata = configuredModelId ? languageModelsService.lookupLanguageModel(configuredModelId) : undefined;
	const modelId = metadata?.id ?? configuredModelId;
	const modelKind = metadata && isByokModel(metadata)
		? 'byok'
		: metadata && (metadata.vendor === 'copilot' || isAgentHostTarget(metadata.vendor)) ? 'trusted' : 'unknown';
	return {
		provider: getAutomationSessionProvider(automation.target.sessionTypeId),
		model: toTelemetryModel(modelId, modelId === 'auto' ? 'trusted' : modelKind),
		modelSelectionKind: configuredModelId === undefined ? 'default' : modelId === 'auto' ? 'auto' : 'explicit',
		mode: getAutomationTelemetryMode(template ? template.config?.[SessionConfigKey.Mode] : automation.mode),
		permissionLevel: getAutomationTelemetryPermissionLevel(template ? template.config?.[SessionConfigKey.AutoApprove] : automation.permissionLevel),
		isolationMode: automation.target.kind === 'workspace' ? getAutomationTelemetryIsolation(automation.target.isolation.kind) : 'none',
		targetKind: automation.target.kind,
		folderCount: automation.target.kind === 'workspace' ? 1 : 0,
		hasCustomAgent: template?.agent !== undefined,
	};
}

export function getAutomationRunTelemetry(run: IAutomationRun): IAutomationRunTelemetry {
	const resource = run.sessionResource;
	return {
		automationId: run.automationId,
		runId: run.id,
		executionAuthority: 'browser',
		trigger: run.trigger,
		runCreatedAt: run.startedAt,
		sessionProvider: resource ? getAutomationSessionProvider(getChatSessionType(resource)) : undefined,
		agentSessionId: resource && isAgentHostTarget(resource.scheme) ? AgentSession.id(resource) : undefined,
		agentsWindowSessionId: run.sessionId === undefined ? undefined : hashSessionIdForTelemetry(run.sessionId),
		sessionCreated: resource !== undefined,
	};
}

function getAutomationSessionProvider(sessionType: string | undefined): IAutomationConfigurationTelemetry['provider'] {
	const provider = sessionType && isLocalAgentHostTarget(sessionType)
		? sessionType.slice(LOCAL_AGENT_HOST_SCHEME_PREFIX.length)
		: sessionType ? parseRemoteAgentHostHarness(sessionType) ?? sessionType : undefined;
	return getAutomationTelemetryProvider(provider);
}
