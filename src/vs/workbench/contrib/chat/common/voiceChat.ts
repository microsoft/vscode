/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { rtrim } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ISpeechService, ISpeechToTextEvent, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';

export const IVoiceChatService = createDecorator<IVoiceChatService>('voiceChatService');

export interface IVoiceChatSessionOptions {
	readonly usesAgents?: boolean;
	readonly model?: IChatModel;
}

export interface IVoiceChatService {

	readonly _serviceBrand: undefined;

	/**
	 * Similar to `ISpeechService.createSpeechToTextSession`, but with
	 * support for agent prefixes and command prefixes. For example,
	 * if the user says "at workspace slash fix this problem", the result
	 * will be "@workspace /fix this problem".
	 */
	createVoiceChatSession(token: CancellationToken, options: IVoiceChatSessionOptions): Promise<IVoiceChatSession>;
}

export interface IVoiceChatTextEvent extends ISpeechToTextEvent {

	/**
	 * This property will be `true` when the text recognized
	 * so far only consists of agent prefixes (`@workspace`)
	 * and/or command prefixes (`@workspace /fix`).
	 */
	readonly waitingForInput?: boolean;
}

export interface IVoiceChatSession {
	readonly onDidChange: Event<IVoiceChatTextEvent>;
}

interface IPhraseValue {
	readonly agent: string;
	readonly command?: string;
}

enum PhraseTextType {
	AGENT = 1,
	COMMAND = 2,
	AGENT_AND_COMMAND = 3
}

export class VoiceChatService extends Disposable implements IVoiceChatService {

	readonly _serviceBrand: undefined;

	private static readonly AGENT_PREFIX = chatAgentLeader;
	private static readonly COMMAND_PREFIX = chatSubcommandLeader;

	private static readonly PHRASES_LOWER = {
		[VoiceChatService.AGENT_PREFIX]: 'at',
		[VoiceChatService.COMMAND_PREFIX]: 'slash'
	};

	private static readonly PHRASES_UPPER = {
		[VoiceChatService.AGENT_PREFIX]: 'At',
		[VoiceChatService.COMMAND_PREFIX]: 'Slash'
	};

	private static readonly CHAT_AGENT_ALIAS = new Map<string, string>([['vscode', 'code']]);

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();
	}

	private createPhrases(model?: IChatModel): Map<string, IPhraseValue> {
		const phrases = new Map<string, IPhraseValue>();

		for (const agent of this.chatAgentService.getActivatedAgents()) {
			const agentPhrase = `${VoiceChatService.PHRASES_LOWER[VoiceChatService.AGENT_PREFIX]} ${VoiceChatService.CHAT_AGENT_ALIAS.get(agent.name) ?? agent.name}`.toLowerCase();
			phrases.set(agentPhrase, { agent: agent.name });

			for (const slashCommand of agent.slashCommands) {
				const slashCommandPhrase = `${VoiceChatService.PHRASES_LOWER[VoiceChatService.COMMAND_PREFIX]} ${slashCommand.name}`.toLowerCase();
				phrases.set(slashCommandPhrase, { agent: agent.name, command: slashCommand.name });

				const agentSlashCommandPhrase = `${agentPhrase} ${slashCommandPhrase}`.toLowerCase();
				phrases.set(agentSlashCommandPhrase, { agent: agent.name, command: slashCommand.name });
			}
		}

		return phrases;
	}

	private toText(value: IPhraseValue, type: PhraseTextType): string {
		switch (type) {
			case PhraseTextType.AGENT:
				return `${VoiceChatService.AGENT_PREFIX}${value.agent}`;
			case PhraseTextType.COMMAND:
				return `${VoiceChatService.COMMAND_PREFIX}${value.command}`;
			case PhraseTextType.AGENT_AND_COMMAND:
				return `${VoiceChatService.AGENT_PREFIX}${value.agent} ${VoiceChatService.COMMAND_PREFIX}${value.command}`;
		}
	}

	async createVoiceChatSession(token: CancellationToken, options: IVoiceChatSessionOptions): Promise<IVoiceChatSession> {
		const disposables = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => disposables.dispose()));

		let detectedAgent = false;
		let detectedSlashCommand = false;

		const emitter = disposables.add(new Emitter<IVoiceChatTextEvent>());
		const session = await this.speechService.createSpeechToTextSession(token, 'chat');

		const phrases = this.createPhrases(options.model);
		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case SpeechToTextStatus.Recognizing:
				case SpeechToTextStatus.Recognized:
					if (e.text) {
						const startsWithAgent = e.text.startsWith(VoiceChatService.PHRASES_UPPER[VoiceChatService.AGENT_PREFIX]) || e.text.startsWith(VoiceChatService.PHRASES_LOWER[VoiceChatService.AGENT_PREFIX]);
						const startsWithSlashCommand = e.text.startsWith(VoiceChatService.PHRASES_UPPER[VoiceChatService.COMMAND_PREFIX]) || e.text.startsWith(VoiceChatService.PHRASES_LOWER[VoiceChatService.COMMAND_PREFIX]);
						if (startsWithAgent || startsWithSlashCommand) {
							const originalWords = e.text.split(' ');
							let transformedWords: string[] | undefined;

							let waitingForInput = false;

							// Check for agent + slash command
							if (options.usesAgents && startsWithAgent && !detectedAgent && !detectedSlashCommand && originalWords.length >= 4) {
								const phrase = phrases.get(originalWords.slice(0, 4).map(word => this.normalizeWord(word)).join(' '));
								if (phrase) {
									transformedWords = [this.toText(phrase, PhraseTextType.AGENT_AND_COMMAND), ...originalWords.slice(4)];

									waitingForInput = originalWords.length === 4;

									if (e.status === SpeechToTextStatus.Recognized) {
										detectedAgent = true;
										detectedSlashCommand = true;
									}
								}
							}

							// Check for agent (if not done already)
							if (options.usesAgents && startsWithAgent && !detectedAgent && !transformedWords && originalWords.length >= 2) {
								const phrase = phrases.get(originalWords.slice(0, 2).map(word => this.normalizeWord(word)).join(' '));
								if (phrase) {
									transformedWords = [this.toText(phrase, PhraseTextType.AGENT), ...originalWords.slice(2)];

									waitingForInput = originalWords.length === 2;

									if (e.status === SpeechToTextStatus.Recognized) {
										detectedAgent = true;
									}
								}
							}

							// Check for slash command (if not done already)
							if (startsWithSlashCommand && !detectedSlashCommand && !transformedWords && originalWords.length >= 2) {
								const phrase = phrases.get(originalWords.slice(0, 2).map(word => this.normalizeWord(word)).join(' '));
								if (phrase) {
									transformedWords = [this.toText(phrase, options.usesAgents && !detectedAgent ?
										PhraseTextType.AGENT_AND_COMMAND : 	// rewrite `/fix` to `@workspace /foo` in this case
										PhraseTextType.COMMAND				// when we have not yet detected an agent before
									), ...originalWords.slice(2)];

									waitingForInput = originalWords.length === 2;

									if (e.status === SpeechToTextStatus.Recognized) {
										detectedSlashCommand = true;
									}
								}
							}

							emitter.fire({
								status: e.status,
								text: (transformedWords ?? originalWords).join(' '),
								waitingForInput
							});

							break;
						}
					}
				default:
					emitter.fire(e);
					break;
			}
		}));

		return {
			onDidChange: emitter.event
		};
	}

	private normalizeWord(word: string): string {
		word = rtrim(word, '.');
		word = rtrim(word, ',');
		word = rtrim(word, '?');

		return word.toLowerCase();
	}
}
