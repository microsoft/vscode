/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var VoiceChatService_1;
import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { rtrim } from '../../../../base/common/strings.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatAgentService } from './participants/chatAgents.js';
import { chatAgentLeader, chatSubcommandLeader } from './requestParser/chatParserTypes.js';
import { ISpeechService, SpeechToTextStatus } from '../../speech/common/speechService.js';
export const IVoiceChatService = createDecorator('voiceChatService');
var PhraseTextType;
(function (PhraseTextType) {
    PhraseTextType[PhraseTextType["AGENT"] = 1] = "AGENT";
    PhraseTextType[PhraseTextType["COMMAND"] = 2] = "COMMAND";
    PhraseTextType[PhraseTextType["AGENT_AND_COMMAND"] = 3] = "AGENT_AND_COMMAND";
})(PhraseTextType || (PhraseTextType = {}));
export const VoiceChatInProgress = new RawContextKey('voiceChatInProgress', false, { type: 'boolean', description: localize('voiceChatInProgress', "A speech-to-text session is in progress for chat.") });
let VoiceChatService = class VoiceChatService extends Disposable {
    static { VoiceChatService_1 = this; }
    static { this.AGENT_PREFIX = chatAgentLeader; }
    static { this.COMMAND_PREFIX = chatSubcommandLeader; }
    static { this.PHRASES_LOWER = {
        [this.AGENT_PREFIX]: 'at',
        [this.COMMAND_PREFIX]: 'slash'
    }; }
    static { this.PHRASES_UPPER = {
        [this.AGENT_PREFIX]: 'At',
        [this.COMMAND_PREFIX]: 'Slash'
    }; }
    static { this.CHAT_AGENT_ALIAS = new Map([['vscode', 'code']]); }
    constructor(speechService, chatAgentService, contextKeyService) {
        super();
        this.speechService = speechService;
        this.chatAgentService = chatAgentService;
        this.activeVoiceChatSessions = 0;
        this.voiceChatInProgress = VoiceChatInProgress.bindTo(contextKeyService);
    }
    createPhrases(model) {
        const phrases = new Map();
        for (const agent of this.chatAgentService.getActivatedAgents()) {
            const agentPhrase = `${VoiceChatService_1.PHRASES_LOWER[VoiceChatService_1.AGENT_PREFIX]} ${VoiceChatService_1.CHAT_AGENT_ALIAS.get(agent.name) ?? agent.name}`.toLowerCase();
            phrases.set(agentPhrase, { agent: agent.name });
            for (const slashCommand of agent.slashCommands) {
                const slashCommandPhrase = `${VoiceChatService_1.PHRASES_LOWER[VoiceChatService_1.COMMAND_PREFIX]} ${slashCommand.name}`.toLowerCase();
                phrases.set(slashCommandPhrase, { agent: agent.name, command: slashCommand.name });
                const agentSlashCommandPhrase = `${agentPhrase} ${slashCommandPhrase}`.toLowerCase();
                phrases.set(agentSlashCommandPhrase, { agent: agent.name, command: slashCommand.name });
            }
        }
        return phrases;
    }
    toText(value, type) {
        switch (type) {
            case PhraseTextType.AGENT:
                return `${VoiceChatService_1.AGENT_PREFIX}${value.agent}`;
            case PhraseTextType.COMMAND:
                return `${VoiceChatService_1.COMMAND_PREFIX}${value.command}`;
            case PhraseTextType.AGENT_AND_COMMAND:
                return `${VoiceChatService_1.AGENT_PREFIX}${value.agent} ${VoiceChatService_1.COMMAND_PREFIX}${value.command}`;
        }
    }
    async createVoiceChatSession(token, options) {
        const disposables = new DisposableStore();
        const onSessionStoppedOrCanceled = (dispose) => {
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
        const emitter = disposables.add(new Emitter());
        const session = await this.speechService.createSpeechToTextSession(token, 'chat');
        if (token.isCancellationRequested) {
            onSessionStoppedOrCanceled(true);
        }
        const phrases = this.createPhrases(options.model);
        disposables.add(session.onDidChange(e => {
            switch (e.status) {
                case SpeechToTextStatus.Recognizing:
                case SpeechToTextStatus.Recognized: {
                    let massagedEvent = e;
                    if (e.text) {
                        const startsWithAgent = e.text.startsWith(VoiceChatService_1.PHRASES_UPPER[VoiceChatService_1.AGENT_PREFIX]) || e.text.startsWith(VoiceChatService_1.PHRASES_LOWER[VoiceChatService_1.AGENT_PREFIX]);
                        const startsWithSlashCommand = e.text.startsWith(VoiceChatService_1.PHRASES_UPPER[VoiceChatService_1.COMMAND_PREFIX]) || e.text.startsWith(VoiceChatService_1.PHRASES_LOWER[VoiceChatService_1.COMMAND_PREFIX]);
                        if (startsWithAgent || startsWithSlashCommand) {
                            const originalWords = e.text.split(' ');
                            let transformedWords;
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
                                            PhraseTextType.AGENT_AND_COMMAND : // rewrite `/fix` to `@workspace /foo` in this case
                                            PhraseTextType.COMMAND // when we have not yet detected an agent before
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
    normalizeWord(word) {
        word = rtrim(word, '.');
        word = rtrim(word, ',');
        word = rtrim(word, '?');
        return word.toLowerCase();
    }
};
VoiceChatService = VoiceChatService_1 = __decorate([
    __param(0, ISpeechService),
    __param(1, IChatAgentService),
    __param(2, IContextKeyService)
], VoiceChatService);
export { VoiceChatService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pY2VDaGF0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3ZvaWNlQ2hhdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0YsT0FBTyxFQUFFLGNBQWMsRUFBc0Isa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUU5RyxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQW9CLGtCQUFrQixDQUFDLENBQUM7QUF1Q3hGLElBQUssY0FJSjtBQUpELFdBQUssY0FBYztJQUNsQixxREFBUyxDQUFBO0lBQ1QseURBQVcsQ0FBQTtJQUNYLDZFQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFKSSxjQUFjLEtBQWQsY0FBYyxRQUlsQjtBQUVELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLElBQUksYUFBYSxDQUFVLHFCQUFxQixFQUFFLEtBQUssRUFBRSxFQUFF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