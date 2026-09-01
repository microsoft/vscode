/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { addWebSocketRemoteAgentHostEntry, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../../workbench/services/environment/electron-browser/environmentService.js';
import { EVALUATION_SESSION_REQUEST_ARG, getEvaluationSessionConfig, readEvaluationSessionRequest, waitForEvaluationTarget, writeEvaluationSessionError, writeEvaluationSessionIdentity } from '../../../../workbench/contrib/chat/browser/agentSessions/evaluation/evaluationSessionRequest.js';
import { isAgentHostProvider, IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

class EvaluationSessionAgentsContribution implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.evaluationSessionAgents';

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const path = environmentService.args[EVALUATION_SESSION_REQUEST_ARG];
		if (!path) {
			return;
		}
		void instantiationService.invokeFunction(accessor => runAgentsEvaluationSession(path, accessor));
	}
}

async function runAgentsEvaluationSession(path: string, accessor: ServicesAccessor): Promise<void> {
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);
	const providersService = accessor.get(ISessionsProvidersService);
	const sessionsService = accessor.get(ISessionsService);
	const configurationService = accessor.get(IConfigurationService);
	try {
		const request = await readEvaluationSessionRequest(path, fileService);
		if (request.surface !== 'agents') {
			throw new Error(`Evaluation session request targets '${request.surface}', not 'agents'.`);
		}
		if (request.remoteHost) {
			await configurationService.updateValue(RemoteAgentHostsEnabledSettingId, true, ConfigurationTarget.USER_LOCAL);
			await configurationService.updateValue(RemoteAgentHostAutoConnectSettingId, true, ConfigurationTarget.USER_LOCAL);
			await addWebSocketRemoteAgentHostEntry(configurationService, {
				name: 'evaluation',
				connectionToken: request.remoteHost.connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.WebSocket,
					address: request.remoteHost.address,
				},
			});
		}
		const folder = URI.parse(request.folder!);
		const createOptions = { sessionTypeId: request.agent };
		await waitForEvaluationTarget(
			() => sessionsManagementService.isNewSessionTargetAvailable(folder, createOptions),
			sessionsManagementService.onDidChangeSessionTypes,
			CancellationToken.None,
		);

		let preparation: Promise<void> | undefined;
		const session = await sessionsManagementService.createAndSendNewChatRequest(folder, {
			kind: 'deferred',
			activity: 'Starting evaluation',
			resolve: async () => {
				if (!preparation) {
					throw new Error('Evaluation session was not created.');
				}
				await preparation;
				return { query: request.prompt };
			},
		}, {
			...createOptions,
			modelId: request.modelId,
			onSessionCreated: session => {
				preparation = prepareAgentsSession(path, request, session, fileService, providersService);
			},
		}, CancellationToken.None);
		if (!session) {
			throw new Error('Evaluation session was not created.');
		}
		await sessionsService.openSession(session.resource);
		await writeEvaluationSessionIdentity(path, fileService, request, session.resource);
	} catch (error) {
		logService.error('[EvaluationSession] Agents run failed.', error);
		await writeEvaluationSessionError(path, fileService, error);
	}
}

async function prepareAgentsSession(
	path: string,
	request: Awaited<ReturnType<typeof readEvaluationSessionRequest>>,
	session: ISession,
	fileService: IFileService,
	providersService: ISessionsProvidersService,
): Promise<void> {
	await writeEvaluationSessionIdentity(path, fileService, request, session.resource);
	const provider = providersService.getProvider<IAgentHostSessionsProvider>(session.providerId);
	if (!provider || !isAgentHostProvider(provider)) {
		throw new Error(`Sessions provider '${session.providerId}' is not an Agent Host provider.`);
	}
	for (const [key, value] of Object.entries(getEvaluationSessionConfig(request.agent, request.approvals))) {
		await provider.setSessionConfigValue(session.sessionId, key, value);
	}
	const resolved = provider.getSessionConfig(session.sessionId)?.values;
	for (const [key, value] of Object.entries(getEvaluationSessionConfig(request.agent, request.approvals))) {
		if (resolved?.[key] !== value) {
			throw new Error(`Evaluation session configuration '${key}' was not applied.`);
		}
	}
}

registerWorkbenchContribution2(EvaluationSessionAgentsContribution.ID, EvaluationSessionAgentsContribution, WorkbenchPhase.AfterRestored);
