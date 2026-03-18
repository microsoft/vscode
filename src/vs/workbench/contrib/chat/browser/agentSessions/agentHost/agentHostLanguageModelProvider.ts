/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ISessionModelInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILanguageModelChatProvider, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

/**
 * Exposes models available from the agent host process as selectable
 * language models in the chat model picker. Models are provided from
 * root state (via {@link IAgentInfo.models}) rather than via RPC.
 */
export class AgentHostLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _models: readonly ISessionModelInfo[] = [];

	constructor(
		private readonly _sessionType: string,
		private readonly _vendor: string,
	) {
		super();
	}

	/**
	 * Called by {@link AgentHostContribution} when models change in root state.
	 */
	updateModels(models: readonly ISessionModelInfo[]): void {
		this._models = models;
		this._onDidChange.fire();
	}

	async provideLanguageModelChatInfo(_options: unknown, _token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		return this._models
			.filter(m => m.policyState !== 'disabled')
			.map(m => ({
				identifier: `${this._vendor}:${m.id}`,
				metadata: {
					extension: new ExtensionIdentifier('vscode.agent-host'),
					name: m.name,
					id: m.id,
					vendor: this._vendor,
					version: '1.0',
					family: m.id,
					maxInputTokens: m.maxContextWindow ?? 0,
					maxOutputTokens: 0,
					isDefaultForLocation: {},
					isUserSelectable: true,
					modelPickerCategory: undefined,
					targetChatSessionType: this._sessionType,
					capabilities: {
						vision: m.supportsVision ?? false,
						toolCalling: true,
						agentMode: true,
					},
				},
			}));
	}

	async sendChatRequest(): Promise<never> {
		throw new Error('Agent-host models do not support direct chat requests');
	}

	async provideTokenCount(): Promise<number> {
		return 0;
	}
}
