/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation, raceTimeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { agentHostAuthority, normalizeRemoteAgentHostAddress } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';

export const EVALUATION_SESSION_REQUEST_ARG = 'evaluation-session-request';

export type EvaluationSessionSurface = 'agents' | 'editor';
export type EvaluationSessionAgent = 'copilotcli' | 'claude' | 'codex';
export type EvaluationSessionApprovals = 'yolo' | 'assisted';

export interface IEvaluationSessionRequest {
	readonly version: 1;
	readonly surface: EvaluationSessionSurface;
	readonly agent: EvaluationSessionAgent;
	readonly approvals: EvaluationSessionApprovals;
	readonly prompt: string;
	readonly modelId?: string;
	readonly folder?: string;
	readonly remoteHost?: {
		readonly address: string;
		readonly connectionToken: string;
	};
}

export interface IEvaluationSessionIdentity {
	readonly version: 1;
	readonly surface: EvaluationSessionSurface;
	readonly sessionResource: string;
	readonly backendSession: string;
}

const evaluationRemoteHostsWithExternalAuthentication = new Set<string>();
let evaluationSessionRequestActive = false;

export function markEvaluationSessionRequestActive(): void {
	evaluationSessionRequestActive = true;
}

export function isEvaluationSessionRequestActive(): boolean {
	return evaluationSessionRequestActive;
}

export function preserveEvaluationRemoteHostAuthentication(address: string): void {
	evaluationRemoteHostsWithExternalAuthentication.add(normalizeRemoteAgentHostAddress(address));
}

export function shouldPreserveEvaluationRemoteHostAuthentication(address: string): boolean {
	return evaluationRemoteHostsWithExternalAuthentication.has(normalizeRemoteAgentHostAddress(address));
}

export interface IEvaluationRemoteHostRegistration extends IDisposable {
	readonly sessionType: string;
}

export function configureEvaluationRemoteHost(request: IEvaluationSessionRequest, remoteAgentHostService: IRemoteAgentHostService): IEvaluationRemoteHostRegistration | undefined {
	if (!request.remoteHost) {
		return undefined;
	}
	preserveEvaluationRemoteHostAuthentication(request.remoteHost.address);
	const disposable = remoteAgentHostService.addTransientRemoteAgentHost({
		name: 'evaluation',
		connectionToken: request.remoteHost.connectionToken,
		connection: {
			type: RemoteAgentHostEntryType.WebSocket,
			address: request.remoteHost.address,
		},
	});
	return {
		sessionType: remoteAgentHostSessionTypeId(agentHostAuthority(request.remoteHost.address), request.agent),
		dispose: () => disposable.dispose(),
	};
}

export function parseEvaluationSessionRequest(raw: string): IEvaluationSessionRequest {
	const value: unknown = JSON.parse(raw);
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Evaluation session request must be an object.');
	}
	const request = value as Record<string, unknown>;
	if (request.version !== 1) {
		throw new Error('Evaluation session request version must be 1.');
	}
	if (request.surface !== 'agents' && request.surface !== 'editor') {
		throw new Error('Evaluation session surface must be "agents" or "editor".');
	}
	if (request.agent !== 'copilotcli' && request.agent !== 'claude' && request.agent !== 'codex') {
		throw new Error('Evaluation session agent must be "copilotcli", "claude", or "codex".');
	}
	if (request.approvals !== 'yolo' && request.approvals !== 'assisted') {
		throw new Error('Evaluation session approvals must be "yolo" or "assisted".');
	}
	if (typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
		throw new Error('Evaluation session prompt must be a non-empty string.');
	}
	if (request.modelId !== undefined && typeof request.modelId !== 'string') {
		throw new Error('Evaluation session modelId must be a string.');
	}
	if (request.surface === 'agents' && typeof request.folder !== 'string') {
		throw new Error('Agents evaluation sessions require a folder URI.');
	}
	if (request.folder !== undefined && typeof request.folder !== 'string') {
		throw new Error('Evaluation session folder must be a string.');
	}
	if (request.remoteHost !== undefined) {
		if (!request.remoteHost || typeof request.remoteHost !== 'object' || Array.isArray(request.remoteHost)) {
			throw new Error('Evaluation session remoteHost must be an object.');
		}
		const remoteHost = request.remoteHost as Record<string, unknown>;
		if (typeof remoteHost.address !== 'string' || typeof remoteHost.connectionToken !== 'string') {
			throw new Error('Evaluation session remoteHost requires address and connectionToken strings.');
		}
	}
	return request as unknown as IEvaluationSessionRequest;
}

export function isEvaluationAutoApprovePolicyRestricted(configurationService: IConfigurationService): boolean {
	return configurationService.inspect<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID).policyValue === false;
}

export function evaluationSessionStartingLabel(): string {
	return localize('evaluationSession.starting', "Starting evaluation");
}

export function getEvaluationSessionConfig(agent: EvaluationSessionAgent, approvals: EvaluationSessionApprovals, policyRestricted = false): Readonly<Record<string, string>> {
	if (policyRestricted) {
		return agent === 'copilotcli' ? { [SessionConfigKey.Mode]: 'autopilot' } : {};
	}
	switch (agent) {
		case 'copilotcli':
			return {
				[SessionConfigKey.Mode]: 'autopilot',
				[SessionConfigKey.AutoApprove]: approvals === 'yolo' ? 'autoApprove' : 'assisted',
			};
		case 'claude':
			return {
				[ClaudeSessionConfigKey.PermissionMode]: approvals === 'yolo' ? 'bypassPermissions' : 'auto',
			};
		case 'codex':
			return {
				[CodexSessionConfigKey.PermissionsPreset]: approvals === 'yolo' ? 'full-access' : 'auto-review',
			};
	}
}

export async function readEvaluationSessionRequest(path: string, fileService: IFileService): Promise<IEvaluationSessionRequest> {
	const content = await fileService.readFile(URI.file(path));
	return parseEvaluationSessionRequest(content.value.toString());
}

export async function writeEvaluationSessionIdentity(path: string, fileService: IFileService, request: IEvaluationSessionRequest, sessionResource: URI): Promise<void> {
	const result: IEvaluationSessionIdentity = {
		version: 1,
		surface: request.surface,
		sessionResource: sessionResource.toString(),
		backendSession: AgentSession.uri(request.agent, AgentSession.id(sessionResource)).toString(),
	};
	await fileService.writeFile(evaluationSessionResultResource(path), VSBuffer.fromString(`${JSON.stringify(result, undefined, 2)}\n`));
}

export async function writeEvaluationSessionError(path: string, fileService: IFileService, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await fileService.writeFile(evaluationSessionResultResource(path), VSBuffer.fromString(`${JSON.stringify({ version: 1, error: message }, undefined, 2)}\n`));
}

export async function waitForEvaluationTarget(isAvailable: () => boolean, onDidChange: Event<unknown>, token: CancellationToken, timeoutMs = 60_000): Promise<void> {
	if (isAvailable()) {
		return;
	}
	const ready = new DeferredPromise<void>();
	const listener = onDidChange(() => {
		if (isAvailable()) {
			ready.complete();
		}
	});
	try {
		if (isAvailable()) {
			ready.complete();
		}
		const result = await raceCancellation(
			raceTimeout(ready.p.then(() => true), timeoutMs),
			token,
		);
		if (result !== true) {
			throw new Error(`Evaluation session target was not available within ${timeoutMs}ms.`);
		}
	} finally {
		listener.dispose();
	}
}

function evaluationSessionResultResource(path: string): URI {
	return joinPath(dirname(URI.file(path)), 'session.json');
}
