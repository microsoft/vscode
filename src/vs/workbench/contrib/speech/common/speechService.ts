/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { language } from 'vs/base/common/platform';

export const ISpeechService = createDecorator<ISpeechService>('speechService');

export const HasSpeechProvider = new RawContextKey<boolean>('hasSpeechProvider', false, { type: 'string', description: localize('hasSpeechProvider', "A speech provider is registered to the speech service.") });
export const SpeechToTextInProgress = new RawContextKey<boolean>('speechToTextInProgress', false, { type: 'string', description: localize('speechToTextInProgress', "A speech-to-text session is in progress.") });

export interface ISpeechProviderMetadata {
	readonly extension: ExtensionIdentifier;
	readonly displayName: string;
}

export enum SpeechToTextStatus {
	Started = 1,
	Recognizing = 2,
	Recognized = 3,
	Stopped = 4
}

export interface ISpeechToTextEvent {
	readonly status: SpeechToTextStatus;
	readonly text?: string;
}

export interface ISpeechToTextSession {
	readonly onDidChange: Event<ISpeechToTextEvent>;
}

export enum KeywordRecognitionStatus {
	Recognized = 1,
	Stopped = 2,
	Canceled = 3
}

export interface IKeywordRecognitionEvent {
	readonly status: KeywordRecognitionStatus;
	readonly text?: string;
}

export interface IKeywordRecognitionSession {
	readonly onDidChange: Event<IKeywordRecognitionEvent>;
}

export interface ISpeechToTextSessionOptions {
	readonly language?: string;
}

export interface ISpeechProvider {
	readonly metadata: ISpeechProviderMetadata;

	createSpeechToTextSession(token: CancellationToken, options?: ISpeechToTextSessionOptions): ISpeechToTextSession;
	createKeywordRecognitionSession(token: CancellationToken): IKeywordRecognitionSession;
}

export interface ISpeechService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeHasSpeechProvider: Event<void>;

	readonly hasSpeechProvider: boolean;

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable;

	readonly onDidStartSpeechToTextSession: Event<void>;
	readonly onDidEndSpeechToTextSession: Event<void>;

	readonly hasActiveSpeechToTextSession: boolean;

	/**
	 * Starts to transcribe speech from the default microphone. The returned
	 * session object provides an event to subscribe for transcribed text.
	 */
	createSpeechToTextSession(token: CancellationToken, context?: string): Promise<ISpeechToTextSession>;

	readonly onDidStartKeywordRecognition: Event<void>;
	readonly onDidEndKeywordRecognition: Event<void>;

	readonly hasActiveKeywordRecognition: boolean;

	/**
	 * Starts to recognize a keyword from the default microphone. The returned
	 * status indicates if the keyword was recognized or if the session was
	 * stopped.
	 */
	recognizeKeyword(token: CancellationToken): Promise<KeywordRecognitionStatus>;
}

export const SPEECH_LANGUAGE_CONFIG = 'accessibility.voice.speechLanguage';

export const SPEECH_LANGUAGES = {
	['da-DK']: {
		name: localize('speechLanguage.da-DK', "Danish (Denmark)")
	},
	['de-DE']: {
		name: localize('speechLanguage.de-DE', "German (Germany)")
	},
	['en-AU']: {
		name: localize('speechLanguage.en-AU', "English (Australia)")
	},
	['en-CA']: {
		name: localize('speechLanguage.en-CA', "English (Canada)")
	},
	['en-GB']: {
		name: localize('speechLanguage.en-GB', "English (United Kingdom)")
	},
	['en-IE']: {
		name: localize('speechLanguage.en-IE', "English (Ireland)")
	},
	['en-IN']: {
		name: localize('speechLanguage.en-IN', "English (India)")
	},
	['en-NZ']: {
		name: localize('speechLanguage.en-NZ', "English (New Zealand)")
	},
	['en-US']: {
		name: localize('speechLanguage.en-US', "English (United States)")
	},
	['es-ES']: {
		name: localize('speechLanguage.es-ES', "Spanish (Spain)")
	},
	['es-MX']: {
		name: localize('speechLanguage.es-MX', "Spanish (Mexico)")
	},
	['fr-CA']: {
		name: localize('speechLanguage.fr-CA', "French (Canada)")
	},
	['fr-FR']: {
		name: localize('speechLanguage.fr-FR', "French (France)")
	},
	['hi-IN']: {
		name: localize('speechLanguage.hi-IN', "Hindi (India)")
	},
	['it-IT']: {
		name: localize('speechLanguage.it-IT', "Italian (Italy)")
	},
	['ja-JP']: {
		name: localize('speechLanguage.ja-JP', "Japanese (Japan)")
	},
	['ko-KR']: {
		name: localize('speechLanguage.ko-KR', "Korean (South Korea)")
	},
	['nl-NL']: {
		name: localize('speechLanguage.nl-NL', "Dutch (Netherlands)")
	},
	['pt-PT']: {
		name: localize('speechLanguage.pt-PT', "Portuguese (Portugal)")
	},
	['pt-BR']: {
		name: localize('speechLanguage.pt-BR', "Portuguese (Brazil)")
	},
	['ru-RU']: {
		name: localize('speechLanguage.ru-RU', "Russian (Russia)")
	},
	['sv-SE']: {
		name: localize('speechLanguage.sv-SE', "Swedish (Sweden)")
	},
	['tr-TR']: {
		// allow-any-unicode-next-line
		name: localize('speechLanguage.tr-TR', "Turkish (Türkiye)")
	},
	['zh-CN']: {
		name: localize('speechLanguage.zh-CN', "Chinese (Simplified, China)")
	},
	['zh-HK']: {
		name: localize('speechLanguage.zh-HK', "Chinese (Traditional, Hong Kong)")
	},
	['zh-TW']: {
		name: localize('speechLanguage.zh-TW', "Chinese (Traditional, Taiwan)")
	}
};

export function speechLanguageConfigToLanguage(config: unknown, lang = language): string {
	if (typeof config === 'string') {
		if (config === 'auto') {
			if (lang !== 'en') {
				const langParts = lang.split('-');

				return speechLanguageConfigToLanguage(`${langParts[0]}-${(langParts[1] ?? langParts[0]).toUpperCase()}`);
			}
		} else {
			if (SPEECH_LANGUAGES[config as keyof typeof SPEECH_LANGUAGES]) {
				return config;
			}
		}
	}

	return 'en-US';
}
