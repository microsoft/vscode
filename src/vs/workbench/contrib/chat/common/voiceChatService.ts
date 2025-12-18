/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { rtrim } from '../../../../base/common/strings.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatAgentService } from './chatAgents.js';
import { IChatModel } from './chatModel.js';
import { chatAgentLeader, chatSubcommandLeader } from './chatParserTypes.js';
import { ISpeechService, ISpeechToTextEvent, SpeechToTextStatus } from '../../speech/common/speechService.js';

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

	/**
	 * Creates a conversation mode session that provides continuous voice
	 * interaction. Unlike regular voice chat sessions, conversation mode
	 * automatically restarts listening after each utterance is recognized,
	 * enabling a hands-free conversation experience.
	 */
	createConversationModeSession(options: IConversationModeSessionOptions): IConversationModeSession;
}

/**
 * Default timeout in milliseconds after which recognized speech is automatically
 * submitted if no new speech is detected. This provides a natural pause-to-submit
 * behavior for conversation mode.
 *
 * TODO: Currently set to 200ms for testing. Raise to 1000ms when done testing.
 */
const CONVERSATION_MODE_SUBMIT_TIMEOUT = 200;

export interface IConversationModeSessionOptions extends IVoiceChatSessionOptions {
	/**
	 * Callback invoked when the user's speech has been recognized and
	 * should be submitted. The callback receives the final recognized text.
	 */
	readonly onDidRecognizeText: (text: string) => void;
}

export interface IConversationModeSession extends IDisposable {
	/**
	 * Event fired when the conversation mode state changes.
	 */
	readonly onDidChange: Event<IConversationModeEvent>;

	/**
	 * Starts listening for voice input. Call this to begin the conversation.
	 */
	start(): void;

	/**
	 * Stops the conversation mode session entirely.
	 */
	stop(): void;

	/**
	 * Pauses listening temporarily (e.g., while TTS is speaking).
	 * Call `resume()` to continue listening.
	 */
	pause(): void;

	/**
	 * Resumes listening after a pause.
	 */
	resume(): void;

	/**
	 * Whether the session is currently active (started and not stopped).
	 */
	readonly isActive: boolean;

	/**
	 * Whether the session is currently listening for input.
	 */
	readonly isListening: boolean;
}

export const enum ConversationModeStatus {
	/** Session has started */
	Started = 1,
	/** Actively listening for speech */
	Listening = 2,
	/** Speech is being recognized (interim results) */
	Recognizing = 3,
	/** Speech was recognized and submitted */
	Recognized = 4,
	/** Listening is paused (e.g., during TTS) */
	Paused = 5,
	/** Session has stopped */
	Stopped = 6,
	/** An error occurred */
	Error = 7
}

export interface IConversationModeEvent {
	readonly status: ConversationModeStatus;
	readonly text?: string;
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

export const VoiceChatInProgress = new RawContextKey<boolean>('voiceChatInProgress', false, { type: 'boolean', description: localize('voiceChatInProgress', "A speech-to-text session is in progress for chat.") });
export const ConversationModeInProgress = new RawContextKey<boolean>('conversationModeInProgress', false, { type: 'boolean', description: localize('conversationModeInProgress', "Conversation mode is active for hands-free voice chat.") });

export class VoiceChatService extends Disposable implements IVoiceChatService {

	readonly _serviceBrand: undefined;

	private static readonly AGENT_PREFIX = chatAgentLeader;
	private static readonly COMMAND_PREFIX = chatSubcommandLeader;

	private static readonly PHRASES_LOWER = {
		[this.AGENT_PREFIX]: 'at',
		[this.COMMAND_PREFIX]: 'slash'
	};

	private static readonly PHRASES_UPPER = {
		[this.AGENT_PREFIX]: 'At',
		[this.COMMAND_PREFIX]: 'Slash'
	};

	private static readonly CHAT_AGENT_ALIAS = new Map<string, string>([['vscode', 'code']]);

