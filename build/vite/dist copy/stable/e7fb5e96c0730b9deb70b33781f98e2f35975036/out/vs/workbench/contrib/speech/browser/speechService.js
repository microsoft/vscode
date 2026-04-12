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
import { localize } from '../../../../nls.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { HasSpeechProvider, SpeechToTextInProgress, KeywordRecognitionStatus, SpeechToTextStatus, speechLanguageConfigToLanguage, SPEECH_LANGUAGE_CONFIG, TextToSpeechInProgress, TextToSpeechStatus } from '../common/speechService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
const speechProvidersExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'speechProviders',
    jsonSchema: {
        description: localize('vscode.extension.contributes.speechProvider', 'Contributes a Speech Provider'),
        type: 'array',
        items: {
            additionalProperties: false,
            type: 'object',
            defaultSnippets: [{ body: { name: '', description: '' } }],
            required: ['name'],
            properties: {
                name: {
                    description: localize('speechProviderName', "Unique name for this Speech Provider."),
                    type: 'string'
                },
                description: {
                    description: localize('speechProviderDescription', "A description of this Speech Provider, shown in the UI."),
                    type: 'string'
                }
            }
        }
    }
});
let SpeechService = class SpeechService extends Disposable {
    get hasSpeechProvider() { return this.providerDescriptors.size > 0 || this.providers.size > 0; }
    constructor(logService, contextKeyService, hostService, telemetryService, configurationService, extensionService) {
        super();
        this.logService = logService;
        this.hostService = hostService;
        this.telemetryService = telemetryService;
        this.configurationService = configurationService;
        this.extensionService = extensionService;
        this._onDidChangeHasSpeechProvider = this._register(new Emitter());
        this.onDidChangeHasSpeechProvider = this._onDidChangeHasSpeechProvider.event;
        this.providers = new Map();
        this.providerDescriptors = new Map();
        //#region Speech to Text
        this._onDidStartSpeechToTextSession = this._register(new Emitter());
        this.onDidStartSpeechToTextSession = this._onDidStartSpeechToTextSession.event;
        this._onDidEndSpeechToTextSession = this._register(new Emitter());
        this.onDidEndSpeechToTextSession = this._onDidEndSpeechToTextSession.event;
        this.activeSpeechToTextSessions = 0;
        //#endregion
        //#region Text to Speech
        this._onDidStartTextToSpeechSession = this._register(new Emitter());
        this.onDidStartTextToSpeechSession = this._onDidStartTextToSpeechSession.event;
        this._onDidEndTextToSpeechSession = this._register(new Emitter());
        this.onDidEndTextToSpeechSession = this._onDidEndTextToSpeechSession.event;
        this.activeTextToSpeechSessions = 0;
        //#endregion
        //#region Keyword Recognition
        this._onDidStartKeywordRecognition = this._register(new Emitter());
        this.onDidStartKeywordRecognition = this._onDidStartKeywordRecognition.event;
        this._onDidEndKeywordRecognition = this._register(new Emitter());
        this.onDidEndKeywordRecognition = this._onDidEndKeywordRecognition.event;
        this.activeKeywordRecognitionSessions = 0;
        this.hasSpeechProviderContext = HasSpeechProvider.bindTo(contextKeyService);
        this.textToSpeechInProgress = TextToSpeechInProgress.bindTo(contextKeyService);
        this.speechToTextInProgress = SpeechToTextInProgress.bindTo(contextKeyService);
        this.handleAndRegisterSpeechExtensions();
    }
    handleAndRegisterSpeechExtensions() {
        speechProvidersExtensionPoint.setHandler((extensions, delta) => {
            const oldHasSpeechProvider = this.hasSpeechProvider;
            for (const extension of delta.removed) {
                for (const descriptor of extension.value) {
                    this.providerDescriptors.delete(descriptor.name);
                }
            }
            for (const extension of delta.added) {
                for (const descriptor of extension.value) {
                    this.providerDescriptors.set(descriptor.name, descriptor);
                }
            }
            if (oldHasSpeechProvider !== this.hasSpeechProvider) {
                this.handleHasSpeechProviderChange();
            }
        });
    }
    registerSpeechProvider(identifier, provider) {
        if (this.providers.has(identifier)) {
            throw new Error(`Speech provider with identifier ${identifier} is already registered.`);
        }
        const oldHasSpeechProvider = this.hasSpeechProvider;
        this.providers.set(identifier, provider);
        if (oldHasSpeechProvider !== this.hasSpeechProvider) {
            this.handleHasSpeechProviderChange();
        }
        return toDisposable(() => {
            const oldHasSpeechProvider = this.hasSpeechProvider;
            this.providers.delete(identifier);
            if (oldHasSpeechProvider !== this.hasSpeechProvider) {
                this.handleHasSpeechProviderChange();
            }
        });
    }
    handleHasSpeechProviderChange() {
        this.hasSpeechProviderContext.set(this.hasSpeechProvider);
        this._onDidChangeHasSpeechProvider.fire();
    }
    get hasActiveSpeechToTextSession() { return this.activeSpeechToTextSessions > 0; }
    async createSpeechToTextSession(token, context = 'speech') {
        const provider = await this.getProvider();
        const language = speechLanguageConfigToLanguage(this.configurationService.getValue(SPEECH_LANGUAGE_CONFIG));
        const session = provider.createSpeechToTextSession(token, typeof language === 'string' ? { language } : undefined);
        const sessionStart = Date.now();
        let sessionRecognized = false;
        let sessionError = false;
        let sessionContentLength = 0;
        const disposables = new DisposableStore();
        const onSessionStoppedOrCanceled = () => {
            this.activeSpeechToTextSessions = Math.max(0, this.activeSpeechToTextSessions - 1);
            if (!this.hasActiveSpeechToTextSession) {
                this.speechToTextInProgress.reset();
            }
            this._onDidEndSpeechToTextSession.fire();
            this.telemetryService.publicLog2('speechToTextSession', {
                context,
                sessionDuration: Date.now() - sessionStart,
                sessionRecognized,
                sessionError,
                sessionContentLength,
                sessionLanguage: language
            });
            disposables.dispose();
        };
        disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
        if (token.isCancellationRequested) {
            onSessionStoppedOrCanceled();
        }
        disposables.add(session.onDidChange(e => {
            switch (e.status) {
                case SpeechToTextStatus.Started:
                    this.activeSpeechToTextSessions++;
                    this.speechToTextInProgress.set(true);
                    this._onDidStartSpeechToTextSession.fire();
                    break;
                case SpeechToTextStatus.Recognizing:
                    sessionRecognized = true;
                    break;
                case SpeechToTextStatus.Recognized:
                    if (typeof e.text === 'string') {
                        sessionContentLength += e.text.length;
                    }
                    break;
                case SpeechToTextStatus.Stopped:
                    onSessionStoppedOrCanceled();
                    break;
                case SpeechToTextStatus.Error:
                    this.logService.error(`Speech provider error in speech to text session: ${e.text}`);
                    sessionError = true;
                    break;
            }
        }));
        return session;
    }
    async getProvider() {
        // Send out extension activation to ensure providers can register
        await this.extensionService.activateByEvent('onSpeech');
        const provider = Array.from(this.providers.values()).at(0);
        if (!provider) {
            throw new Error(`No Speech provider is registered.`);
        }
        else if (this.providers.size > 1) {
            this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
        }
        return provider;
    }
    get hasActiveTextToSpeechSession() { return this.activeTextToSpeechSessions > 0; }
    async createTextToSpeechSession(token, context = 'speech') {
        const provider = await this.getProvider();
        const language = speechLanguageConfigToLanguage(this.configurationService.getValue(SPEECH_LANGUAGE_CONFIG));
        const session = provider.createTextToSpeechSession(token, typeof language === 'string' ? { language } : undefined);
        const sessionStart = Date.now();
        let sessionError = false;
        const disposables = new DisposableStore();
        const onSessionStoppedOrCanceled = (dispose) => {
            this.activeTextToSpeechSessions = Math.max(0, this.activeTextToSpeechSessions - 1);
            if (!this.hasActiveTextToSpeechSession) {
                this.textToSpeechInProgress.reset();
            }
            this._onDidEndTextToSpeechSession.fire();
            this.telemetryService.publicLog2('textToSpeechSession', {
                context,
                sessionDuration: Date.now() - sessionStart,
                sessionError,
                sessionLanguage: language
            });
            if (dispose) {
                disposables.dispose();
            }
        };
        disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled(true)));
        if (token.isCancellationRequested) {
            onSessionStoppedOrCanceled(true);
        }
        disposables.add(session.onDidChange(e => {
            switch (e.status) {
                case TextToSpeechStatus.Started:
                    this.activeTextToSpeechSessions++;
                    this.textToSpeechInProgress.set(true);
                    this._onDidStartTextToSpeechSession.fire();
                    break;
                case TextToSpeechStatus.Stopped:
                    onSessionStoppedOrCanceled(false);
                    break;
                case TextToSpeechStatus.Error:
                    this.logService.error(`Speech provider error in text to speech session: ${e.text}`);
                    sessionError = true;
                    break;
            }
        }));
        return session;
    }
    get hasActiveKeywordRecognition() { return this.activeKeywordRecognitionSessions > 0; }
    async recognizeKeyword(token) {
        const result = new DeferredPromise();
        const disposables = new DisposableStore();
        disposables.add(token.onCancellationRequested(() => {
            disposables.dispose();
            result.complete(KeywordRecognitionStatus.Canceled);
        }));
        const recognizeKeywordDisposables = disposables.add(new DisposableStore());
        let activeRecognizeKeywordSession = undefined;
        const recognizeKeyword = () => {
            recognizeKeywordDisposables.clear();
            const cts = new CancellationTokenSource(token);
            recognizeKeywordDisposables.add(toDisposable(() => cts.dispose(true)));
            const currentRecognizeKeywordSession = activeRecognizeKeywordSession = this.doRecognizeKeyword(cts.token).then(status => {
                if (currentRecognizeKeywordSession === activeRecognizeKeywordSession) {
                    result.complete(status);
                }
            }, error => {
                if (currentRecognizeKeywordSession === activeRecognizeKeywordSession) {
                    result.error(error);
                }
            });
        };
        disposables.add(this.hostService.onDidChangeFocus(focused => {
            if (!focused && activeRecognizeKeywordSession) {
                recognizeKeywordDisposables.clear();
                activeRecognizeKeywordSession = undefined;
            }
            else if (!activeRecognizeKeywordSession) {
                recognizeKeyword();
            }
        }));
        if (this.hostService.hasFocus) {
            recognizeKeyword();
        }
        let status;
        try {
            status = await result.p;
        }
        finally {
            disposables.dispose();
        }
        this.telemetryService.publicLog2('keywordRecognition', {
            keywordRecognized: status === KeywordRecognitionStatus.Recognized
        });
        return status;
    }
    async doRecognizeKeyword(token) {
        const provider = await this.getProvider();
        const session = provider.createKeywordRecognitionSession(token);
        this.activeKeywordRecognitionSessions++;
        this._onDidStartKeywordRecognition.fire();
        const disposables = new DisposableStore();
        const onSessionStoppedOrCanceled = () => {
            this.activeKeywordRecognitionSessions = Math.max(0, this.activeKeywordRecognitionSessions - 1);
            this._onDidEndKeywordRecognition.fire();
            disposables.dispose();
        };
        disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
        if (token.isCancellationRequested) {
            onSessionStoppedOrCanceled();
        }
        disposables.add(session.onDidChange(e => {
            if (e.status === KeywordRecognitionStatus.Stopped) {
                onSessionStoppedOrCanceled();
            }
        }));
        try {
            return (await Event.toPromise(session.onDidChange)).status;
        }
        finally {
            onSessionStoppedOrCanceled();
        }
    }
};
SpeechService = __decorate([
    __param(0, ILogService),
    __param(1, IContextKeyService),
    __param(2, IHostService),
    __param(3, ITelemetryService),
    __param(4, IConfigurationService),
    __param(5, IExtensionService)
], SpeechService);
export { SpeechService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BlZWNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NwZWVjaC9icm93c2VyL3NwZWVjaFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25FLE9BQU8sRUFBbUMsaUJBQWlCLEVBQXdCLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLGtCQUFrQixFQUFFLDhCQUE4QixFQUFFLHNCQUFzQixFQUF3QixzQkFBc0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3RULE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FB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