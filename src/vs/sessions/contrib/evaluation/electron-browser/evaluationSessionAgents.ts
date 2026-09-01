/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { configureEvaluationRemoteHost, evaluationSessionStartingLabel, getEvaluationSessionConfig, isEvaluationAutoApprovePolicyRestricted, markEvaluationSessionRequestActive, readEvaluationSessionRequest, waitForEvaluationTarget, writeEvaluationSessionError, writeEvaluationSessionIdentity } from '../../../../workbench/contrib/chat/browser/agentSessions/evaluation/evaluationSessionRequest.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class EvaluationSessionAgentsRunner extends Disposable {
	private readonly evaluationStore = this._register(new DisposableStore());

	constructor(
		path: string,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService sessionsService: ISessionsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
	) {
		super();
		markEvaluationSessionRequestActive();
		void runAgentsEvaluationSession(
			path,
			fileService,
			logService,
			sessionsManagementService,
			sessionsService,
			configurationService,
			remoteAgentHostService,
			this.evaluationStore,
		);
	}
}

async function runAgentsEvaluationSession(
	path: string,
	fileService: IFileService,
	logService: ILogService,
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	configurationService: IConfigurationService,
	remoteAgentHostService: IRemoteAgentHostService,
	evaluationStore: DisposableStore,
): Promise<void> {
	try {
		const request = await readEvaluationSessionRequest(path, fileService);
		if (request.surface !== 'agents') {
			throw new Error(`Evaluation session request targets '${request.surface}', not 'agents'.`);
		}
		const remoteHostRegistration = configureEvaluationRemoteHost(request, remoteAgentHostService);
		if (remoteHostRegistration) {
			evaluationStore.add(remoteHostRegistration);
		}
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
			activity: evaluationSessionStartingLabel(),
			resolve: async () => {
				if (!identityWritten) {
					throw new Error('Evaluation session was not created.');
				}
				await identityWritten;
				return {
					query: request.prompt,
					agentHostSessionConfig: {
						...getEvaluationSessionConfig(
							request.agent,
							request.approvals,
							isEvaluationAutoApprovePolicyRestricted(configurationService),
						),
					},
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
