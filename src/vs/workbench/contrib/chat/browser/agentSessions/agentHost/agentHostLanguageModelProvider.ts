/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAgentHostService } from '../../../../../../platform/agent/common/agentService.js';
import { ILanguageModelChatProvider, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { AGENT_HOST_MODEL_VENDOR } from './agentHostConstants.js';

export class AgentHostLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly _agentHostService: IAgentHostService,
		private readonly _logService: ILogService,
		private readonly _sessionType: string,
	) {
		super();
	}

	refresh(): void {
		this._onDidChange.fire();
	}

	async provideLanguageModelChatInfo(_options: unknown, _token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		try {
			const models = await this._agentHostService.listModels();
			return models
				.filter(m => m.policyState !== 'disabled')
				.map(m => ({
					identifier: `${AGENT_HOST_MODEL_VENDOR}:${m.id}`,
					metadata: {
						extension: new ExtensionIdentifier('vscode.agent-host'),
						name: m.name,
						id: m.id,
						vendor: AGENT_HOST_MODEL_VENDOR,
						version: '1.0',
						family: m.id,
						maxInputTokens: m.maxContextWindow,
						maxOutputTokens: 0,
						isDefaultForLocation: {},
						isUserSelectable: true,
						modelPickerCategory: undefined,
						targetChatSessionType: this._sessionType,
						capabilities: {
							vision: m.supportsVision,
							toolCalling: true,
							agentMode: true,
						},
					},
				}));
		} catch (err) {
			this._logService.trace('[AgentHost] Models not available yet, will retry on next refresh');
			return [];
		}
	}

	async sendChatRequest(): Promise<never> {
		throw new Error('Agent-host models do not support direct chat requests');
	}

	async provideTokenCount(): Promise<number> {
		return 0;
	}
}
