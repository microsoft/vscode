/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { DeferredPromise } from 'vs/base/common/async';
import { ISpeechService, ISpeechProvider, HasSpeechProvider, ISpeechToTextSession, SpeechToTextInProgress, IKeywordRecognitionSession, KeywordRecognitionStatus, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';

export class SpeechService extends Disposable implements ISpeechService {

	readonly _serviceBrand: undefined;

	private readonly _onDidRegisterSpeechProvider = this._register(new Emitter<ISpeechProvider>());
	readonly onDidRegisterSpeechProvider = this._onDidRegisterSpeechProvider.event;

	private readonly _onDidUnregisterSpeechProvider = this._register(new Emitter<ISpeechProvider>());
	readonly onDidUnregisterSpeechProvider = this._onDidUnregisterSpeechProvider.event;

	get hasSpeechProvider() { return this.providers.size > 0; }

	private readonly providers = new Map<string, ISpeechProvider>();

	private readonly hasSpeechProviderContext = HasSpeechProvider.bindTo(this.contextKeyService);

	constructor(
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService
	) {
		super();
	}

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable {
		if (this.providers.has(identifier)) {
			throw new Error(`Speech provider with identifier ${identifier} is already registered.`);
		}

		this.providers.set(identifier, provider);
		this.hasSpeechProviderContext.set(true);

		this._onDidRegisterSpeechProvider.fire(provider);

		return toDisposable(() => {
			this.providers.delete(identifier);
			this._onDidUnregisterSpeechProvider.fire(provider);

			if (this.providers.size === 0) {
				this.hasSpeechProviderContext.set(false);
			}
		});
	}

	private readonly _onDidStartSpeechToTextSession = this._register(new Emitter<void>());
	readonly onDidStartSpeechToTextSession = this._onDidStartSpeechToTextSession.event;

	private readonly _onDidEndSpeechToTextSession = this._register(new Emitter<void>());
	readonly onDidEndSpeechToTextSession = this._onDidEndSpeechToTextSession.event;

	private _activeSpeechToTextSession: ISpeechToTextSession | undefined = undefined;
	get hasActiveSpeechToTextSession() { return !!this._activeSpeechToTextSession; }

	private readonly speechToTextInProgress = SpeechToTextInProgress.bindTo(this.contextKeyService);

	createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession {
		const provider = firstOrDefault(Array.from(this.providers.values()));
		if (!provider) {
			throw new Error(`No Speech provider is registered.`);
		} else if (this.providers.size > 1) {
			this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
		}

		const session = this._activeSpeechToTextSession = provider.createSpeechToTextSession(token);

		const disposables = new DisposableStore();

		const onSessionStoppedOrCanceled = () => {
			if (session === this._activeSpeechToTextSession) {
				this._activeSpeechToTextSession = undefined;
				this.speechToTextInProgress.reset();
				this._onDidEndSpeechToTextSession.fire();
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
					}
					break;
				case SpeechToTextStatus.Stopped:
					onSessionStoppedOrCanceled();
					break;
			}
		}));

		return session;
	}

	private readonly _onDidStartKeywordRecognition = this._register(new Emitter<void>());
	readonly onDidStartKeywordRecognition = this._onDidStartKeywordRecognition.event;

	private readonly _onDidEndKeywordRecognition = this._register(new Emitter<void>());
	readonly onDidEndKeywordRecognition = this._onDidEndKeywordRecognition.event;

	private _activeKeywordRecognitionSession: IKeywordRecognitionSession | undefined = undefined;
	get hasActiveKeywordRecognition() { return !!this._activeKeywordRecognitionSession; }

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

		try {
			return await result.p;
		} finally {
			disposables.dispose();
		}
	}

	private async doRecognizeKeyword(token: CancellationToken): Promise<KeywordRecognitionStatus> {
		const provider = firstOrDefault(Array.from(this.providers.values()));
		if (!provider) {
			throw new Error(`No Speech provider is registered.`);
		} else if (this.providers.size > 1) {
			this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
		}

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
