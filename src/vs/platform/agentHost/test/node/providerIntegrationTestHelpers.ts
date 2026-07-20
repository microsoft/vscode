/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { SubscribeResult } from '../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { MessageKind, ROOT_STATE_URI, buildDefaultChatUri, type MessageAttachment, type SessionState } from '../../common/state/sessionState.js';
import type { TestProtocolClient } from './serverIntegrationTestHelpers.js';

export interface IAgentHostProviderTestConfig {
	readonly provider: string;
	readonly scheme: string;
	readonly githubToken: string;
}

export async function createProviderSession(
	client: TestProtocolClient,
	config: IAgentHostProviderTestConfig,
	clientId: string,
	trackingList: string[],
	workingDirectory: URI,
): Promise<string> {
	client.setWorkingDirectory(workingDirectory.fsPath);
	await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
	await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken }, 30_000);

	const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
	await client.call('createSession', {
		channel: sessionUri,
		provider: config.provider,
		workingDirectory: workingDirectory.toString(),
		config: { isolation: 'folder' },
	}, 30_000);
	trackingList.push(sessionUri);

	const subscribeResult = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
	void (subscribeResult.snapshot!.state as SessionState);
	await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
	client.clearReceived();

	return sessionUri;
}

export function dispatchTurn(client: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
	client.dispatch({
		channel: buildDefaultChatUri(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text, origin: { kind: MessageKind.User } },
		},
	});
}

export function dispatchTurnWithAttachments(client: TestProtocolClient, session: string, turnId: string, text: string, attachments: readonly MessageAttachment[], clientSeq: number): void {
	client.dispatch({
		channel: buildDefaultChatUri(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text, origin: { kind: MessageKind.User }, attachments: [...attachments] },
		},
	});
}
