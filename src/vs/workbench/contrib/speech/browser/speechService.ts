/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { DeferredPromise } from 'vs/base/common/async';
import { ISpeechService, ISpeechProvider, HasSpeechProvider, ISpeechToTextSession, SpeechToTextInProgress, IKeywordRecognitionSession, KeywordRecognitionStatus, SpeechToTextStatus, speechLanguageConfigToLanguage, SPEECH_LANGUAGE_CONFIG } from 'vs/workbench/contrib/speech/common/speechService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

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
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
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

	private readonly _onDidStartSpeechToTextSession = this._register(new Emitter<void>());
	readonly onDidStartSpeechToTextSession = this._onDidStartSpeechToTextSession.event;

	private readonly _onDidEndSpeechToTextSession = this._register(new Emitter<void>());
	readonly onDidEndSpeechToTextSession = this._onDidEndSpeechToTextSession.event;

	private _activeSpeechToTextSession: ISpeechToTextSession | undefined = undefined;
	get hasActiveSpeechToTextSession() { return !!this._activeSpeechToTextSession; }

	private readonly speechToTextInProgress = SpeechToTextInProgress.bindTo(this.contextKeyService);

	async createSpeechToTextSession(token: CancellationToken, context: string = 'speech'): Promise<ISpeechToTextSession> {
		const provider = await this.getProvider();

		const language = speechLanguageConfigToLanguage(this.configurationService.getValue<unknown>(SPEECH_LANGUAGE_CONFIG));
		const session = this._activeSpeechToTextSession = provider.createSpeechToTextSession(token, typeof language === 'string' ? { language } : undefined);

		const sessionStart = Date.now();
		let sessionRecognized = false;

		const disposables = new DisposableStore();

		const onSessionStoppedOrCanceled = () => {
			if (session === this._activeSpeechToTextSession) {
				this._activeSpeechToTextSession = undefined;
				this.speechToTextInProgress.reset();
				this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped, { allowManyInParallel: true });
				this._onDidEndSpeechToTextSession.fire();

				type SpeechToTextSessionClassification = {
					owner: 'bpasero';
					comment: 'An event that fires when a speech to text session is created';
					context: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Context of the session.' };
					sessionDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Duration of the session.' };
					sessionRecognized: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'If speech was recognized.' };
				};
				type SpeechToTextSessionEvent = {
					context: string;
					sessionDuration: number;
					sessionRecognized: boolean;
				};
				this.telemetryService.publicLog2<SpeechToTextSessionEvent, SpeechToTextSessionClassification>('speechToTextSession', {
					context,
					sessionDuration: Date.now() - sessionStart,
					sessionRecognized
				});
			}

			disposables.dispose();
		};

		disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
		if (token.isCancellationRequested) {
			onSessionStoppedOrCanceled();
		}

		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case SpeechToTextStatus.Started:
					if (session === this._activeSpeechToTextSession) {
						this.speechToTextInProgress.set(true);
						this._onDidStartSpeechToTextSession.fire();
						this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
					}
					break;
				case SpeechToTextStatus.Recognizing:
				case SpeechToTextStatus.Recognized:
					sessionRecognized = true;
					break;
				case SpeechToTextStatus.Stopped:
					onSessionStoppedOrCanceled();
					break;
			}
		}));

		return session;
	}

	private async getProvider(): Promise<ISpeechProvider> {

		// Send out extension activation to ensure providers can register
		await this.extensionService.activateByEvent('onSpeech');

		const provider = firstOrDefault(Array.from(this.providers.values()));
		if (!provider) {
			throw new Error(`No Speech provider is registered.`);
		} else if (this.providers.size > 1) {
			this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
		}

		return provider;
	}

	private readonly _onDidStartKeywordRecognition = this._register(new Emitter<void>());
	readonly onDidStartKeywordRecognition = this._onDidStartKeywordRecognition.event;

	private readonly _onDidEndKeywordRecognition = this._register(new Emitter<void>());
	readonly onDidEndKeywordRecognition = this._onDidEndKeywordRecognition.event;

	private _activeKeywordRecognitionSession: IKeywordRecognitionSession | undefined = undefined;
	get hasActiveKeywordRecognition() { return !!this._activeKeywordRecognitionSession; }

	async recognizeKeyword(token: CancellationToken): Promise<KeywordRecognitionStatus> {
		const result = new DeferredPromise<KeywordRecognitionStatus>();

		// Send out extension activation to ensure providers can register
		await this.extensionService.activateByEvent('onSpeech');

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
			keywordRecognized: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'If the keyword was recognized.' };
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

		const session = this._activeKeywordRecognitionSession = provider.createKeywordRecognitionSession(token);
		this._onDidStartKeywordRecognition.fire();

		const disposables = new DisposableStore();

		const onSessionStoppedOrCanceled = () => {
			if (session === this._activeKeywordRecognitionSession) {
				this._activeKeywordRecognitionSession = undefined;
				this._onDidEndKeywordRecognition.fire();
			}

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
}
