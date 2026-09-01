/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../../workbench/services/environment/electron-browser/environmentService.js';
import { configureEvaluationRemoteHost, EVALUATION_SESSION_REQUEST_ARG, getEvaluationSessionConfig, markEvaluationSessionRequestActive, readEvaluationSessionRequest, waitForEvaluationTarget, writeEvaluationSessionError, writeEvaluationSessionIdentity } from '../../../../workbench/contrib/chat/browser/agentSessions/evaluation/evaluationSessionRequest.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
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
		markEvaluationSessionRequestActive();
		void instantiationService.invokeFunction(accessor => runAgentsEvaluationSession(path, accessor));
	}
}

async function runAgentsEvaluationSession(path: string, accessor: ServicesAccessor): Promise<void> {
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);
	const sessionsService = accessor.get(ISessionsService);
	const configurationService = accessor.get(IConfigurationService);
	try {
		const request = await readEvaluationSessionRequest(path, fileService);
		if (request.surface !== 'agents') {
			throw new Error(`Evaluation session request targets '${request.surface}', not 'agents'.`);
		}
		await configureEvaluationRemoteHost(request, configurationService);
		const folder = URI.parse(request.folder!);
		const createOptions = { sessionTypeId: request.agent };
		await waitForEvaluationTarget(
			() => sessionsManagementService.isNewSessionTargetAvailable(folder, createOptions),
			sessionsManagementService.onDidChangeSessionTypes,
			CancellationToken.None,
		);

		let identityWritten: Promise<void> | undefined;
		const session = await sessionsManagementService.createAndSendNewChatRequest(folder, {
			kind: 'deferred',
			activity: 'Starting evaluation',
			resolve: async () => {
				if (!identityWritten) {
					throw new Error('Evaluation session was not created.');
				}
				await identityWritten;
				return {
					query: request.prompt,
					agentHostSessionConfig: { ...getEvaluationSessionConfig(request.agent, request.approvals) },
				};
			},
		}, {
			...createOptions,
			modelId: request.modelId,
			onSessionCreated: session => {
				identityWritten = writeEvaluationSessionIdentity(path, fileService, request, session.resource);
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

registerWorkbenchContribution2(EvaluationSessionAgentsContribution.ID, EvaluationSessionAgentsContribution, WorkbenchPhase.AfterRestored);
