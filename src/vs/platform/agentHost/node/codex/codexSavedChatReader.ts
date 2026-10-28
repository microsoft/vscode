/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSession, CODEX_AGENT_PROVIDER_ID } from '../../common/agent.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { Turn } from '../../common/state/sessionState.js';
import type { IAgentHostSavedChatReader, IAgentHostSavedChatReadContext } from '../agentHostSavedChatService.js';
import { IAgentSdkDownloader } from '../agentSdkDownloader.js';
import { decodeCodexChat } from './codexChatBacking.js';
import { toCodexModelSelectionId } from '../../common/codexModelSelection.js';
import { replayThreadToTurns } from './codexReplayMapper.js';
import { readCodexRolloutMetadata } from './codexRolloutMetadata.js';
import { readCodexSavedThreadFromDisk } from './codexSavedThreadReader.js';
import { CodexSdkPackage, codexBinaryTriple, codexPackageSuffix, resolveCodexDevSdkRoot } from './codexSdk.js';
import { CodexSessionMetadataStore } from './codexSessionMetadataStore.js';
import type { Thread } from './protocol/generated/v2/Thread.js';

export class CodexSavedChatReader implements IAgentHostSavedChatReader {
	private readonly _metadataStore: CodexSessionMetadataStore;
	private readonly _reads = new Sequencer();

	constructor(
		@ISessionDataService sessionDataService: ISessionDataService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IAgentSdkDownloader private readonly _sdkDownloader: IAgentSdkDownloader,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
	) {
		this._metadataStore = new CodexSessionMetadataStore(sessionDataService, _logService);
	}

	async read(context: IAgentHostSavedChatReadContext, token: CancellationToken): Promise<readonly Turn[]> {
		throwIfCancelled(token);
		const backing = decodeCodexChat(context.providerData);
		const legacyId = context.session.scheme === CODEX_AGENT_PROVIDER_ID && context.storageResource.toString() === context.session.toString()
			? AgentSession.id(context.session) : undefined;
		const runtimeId = backing?.sessionId || (context.providerData === undefined ? legacyId : undefined);
		if (!runtimeId) {
			throw new Error(localize('codex.savedChat.invalidBacking', "The saved Codex chat backing is missing or invalid."));
		}
		const overlay = await this._metadataStore.read(AgentSession.uri(CODEX_AGENT_PROVIDER_ID, runtimeId), true);
		throwIfCancelled(token);
		const threadId = overlay.threadId || (runtimeId === legacyId ? legacyId : undefined);
		if (!threadId) {
			throw new Error(localize('codex.savedChat.missingThread', "The saved Codex chat has no recorded native thread."));
		}
		const thread = await this._reads.queue(() => {
			throwIfCancelled(token);
			return this._readThread(threadId, token);
		});
		throwIfCancelled(token);
		const metadata = thread.path && !thread.path.endsWith('.zst')
			? await readCodexRolloutMetadata(this._fileService, thread.path)
			: undefined;
		throwIfCancelled(token);
		const models = metadata && new Map([...metadata.modelsByTurnId].map(([id, model]) => [id, { id: toCodexModelSelectionId(model.modelProvider, model.modelId) }]));
		return replayThreadToTurns(thread, models, metadata?.threadCoordinationByTurnId);
	}

	protected async _readThread(threadId: string, token: CancellationToken): Promise<Thread> {
		const root = this._sdkDownloader.isAvailable(CodexSdkPackage)
			? await this._sdkDownloader.resolveInstalledSdkRoot(CodexSdkPackage)
			: await resolveCodexDevSdkRoot();
		throwIfCancelled(token);
		const target = codexPackageSuffix(process.platform, process.arch);
		const triple = target && codexBinaryTriple(target);
		if (!root || !target || !triple) {
			throw new Error(localize('codex.savedChat.sdkUnavailable', "The local Codex history reader is not available."));
		}
		const binary = join(root, 'node_modules', `@openai/codex-${target}`, 'vendor', triple, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
		return readCodexSavedThreadFromDisk(binary, threadId, this._environmentService.userHome.fsPath, this._logService, token);
	}
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
