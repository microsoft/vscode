/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ChatContext, ChatRequestTurn2 } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../platform/log/common/logService';
import { SequencerByKey } from '../../../../util/vs/base/common/async';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatTitleProvider } from '../../../prompt/node/title';
import { IChatSessionMetadataStore } from '../../common/chatSessionMetadataStore';
import { ICustomSessionTitleService } from '../common/customSessionTitleService';

const CUSTOM_SESSION_TITLE_MEMENTO_KEY = 'github.copilot.cli.customSessionTitles';

export class CustomSessionTitleService implements ICustomSessionTitleService {
	declare readonly _serviceBrand: undefined;
	private readonly _keyedSessionGenerator = new SequencerByKey<string>();

	constructor(
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IChatSessionMetadataStore private readonly chatSessionMetadataStore: IChatSessionMetadataStore,
	) { }

	private _getCustomSessionTitles(): { [sessionId: string]: { title: string; updatedAt: number } | undefined } {
		return this.context.globalState.get<{ [sessionId: string]: { title: string; updatedAt: number } | undefined }>(CUSTOM_SESSION_TITLE_MEMENTO_KEY, {});
	}

	public async getCustomSessionTitle(sessionId: string): Promise<string | undefined> {
		// First check the metadata store (new storage location).
		const metadataTitle = await this.chatSessionMetadataStore.getCustomTitle(sessionId);
		if (metadataTitle) {
			return metadataTitle;
		}

		// Fall back to global storage (legacy) and migrate if found.
		const entries = this._getCustomSessionTitles();
		const entry = entries[sessionId];
		if (!entry) {
			return undefined;
		}
		delete entries[sessionId];

		// Migrate: store in metadata file and remove from global storage.
		await Promise.all([
			this.chatSessionMetadataStore.setCustomTitle(sessionId, entry.title),
			this.context.globalState.update(CUSTOM_SESSION_TITLE_MEMENTO_KEY, Object.keys(entries).length > 0 ? entries : undefined)
		]);

		return entry.title;
	}

	public async setCustomSessionTitle(sessionId: string, title: string): Promise<void> {
		await this.chatSessionMetadataStore.setCustomTitle(sessionId, title);
	}

	public async generateSessionTitle(sessionId: string, request: { prompt?: string; command?: string }, token: CancellationToken): Promise<string | undefined> {
		const title = await this.getCustomSessionTitle(sessionId);
		if (title) {
			return title;
		}

		return this._keyedSessionGenerator.queue(sessionId, () => this.generateSessionTitleImpl(sessionId, request, token));
	}

	private async generateSessionTitleImpl(sessionId: string, request: { prompt?: string; command?: string }, token: CancellationToken): Promise<string | undefined> {
		if (!request.prompt && !request.command) {
			return undefined;
		}
		try {
			const titleProvider = this.instantiationService.createInstance(ChatTitleProvider);
			// Construct a minimal ChatContext with the current request as a history entry so provideChatTitle can find it
			const requestTurn = new ChatRequestTurn2(request.prompt ?? '', request.command, [], '', [], [], undefined, undefined, undefined);
			const fakeContext: ChatContext = {
				history: [requestTurn],
				yieldRequested: false,
			};
			const title = await titleProvider.provideChatTitle(fakeContext, token);
			if (title) {
				await this.setCustomSessionTitle(sessionId, title);
				return title;
			}
		} catch (error) {
			this.logService.error('Failed to generate session title', error);
		}
	}

}
