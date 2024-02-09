/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { startsWithIgnoreCase } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ISpeechService, ISpeechToTextEvent, ISpeechToTextSession, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';

export const IVoiceChatService = createDecorator<IVoiceChatService>('voiceChatService');

export interface IVoiceChatService {

	readonly _serviceBrand: undefined;

	createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession;
}

export class VoiceChatService extends Disposable implements IVoiceChatService {

	readonly _serviceBrand: undefined;

	private static readonly AGENT_PREFIX = chatAgentLeader;
	private static readonly COMMAND_PREFIX = chatSubcommandLeader;

	private static readonly PHRASES = {
		[VoiceChatService.AGENT_PREFIX]: 'at ',
		[VoiceChatService.COMMAND_PREFIX]: 'slash '
	};

	private static readonly CHAT_AGENT_ALIAS = new Map<string, string>([['vscode', 'code']]);

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();
	}

	createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession {
		const phrases = new Map<string, string>();

		for (const agent of this.chatAgentService.getAgents()) {
			const agentPhrase = `${VoiceChatService.PHRASES[VoiceChatService.AGENT_PREFIX]}${VoiceChatService.CHAT_AGENT_ALIAS.get(agent.id) ?? agent.id}`.toLowerCase();
			const agentResult = `${VoiceChatService.AGENT_PREFIX}${agent.id}`;
			phrases.set(agentPhrase, agentResult);

			if (agent.lastSlashCommands) {
				for (const slashCommand of agent.lastSlashCommands) {
					const slashCommandPhrase = `${agentPhrase} ${VoiceChatService.PHRASES[VoiceChatService.COMMAND_PREFIX]}${slashCommand.name}`.toLowerCase();
					const slashCommandResult = `${agentResult} ${VoiceChatService.COMMAND_PREFIX}${slashCommand.name}`;
					phrases.set(slashCommandPhrase, slashCommandResult);
				}
			}
		}

		const session = this.speechService.createSpeechToTextSession(token);

		const disposables = new DisposableStore();

		const emitter = disposables.add(new Emitter<ISpeechToTextEvent>());
		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case SpeechToTextStatus.Recognizing:
				case SpeechToTextStatus.Recognized:
					if (e.text && startsWithIgnoreCase(e.text, VoiceChatService.AGENT_PREFIX)) {
						let words = e.text.split(' ');

						// Check for slash command
						if (words.length >= 4) {
							const slashCommandResult = phrases.get(words.slice(0, 4).join(' ').toLowerCase());
							if (slashCommandResult) {
								words = [slashCommandResult, ...words.slice(4)];
							}
						}

						// Check for agent
						if (words.length >= 2) {
							const agentResult = phrases.get(words.slice(0, 2).join(' ').toLowerCase());
							if (agentResult) {
								words = [agentResult, ...words.slice(2)];
							}
						}

						emitter.fire({
							status: e.status,
							text: words.join(' ')
						});

						break;
					}
				default:
					emitter.fire(e);
					break;
			}
		}));

		return {
			onDidChange: emitter.event,
			dispose: () => disposables.dispose()
		};
	}
}
