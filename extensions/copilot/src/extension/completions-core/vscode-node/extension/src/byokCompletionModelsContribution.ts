/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lm } from 'vscode';
import { Disposable } from '../../../../../util/vs/base/common/lifecycle';
import { BYOK_COMPLETION_VENDORS, getByokCompletionModels, onDidChangeByokCompletionModels } from '../../../../byok/common/byokCompletionModels';
import { ICompletionsLogTargetService, LogLevel } from '../../lib/src/logger';
import { ICompletionsModelManagerService } from '../../lib/src/openai/model';

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Bridges `chatLanguageModels.json` (via the language models service) into the inline
 * completions pipeline. It triggers resolution of the BYOK vendor groups so the chat
 * providers report their decoded configuration (api keys already resolved from secret
 * storage), and keeps the completions model manager in sync when models change.
 */
export class ByokCompletionModelsContribution extends Disposable {
	constructor(
		@ICompletionsModelManagerService private readonly _modelManager: ICompletionsModelManagerService,
		@ICompletionsLogTargetService private readonly _logService: ICompletionsLogTargetService,
	) {
		super();
		void this._syncByokModels();
		// Re-sync whenever the language models service reports changes (e.g. the user
		// edits chatLanguageModels.json — the core re-resolves groups automatically).
		this._register(lm.onDidChangeChatModels(() => void this._syncByokModels()));
		this._register(onDidChangeByokCompletionModels(() => this._modelManager.refreshByokModels()));
	}

	/**
	 * `lm.selectChatModels` has the side effect of making the language models service
	 * resolve the vendor's groups, which invokes the BYOK chat providers'
	 * `provideLanguageModelChatInformation` with the decoded group configuration. The
	 * first attempts may race with the BYOK provider registration during extension
	 * activation, so retry until the models show up or the attempts are exhausted.
	 */
	private async _syncByokModels(): Promise<void> {
		for (let attempt = 0; attempt < 3; attempt++) {
			for (const vendor of BYOK_COMPLETION_VENDORS) {
				try {
					await lm.selectChatModels({ vendor });
				} catch (error) {
					// The vendor may not be registered (e.g. BYOK disabled by enterprise
					// policy); resolution failures are not fatal for completions.
					this._logService.logIt(LogLevel.INFO, `BYOK completions: selectChatModels(${vendor}) failed: ${String(error)}`);
				}
			}
			const models = getByokCompletionModels();
			this._logService.logIt(LogLevel.INFO, `BYOK completions: attempt ${attempt + 1}, resolved ${models.length} model(s): ${models.map(m => m.id).join(', ') || 'none'}`);
			if (models.length > 0) {
				break;
			}
			if (attempt < 2) {
				await delay(1000 * (attempt + 1));
			}
		}
		this._modelManager.refreshByokModels();
	}
}