	private readonly voiceChatInProgress: IContextKey<boolean>;
	private readonly conversationModeInProgress: IContextKey<boolean>;
	private activeVoiceChatSessions = 0;

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		this.voiceChatInProgress = VoiceChatInProgress.bindTo(contextKeyService);
		this.conversationModeInProgress = ConversationModeInProgress.bindTo(contextKeyService);
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

		const onSessionStoppedOrCanceled = (dispose: boolean) => {
			this.activeVoiceChatSessions = Math.max(0, this.activeVoiceChatSessions - 1);
			if (this.activeVoiceChatSessions === 0) {
				this.voiceChatInProgress.reset();
			}

			if (dispose) {
				disposables.dispose();
			}
		};

		disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled(true)));

		let detectedAgent = false;
		let detectedSlashCommand = false;

		const emitter = disposables.add(new Emitter<IVoiceChatTextEvent>());
		const session = await this.speechService.createSpeechToTextSession(token, 'chat');

		if (token.isCancellationRequested) {
			onSessionStoppedOrCanceled(true);
		}

		const phrases = this.createPhrases(options.model);
		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case SpeechToTextStatus.Recognizing:
				case SpeechToTextStatus.Recognized: {
					let massagedEvent: IVoiceChatTextEvent = e;
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

							massagedEvent = {
								status: e.status,
								text: (transformedWords ?? originalWords).join(' '),
								waitingForInput
							};
						}
					}
					emitter.fire(massagedEvent);
					break;
				}
				case SpeechToTextStatus.Started:
					this.activeVoiceChatSessions++;
					this.voiceChatInProgress.set(true);
					emitter.fire(e);
					break;
				case SpeechToTextStatus.Stopped:
					onSessionStoppedOrCanceled(false);
					emitter.fire(e);
					break;
				case SpeechToTextStatus.Error:
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

	createConversationModeSession(options: IConversationModeSessionOptions): IConversationModeSession {
		return new ConversationModeSession(
			this,
			this.conversationModeInProgress,
			options
		);
	}
}

/**
 * Manages a continuous voice conversation session. Unlike regular voice chat,
 * this session automatically restarts listening after each utterance is recognized,
 * enabling a hands-free conversation experience.
 */
class ConversationModeSession extends Disposable implements IConversationModeSession {

	private readonly _onDidChange = this._register(new Emitter<IConversationModeEvent>());
	readonly onDidChange: Event<IConversationModeEvent> = this._onDidChange.event;

	private _isActive = false;
	private _isListening = false;
	private _isPaused = false;

	private currentSessionCts: CancellationTokenSource | undefined;
	private accumulatedText = '';

	private readonly submitScheduler: RunOnceScheduler;

	constructor(
		private readonly voiceChatService: VoiceChatService,
		private readonly conversationModeInProgress: IContextKey<boolean>,
		private readonly options: IConversationModeSessionOptions
	) {
		super();

		// Scheduler to auto-submit after a period of silence
		this.submitScheduler = this._register(new RunOnceScheduler(() => this.submitAccumulatedText(), CONVERSATION_MODE_SUBMIT_TIMEOUT));
	}

	private submitAccumulatedText(): void {
		if (!this._isActive || this._isPaused) {
			return;
		}

		const textToSubmit = this.accumulatedText.trim();
		if (textToSubmit) {
			this.accumulatedText = '';

			this._onDidChange.fire({
				status: ConversationModeStatus.Recognized,
				text: textToSubmit
			});

			// Notify the callback that text was recognized
			this.options.onDidRecognizeText(textToSubmit);
		}
	}

	get isActive(): boolean {
		return this._isActive;
	}

	get isListening(): boolean {
		return this._isListening;
	}

	start(): void {
		if (this._isActive) {
			return;
		}

		this._isActive = true;
		this._isPaused = false;
		this.conversationModeInProgress.set(true);
		this._onDidChange.fire({ status: ConversationModeStatus.Started });

		this.startListening();
	}

