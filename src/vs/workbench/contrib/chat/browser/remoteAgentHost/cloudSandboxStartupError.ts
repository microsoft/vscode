/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../../base/common/actions.js';
import { IErrorWithActions } from '../../../../../base/common/errorMessage.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { parseGitHubRequestId } from '../../../../../platform/github/common/client/headers.js';
import { parseMissionControlErrorCode } from '../../../../../platform/github/common/missionControl/missionControlError.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatCommandButton } from '../../common/chatService/chatService.js';

const SHOW_DETAILS_COMMAND_ID = 'workbench.action.chat.cloudSandbox.showStartupErrorDetails';
const showDetailsTitle = localize2('cloudSandbox.showStartupErrorDetails', "Show Details");

type StartupFailureKind = 'authentication' | 'access' | 'missing' | 'disabled' | 'rateLimit' | 'invalid' | 'conflict' | 'unknown';

const failureKinds = new Map<string, StartupFailureKind>([
	['unauthenticated', 'authentication'], ['authentication_required', 'authentication'], ['token_required', 'authentication'],
	['forbidden', 'access'], ['resource_access_denied', 'access'], ['actor_blocked', 'access'], ['issuance_denied', 'access'],
	['environment_provisioning_forbidden', 'access'], ['environment_connection_forbidden', 'access'],
	['not_found', 'missing'], ['session_not_found', 'missing'], ['task_not_found', 'missing'], ['environment_not_found', 'missing'],
	['feature_disabled', 'disabled'], ['rate_limit_exceeded', 'rateLimit'],
	['bad_request', 'invalid'], ['validation_failed', 'invalid'], ['invalid_request', 'invalid'],
	['session_id_conflict', 'conflict'],
]);

function failureKind(error: unknown, status: number | undefined, code: string | undefined, retryAfter: number | undefined): StartupFailureKind {
	if (error instanceof CloudSandboxAuthenticationRequiredError) {
		return 'authentication';
	}
	const fromCode = code === undefined ? undefined : failureKinds.get(code);
	if (fromCode) {
		return fromCode;
	}
	switch (status) {
		case 401: return 'authentication';
		case 403: return retryAfter === undefined ? 'access' : 'rateLimit';
		case 404: return 'missing';
		case 429: return 'rateLimit';
		case 400:
		case 422: return 'invalid';
		case 409: return 'conflict';
		default: return 'unknown';
	}
}

function failureMessage(kind: StartupFailureKind, retryAfter: number | undefined): string {
	switch (kind) {
		case 'authentication': return localize('cloudSandbox.startup.signIn', "Sign in to GitHub to continue.");
		case 'access': return localize('cloudSandbox.startup.accessDenied', "GitHub denied access. Check your repository access and your organization's cloud session settings.");
		case 'missing': return localize('cloudSandbox.startup.notFound', "GitHub couldn't find or allow access to a required resource.");
		case 'disabled': return localize('cloudSandbox.startup.disabled', "Cloud sessions are not enabled for this account or organization.");
		case 'rateLimit': return retryAfter
			? localize('cloudSandbox.startup.rateLimitedFor', "GitHub is limiting requests. Wait {0} seconds before trying again.", retryAfter)
			: localize('cloudSandbox.startup.rateLimited', "GitHub is limiting requests. Wait before trying again.");
		case 'invalid': return localize('cloudSandbox.startup.invalid', "The cloud session request is not valid. Check your repository and session settings.");
		case 'conflict': return localize('cloudSandbox.startup.conflict', "GitHub reported a conflicting operation. Check your cloud sessions before trying again.");
		case 'unknown': return localize('cloudSandbox.startup.unknown', "Check your connection and your cloud sessions before trying again.");
	}
}

/** A user-facing startup failure whose details contain only bounded response metadata. */
export class CloudSandboxStartupError extends Error implements IErrorWithActions {
	readonly actions: IAction[];
	readonly detailsCommand: IChatCommandButton;

	constructor(
		error: unknown,
		phase: 'preparation' | 'creation' | 'connection',
		@ICommandService commandService: ICommandService,
	) {
		const requestError = error instanceof CloudSandboxRequestError ? error : undefined;
		const status = requestError?.statusCode;
		const statusCode = status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
		const code = parseMissionControlErrorCode(requestError?.code);
		const requestId = parseGitHubRequestId(requestError?.requestId);
		const delay = requestError?.retryAfterSeconds;
		const retryAfter = delay !== undefined && delay >= 0 && Number.isSafeInteger(Math.ceil(delay)) ? Math.ceil(delay) : undefined;
		const kind = failureKind(error, statusCode, code, retryAfter);
		const reason = phase === 'preparation' && kind === 'unknown'
			? localize('cloudSandbox.startup.preparationUnknown', "Check your session settings and GitHub sign-in before trying again.")
			: failureMessage(kind, retryAfter);
		super(phase === 'connection'
			? localize('cloudSandbox.startup.connectionFailed', "Cloud setup started, but VS Code couldn't connect. {0}", reason)
			: phase === 'preparation'
				? localize('cloudSandbox.startup.preparationFailed', "Couldn't prepare the cloud session. {0}", reason)
				: kind === 'unknown'
					? localize('cloudSandbox.startup.creationUnconfirmed', "Couldn't confirm whether the cloud session was created. Check your cloud sessions before starting another.")
					: localize('cloudSandbox.startup.creationFailed', "Couldn't start the cloud session. {0}", reason));
		this.name = 'CloudSandboxStartupError';

		const details = [
			phase === 'preparation'
				? localize('cloudSandbox.startup.preparationStep', "Step: Prepare cloud session")
				: phase === 'creation'
					? localize('cloudSandbox.startup.creationStep', "Step: Create cloud session")
					: localize('cloudSandbox.startup.connectionStep', "Step: Connect to cloud session"),
			...(statusCode === undefined ? [] : [localize('cloudSandbox.startup.httpStatus', "HTTP status: {0}", statusCode)]),
			...(code === undefined ? [] : [localize('cloudSandbox.startup.errorCode', "Error code: {0}", code)]),
			...(requestId === undefined ? [] : [localize('cloudSandbox.startup.requestId', "Request reference: {0}", requestId)]),
			...(retryAfter === undefined ? [] : [localize('cloudSandbox.startup.retryAfter', "Requested wait: {0} seconds", retryAfter)]),
		].join('\n');
		this.detailsCommand = {
			kind: 'command',
			command: { id: SHOW_DETAILS_COMMAND_ID, title: showDetailsTitle.value, arguments: [this.message, details] },
		};
		this.actions = [toAction({
			id: SHOW_DETAILS_COMMAND_ID,
			label: showDetailsTitle.value,
			run: () => commandService.executeCommand(SHOW_DETAILS_COMMAND_ID, this.message, details),
		})];
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({ id: SHOW_DETAILS_COMMAND_ID, title: showDetailsTitle, f1: false, precondition: ChatContextKeys.enabled });
	}

	override async run(accessor: ServicesAccessor, message: unknown, details: unknown): Promise<void> {
		if (typeof message !== 'string' || typeof details !== 'string' || message.length > 4096 || details.length > 4096) {
			throw new Error(localize('cloudSandbox.startup.invalidDetails', "Cloud session error details are unavailable."));
		}
		await accessor.get(IDialogService).error(message, details);
	}
});
