/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatSessionPosition, getResourceForNewChatSession, openChatSession } from '../browser/chatSessions/chatSessions.contribution.js';
import { configureEvaluationRemoteHost, EVALUATION_SESSION_REQUEST_ARG, getEvaluationSessionConfig, markEvaluationSessionRequestActive, readEvaluationSessionRequest, waitForEvaluationTarget, writeEvaluationSessionError, writeEvaluationSessionIdentity } from '../browser/agentSessions/evaluation/evaluationSessionRequest.js';

class EvaluationSessionEditorContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.evaluationSessionEditor';

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const path = environmentService.args[EVALUATION_SESSION_REQUEST_ARG];
		if (!path) {
			return;
		}
		markEvaluationSessionRequestActive();
		void instantiationService.invokeFunction(accessor => runEditorEvaluationSession(path, accessor));
	}
}

async function runEditorEvaluationSession(path: string, accessor: ServicesAccessor): Promise<void> {
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const instantiationService = accessor.get(IInstantiationService);
	const chatSessionsService = accessor.get(IChatSessionsService);
	const chatService = accessor.get(IChatService);
	const configurationService = accessor.get(IConfigurationService);
	try {
		const request = await readEvaluationSessionRequest(path, fileService);
		if (request.surface !== 'editor') {
			throw new Error(`Evaluation session request targets '${request.surface}', not 'editor'.`);
		}
		const type = await configureEvaluationRemoteHost(request, configurationService) ?? `agent-host-${request.agent}`;
		await waitForEvaluationTarget(
			() => chatSessionsService.getChatSessionContribution(type) !== undefined,
			chatSessionsService.onDidChangeItemsProviders,
			CancellationToken.None,
		);

		const openOptions = {
			type,
			position: ChatSessionPosition.Editor,
			displayName: `${request.agent} evaluation`,
		};
		const sessionResource = getResourceForNewChatSession(openOptions);
		await instantiationService.invokeFunction(openAccessor => openChatSession(openAccessor, openOptions));
		await writeEvaluationSessionIdentity(path, fileService, request, sessionResource);

		const result = await chatService.sendRequest(sessionResource, request.prompt, {
			agentIdSilent: type,
			userSelectedModelId: request.modelId,
			agentHostSessionConfig: { ...getEvaluationSessionConfig(request.agent, request.approvals) },
		});
		if (result.kind !== 'sent' && result.kind !== 'rejected') {
			throw new Error(`Evaluation session request was not sent (${result.kind}).`);
		}
		await writeEvaluationSessionIdentity(path, fileService, request, result.newSessionResource ?? sessionResource);
	} catch (error) {
		logService.error('[EvaluationSession] Editor run failed.', error);
		await writeEvaluationSessionError(path, fileService, error);
	}
}

registerWorkbenchContribution2(EvaluationSessionEditorContribution.ID, EvaluationSessionEditorContribution, WorkbenchPhase.AfterRestored);
