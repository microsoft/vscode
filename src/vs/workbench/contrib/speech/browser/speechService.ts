/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ISpeechService, ISpeechProvider, HasSpeechProvider, ISpeechToTextSession, SpeechToTextInProgress, KeywordRecognitionStatus, SpeechToTextStatus, speechLanguageConfigToLanguage, SPEECH_LANGUAGE_CONFIG, ITextToSpeechSession, TextToSpeechInProgress, TextToSpeechStatus } from '../common/speechService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

export interface ISpeechProviderDescriptor {
	readonly name: string;
	readonly description?: string;
}

const speechProvidersExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ISpeechProviderDescriptor[]>({
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

export class SpeechService extends Disposable implements ISpeechService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeHasSpeechProvider = this._register(new Emitter<void>());
	readonly onDidChangeHasSpeechProvider = this._onDidChangeHasSpeechProvider.event;

	get hasSpeechProvider() { return this.providerDescriptors.size > 0 || this.providers.size > 0; }

	private readonly providers = new Map<string, ISpeechProvider>();
	private readonly providerDescriptors = new Map<string, ISpeechProviderDescriptor>();

	private readonly hasSpeechProviderContext = HasSpeechProvider.bindTo(this.contextKeyService);

	constructor(
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		this.handleAndRegisterSpeechExtensions();
	}

	private handleAndRegisterSpeechExtensions(): void {
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

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable {
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

	private handleHasSpeechProviderChange(): void {
		this.hasSpeechProviderContext.set(this.hasSpeechProvider);

		this._onDidChangeHasSpeechProvider.fire();
	}

	//#region Speech to Text

	private readonly _onDidStartSpeechToTextSession = this._register(new Emitter<void>());
	readonly onDidStartSpeechToTextSession = this._onDidStartSpeechToTextSession.event;

	private readonly _onDidEndSpeechToTextSession = this._register(new Emitter<void>());
	readonly onDidEndSpeechToTextSession = this._onDidEndSpeechToTextSession.event;

	private activeSpeechToTextSessions = 0;
	get hasActiveSpeechToTextSession() { return this.activeSpeechToTextSessions > 0; }

	private readonly speechToTextInProgress = SpeechToTextInProgress.bindTo(this.contextKeyService);

	async createSpeechToTextSession(token: CancellationToken, context: string = 'speech'): Promise<ISpeechToTextSession> {
		const provider = await this.getProvider();

		const language = speechLanguageConfigToLanguage(this.configurationService.getValue<unknown>(SPEECH_LANGUAGE_CONFIG));
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

			type SpeechToTextSessionClassification = {
				owner: 'bpasero';
				comment: 'An event that fires when a speech to text session is created';
				context: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Context of the session.' };
				sessionDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Duration of the session.' };
				sessionRecognized: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If speech was recognized.' };
				sessionError: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If speech resulted in error.' };
				sessionContentLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Length of the recognized text.' };
				sessionLanguage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Configured language for the session.' };
			};
			type SpeechToTextSessionEvent = {
				context: string;
				sessionDuration: number;
				sessionRecognized: boolean;
				sessionError: boolean;
				sessionContentLength: number;
				sessionLanguage: string;
			};
			this.telemetryService.publicLog2<SpeechToTextSessionEvent, SpeechToTextSessionClassification>('speechToTextSession', {
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

	private async getProvider(): Promise<ISpeechProvider> {

		// Send out extension activation to ensure providers can register
		await this.extensionService.activateByEvent('onSpeech');

		const provider = Array.from(this.providers.values()).at(0);
		if (!provider) {
			throw new Error(`No Speech provider is registered.`);
		} else if (this.providers.size > 1) {
			this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
		}

		return provider;
	}

	//#endregion

	//#region Text to Speech

	private readonly _onDidStartTextToSpeechSession = this._register(new Emitter<void>());
	readonly onDidStartTextToSpeechSession = this._onDidStartTextToSpeechSession.event;

	private readonly _onDidEndTextToSpeechSession = this._register(new Emitter<void>());
	readonly onDidEndTextToSpeechSession = this._onDidEndTextToSpeechSession.event;

	private activeTextToSpeechSessions = 0;
	get hasActiveTextToSpeechSession() { return this.activeTextToSpeechSessions > 0; }

	private readonly textToSpeechInProgress = TextToSpeechInProgress.bindTo(this.contextKeyService);

	async createTextToSpeechSession(token: CancellationToken, context: string = 'speech'): Promise<ITextToSpeechSession> {
		const provider = await this.getProvider();

		const language = speechLanguageConfigToLanguage(this.configurationService.getValue<unknown>(SPEECH_LANGUAGE_CONFIG));
		const session = provider.createTextToSpeechSession(token, typeof language === 'string' ? { language } : undefined);

		const sessionStart = Date.now();
		let sessionError = false;

		const disposables = new DisposableStore();

		const onSessionStoppedOrCanceled = (dispose: boolean) => {
			this.activeTextToSpeechSessions = Math.max(0, this.activeTextToSpeechSessions - 1);
			if (!this.hasActiveTextToSpeechSession) {
				this.textToSpeechInProgress.reset();
			}
			this._onDidEndTextToSpeechSession.fire();

			type TextToSpeechSessionClassification = {
				owner: 'bpasero';
				comment: 'An event that fires when a text to speech session is created';
				context: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Context of the session.' };
				sessionDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Duration of the session.' };
				sessionError: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If speech resulted in error.' };
				sessionLanguage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Configured language for the session.' };
			};
			type TextToSpeechSessionEvent = {
				context: string;
				sessionDuration: number;
				sessionError: boolean;
				sessionLanguage: string;
			};
			this.telemetryService.publicLog2<TextToSpeechSessionEvent, TextToSpeechSessionClassification>('textToSpeechSession', {
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

	//#endregion

	//#region Keyword Recognition

	private readonly _onDidStartKeywordRecognition = this._register(new Emitter<void>());
	readonly onDidStartKeywordRecognition = this._onDidStartKeywordRecognition.event;

	private readonly _onDidEndKeywordRecognition = this._register(new Emitter<void>());
	readonly onDidEndKeywordRecognition = this._onDidEndKeywordRecognition.event;

	private activeKeywordRecognitionSessions = 0;
	get hasActiveKeywordRecognition() { return this.activeKeywordRecognitionSessions > 0; }

	async recognizeKeyword(token: CancellationToken): Promise<KeywordRecognitionStatus> {
		const result = new DeferredPromise<KeywordRecognitionStatus>();

		const disposables = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => {
			disposables.dispose();
			result.complete(KeywordRecognitionStatus.Canceled);
		}));

		const recognizeKeywordDisposables = disposables.add(new DisposableStore());
		let activeRecognizeKeywordSession: Promise<void> | undefined = undefined;
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
			} else if (!activeRecognizeKeywordSession) {
				recognizeKeyword();
			}
		}));

		if (this.hostService.hasFocus) {
			recognizeKeyword();
		}

		let status: KeywordRecognitionStatus;
		try {
			status = await result.p;
		} finally {
			disposables.dispose();
		}

		type KeywordRecognitionClassification = {
			owner: 'bpasero';
			comment: 'An event that fires when a speech keyword detection is started';
			keywordRecognized: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If the keyword was recognized.' };
		};
		type KeywordRecognitionEvent = {
			keywordRecognized: boolean;
		};
		this.telemetryService.publicLog2<KeywordRecognitionEvent, KeywordRecognitionClassification>('keywordRecognition', {
			keywordRecognized: status === KeywordRecognitionStatus.Recognized
		});

		return status;
	}

	private async doRecognizeKeyword(token: CancellationToken): Promise<KeywordRecognitionStatus> {
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
		} finally {
			onSessionStoppedOrCanceled();
		}
	}

	//#endregion
}
