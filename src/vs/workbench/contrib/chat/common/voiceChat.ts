/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { startsWithIgnoreCase } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ISpeechService, ISpeechToTextEvent, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';

export const IVoiceChatService = createDecorator<IVoiceChatService>('voiceChatService');

export interface IVoiceChatService {

	readonly _serviceBrand: undefined;

	createVoiceChatSession(token: CancellationToken): IVoiceChatSession;
}

export interface IVoiceChatTextEvent extends ISpeechToTextEvent {

	/**
	 * This property will be `true` when the text recognized
	 * so far only consists of agent prefixes (`@workspace`)
	 * and/or command prefixes (`@workspace /fix`).
	 */
	readonly waitingForInput?: boolean;
}

export interface IVoiceChatSession extends IDisposable {
	readonly onDidChange: Event<IVoiceChatTextEvent>;
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

	createVoiceChatSession(token: CancellationToken): IVoiceChatSession {
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

		const emitter = disposables.add(new Emitter<IVoiceChatTextEvent>());
		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case SpeechToTextStatus.Recognizing:
				case SpeechToTextStatus.Recognized:
					if (e.text && startsWithIgnoreCase(e.text, VoiceChatService.PHRASES[VoiceChatService.AGENT_PREFIX].trim())) {
						const originalWords = e.text.split(' ');
						let transformedWords: string[] | undefined;

						let waitingForInput = false;

						// Check for slash command
						if (originalWords.length >= 4) {
							const slashCommandResult = phrases.get(originalWords.slice(0, 4).join(' ').toLowerCase());
							if (slashCommandResult) {
								transformedWords = [slashCommandResult, ...originalWords.slice(4)];

								waitingForInput = originalWords.length === 4;
							}
						}

						// Check for agent
						if (!transformedWords && originalWords.length >= 2) {
							const agentResult = phrases.get(originalWords.slice(0, 2).join(' ').toLowerCase());
							if (agentResult) {
								transformedWords = [agentResult, ...originalWords.slice(2)];

								waitingForInput = originalWords.length === 2;
							}
						}

						emitter.fire({
							status: e.status,
							text: (transformedWords ?? originalWords).join(' '),
							waitingForInput
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
