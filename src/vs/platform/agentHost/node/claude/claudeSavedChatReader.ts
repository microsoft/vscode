/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import type { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSession, CLAUDE_AGENT_PROVIDER_ID } from '../../common/agent.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ChatOriginKind, type Turn } from '../../common/state/protocol/state.js';
import { decodeProviderData } from '../agentChatBackings.js';
import type { IAgentHostSavedChatBacking, IAgentHostSavedChatReadContext, IAgentHostSavedChatReader } from '../agentHostSavedChatService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { mapSessionMessagesToTurns } from './claudeReplayMapper.js';
import { scanTranscriptForAgentIds } from './claudeSubagentRegistry.js';
import { ClaudeTerminalOutputs } from './claudeTerminalOutput.js';

/** Reads saved SDK files without materializing or preparing an executable Claude chat. */
export class ClaudeSavedChatReader implements IAgentHostSavedChatReader {

	private readonly _terminalOutputs: ClaudeTerminalOutputs;

	constructor(
		@IClaudeAgentSdkService private readonly _sdk: IClaudeAgentSdkService,
		@IFileService fileService: IFileService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._terminalOutputs = new ClaudeTerminalOutputs(fileService, sessionDataService, _logService);
	}

	async read(context: IAgentHostSavedChatReadContext, token: CancellationToken): Promise<readonly Turn[]> {
		throwIfCancelled(token);
		const spawn = context.origin?.kind === ChatOriginKind.Tool ? context.origin : undefined;
		const parent = spawn ? context.parent : undefined;
		if (spawn && (!parent || parent.chat.toString() !== spawn.chat)) {
			throw new Error(localize('claude.savedChat.missingParent', "The saved Claude subagent transcript has no parent backing."));
		}
		const sdkSessionId = readSdkSessionId(parent ?? context);
		const available = await this._sdk.canLoadWithoutDownload();
		throwIfCancelled(token);
		if (!available) {
			throw new Error(localize('claude.savedChat.sdkUnavailable', "The local Claude history reader is not available."));
		}
		let turns = await this._readTranscript(sdkSessionId, parent?.chat ?? context.chat, token);
		if (spawn) {
			const agentId = scanTranscriptForAgentIds(turns).get(spawn.toolCallId);
			if (!agentId) {
				throw new Error(localize('claude.savedChat.missingSubagent', "The saved Claude subagent transcript could not be located."));
			}
			const messages = await this._sdk.getSubagentMessages(sdkSessionId, agentId);
			throwIfCancelled(token);
			turns = mapSessionMessagesToTurns(messages, context.chat, this._logService);
			if (turns.length === 0) {
				throw new Error(localize('claude.savedChat.unreadableSubagent', "The saved Claude subagent transcript could not be read."));
			}
		}
		await this._terminalOutputs.restore(context.storageResource, context.session, context.chat, turns);
		throwIfCancelled(token);
		return turns;
	}

	private async _readTranscript(sdkSessionId: string, chat: URI, token: CancellationToken): Promise<readonly Turn[]> {
		const messages = await this._sdk.getSessionMessages(sdkSessionId, { includeSystemMessages: true });
		throwIfCancelled(token);
		const turns = mapSessionMessagesToTurns(messages, chat, this._logService);
		if (turns.length > 0) {
			return turns;
		}
		// The SDK also returns [] for a missing transcript. Its metadata utility
		// can identify a saved, titled conversation with no messages yet.
		const info = messages.length === 0 ? await this._sdk.getSessionInfo(sdkSessionId) : undefined;
		throwIfCancelled(token);
		if (!info || info.sessionId !== sdkSessionId || info.firstPrompt) {
			throw new Error(localize('claude.savedChat.unreadableTranscript', "The saved Claude transcript could not be read."));
		}
		return turns;
	}
}

function readSdkSessionId(context: IAgentHostSavedChatBacking): string {
	if (context.providerData !== undefined) {
		const backing = decodeProviderData(context.providerData);
		if (backing) {
			return backing.sdkSessionId;
		}
	} else if (context.session.scheme === CLAUDE_AGENT_PROVIDER_ID && context.storageResource.toString() === context.session.toString()) {
		const legacyId = AgentSession.id(context.session);
		if (legacyId) {
			return legacyId;
		}
	}
	throw new Error(localize('claude.savedChat.invalidBacking', "The saved Claude chat backing is missing or invalid."));
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