	stop(): void {
		if (!this._isActive) {
			return;
		}

		this._isActive = false;
		this._isListening = false;
		this._isPaused = false;
		this.accumulatedText = '';

		this.submitScheduler.cancel();
		this.cancelCurrentSession();
		this.conversationModeInProgress.reset();
		this._onDidChange.fire({ status: ConversationModeStatus.Stopped });
	}

	pause(): void {
		if (!this._isActive || this._isPaused) {
			return;
		}

		this._isPaused = true;
		this._isListening = false;
		this.submitScheduler.cancel();
		this.cancelCurrentSession();
		this._onDidChange.fire({ status: ConversationModeStatus.Paused });
	}

	resume(): void {
		if (!this._isActive || !this._isPaused) {
			return;
		}

		this._isPaused = false;

		setTimeout(() => {
			if (this._isActive && !this._isPaused && !this._isListening) {
				this.startListening().catch(() => {
					if (this._isActive && !this._isPaused) {
						setTimeout(() => {
							if (this._isActive && !this._isPaused && !this._isListening) {
								this.startListening();
							}
						}, 1000);
					}
				});
			}
		}, 200);
	}

	private cancelCurrentSession(): void {
		if (this.currentSessionCts) {
			this.currentSessionCts.dispose(true);
			this.currentSessionCts = undefined;
		}
	}

	private async startListening(): Promise<void> {
		if (!this._isActive || this._isPaused) {
			return;
		}

		this.cancelCurrentSession();
		this.submitScheduler.cancel();

		const cts = this.currentSessionCts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		try {
			this._isListening = true;
			this._onDidChange.fire({ status: ConversationModeStatus.Listening });

			const session = await this.voiceChatService.createVoiceChatSession(cts.token, {
				usesAgents: this.options.usesAgents,
				model: this.options.model
			});

			if (cts.token.isCancellationRequested) {
				return;
			}

			this._register(session.onDidChange(e => {
				if (cts.token.isCancellationRequested) {
					return;
				}

				switch (e.status) {
					case SpeechToTextStatus.Recognizing:
						this.submitScheduler.cancel();
						if (e.text) {
							this._onDidChange.fire({
								status: ConversationModeStatus.Recognizing,
								text: e.text
							});
						}
						break;

					case SpeechToTextStatus.Recognized:
						if (e.text && !e.waitingForInput) {
							this.accumulatedText = this.accumulatedText
								? `${this.accumulatedText} ${e.text}`
								: e.text;

							this.submitScheduler.schedule();
						}
						break;

					case SpeechToTextStatus.Stopped:
						this._isListening = false;

						if (this.accumulatedText.trim()) {
							this.submitScheduler.cancel();
							this.submitAccumulatedText();
						}

						if (this._isActive && !this._isPaused) {
							setTimeout(() => {
								if (this._isActive && !this._isPaused) {
									this.startListening();
								}
							}, 100);
						}
						break;

					case SpeechToTextStatus.Error:
						this._isListening = false;
						this.submitScheduler.cancel();
						this._onDidChange.fire({
							status: ConversationModeStatus.Error,
							text: e.text
						});

						if (this._isActive && !this._isPaused) {
							setTimeout(() => {
								if (this._isActive && !this._isPaused) {
									this.startListening();
								}
							}, 1000);
						}
						break;
				}
			}));
		} catch (error) {
			this._isListening = false;
			this.submitScheduler.cancel();
			this._onDidChange.fire({
				status: ConversationModeStatus.Error,
				text: error instanceof Error ? error.message : String(error)
			});

			if (this._isActive && !this._isPaused) {
				setTimeout(() => {
					if (this._isActive && !this._isPaused && !this._isListening) {
						this.startListening();
					}
				}, 1000);
			}
		}
	}

	override dispose(): void {
		this.stop();
		super.dispose();
	}
}
