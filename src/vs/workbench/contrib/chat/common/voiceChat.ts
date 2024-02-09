/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { rtrim, startsWithIgnoreCase } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ISpeechService, ISpeechToTextEvent, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';

export const IVoiceChatService = createDecorator<IVoiceChatService>('voiceChatService');

export interface IVoiceChatService {

	readonly _serviceBrand: undefined;

	/**
	 * Similar to `ISpeechService.createSpeechToTextSession`, but with
	 * support for agent prefixes and command prefixes. For example,
	 * if the user says "at workspace slash fix this problem", the result
	 * will be "@workspace /fix this problem".
	 */
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

	private _phrases: Map<string, string> | undefined = undefined;
	private get phrases(): Map<string, string> {
		if (!this._phrases) {
			this._phrases = this.createPhrases();
		}

		return this._phrases;
	}

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatAgentService.onDidChangeAgents(() => this._phrases = undefined));
	}

	private createPhrases(): Map<string, string> {
		const phrases = new Map<string, string>();

		for (const agent of this.chatAgentService.getAgents()) {
			const agentPhrase = `${VoiceChatService.PHRASES[VoiceChatService.AGENT_PREFIX]}${VoiceChatService.CHAT_AGENT_ALIAS.get(agent.id) ?? agent.id}`.toLowerCase();
			const agentResult = `${VoiceChatService.AGENT_PREFIX}${agent.id}`;
			phrases.set(agentPhrase, agentResult);

			if (agent.lastSlashCommands) {
				for (const slashCommand of agent.lastSlashCommands) {
					const slashCommandPhrase = `${VoiceChatService.PHRASES[VoiceChatService.COMMAND_PREFIX]}${slashCommand.name}`.toLowerCase();
					const slashCommandResult = `${VoiceChatService.COMMAND_PREFIX}${slashCommand.name}`;
					phrases.set(slashCommandPhrase, slashCommandResult);

					const agentSlashCommandPhrase = `${agentPhrase} ${slashCommandPhrase}`.toLowerCase();
					const agentSlashCommandResult = `${agentResult} ${slashCommandResult}`;
					phrases.set(agentSlashCommandPhrase, agentSlashCommandResult);
				}
			}
		}

		return phrases;
	}

	createVoiceChatSession(token: CancellationToken): IVoiceChatSession {
		const disposables = new DisposableStore();

		let detectedAgent = false;
		let detectedSlashCommand = false;

		const emitter = disposables.add(new Emitter<IVoiceChatTextEvent>());
		const session = disposables.add(this.speechService.createSpeechToTextSession(token));
		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case SpeechToTextStatus.Recognizing:
				case SpeechToTextStatus.Recognized:
					if (e.text) {
						const startsWithAgent = startsWithIgnoreCase(e.text, VoiceChatService.PHRASES[VoiceChatService.AGENT_PREFIX].trim());
						const startsWithSlashCommand = startsWithIgnoreCase(e.text, VoiceChatService.PHRASES[VoiceChatService.COMMAND_PREFIX].trim());
						if (startsWithAgent || startsWithSlashCommand) {
							const originalWords = e.text.split(' ');
							let transformedWords: string[] | undefined;

							let waitingForInput = false;

							// Check for agent + slash command
							if (startsWithAgent && !detectedAgent && !detectedSlashCommand && originalWords.length >= 4) {
								const slashCommandResult = this.phrases.get(originalWords.slice(0, 4).map(word => this.normalizeWord(word)).join(' '));
								if (slashCommandResult) {
									transformedWords = [slashCommandResult, ...originalWords.slice(4)];

									waitingForInput = originalWords.length === 4;

									if (e.status === SpeechToTextStatus.Recognized) {
										detectedAgent = true;
										detectedSlashCommand = true;
									}
								}
							}

							// Check for agent (if not done already)
							if (startsWithAgent && !detectedAgent && !transformedWords && originalWords.length >= 2) {
								const agentResult = this.phrases.get(originalWords.slice(0, 2).map(word => this.normalizeWord(word)).join(' '));
								if (agentResult) {
									transformedWords = [agentResult, ...originalWords.slice(2)];

									waitingForInput = originalWords.length === 2;

									if (e.status === SpeechToTextStatus.Recognized) {
										detectedAgent = true;
									}
								}
							}

							// Check for slash command (if not done already)
							if (startsWithSlashCommand && !detectedSlashCommand && !transformedWords && originalWords.length >= 2) {
								const slashCommandResult = this.phrases.get(originalWords.slice(0, 2).map(word => this.normalizeWord(word)).join(' '));
								if (slashCommandResult) {
									transformedWords = [slashCommandResult, ...originalWords.slice(2)];

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
			onDidChange: emitter.event,
			dispose: () => disposables.dispose()
		};
	}

	private normalizeWord(word: string): string {
		word = rtrim(word, '.');
		word = rtrim(word, ',');
		word = rtrim(word, '?');

		return word.toLowerCase();
	}
}
