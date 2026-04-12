/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { language } from '../../../../base/common/platform.js';
export const ISpeechService = createDecorator('speechService');
export const HasSpeechProvider = new RawContextKey('hasSpeechProvider', false, { type: 'boolean', description: localize('hasSpeechProvider', "A speech provider is registered to the speech service.") });
export const SpeechToTextInProgress = new RawContextKey('speechToTextInProgress', false, { type: 'boolean', description: localize('speechToTextInProgress', "A speech-to-text session is in progress.") });
export const TextToSpeechInProgress = new RawContextKey('textToSpeechInProgress', false, { type: 'boolean', description: localize('textToSpeechInProgress', "A text-to-speech session is in progress.") });
export var SpeechToTextStatus;
(function (SpeechToTextStatus) {
    SpeechToTextStatus[SpeechToTextStatus["Started"] = 1] = "Started";
    SpeechToTextStatus[SpeechToTextStatus["Recognizing"] = 2] = "Recognizing";
    SpeechToTextStatus[SpeechToTextStatus["Recognized"] = 3] = "Recognized";
    SpeechToTextStatus[SpeechToTextStatus["Stopped"] = 4] = "Stopped";
    SpeechToTextStatus[SpeechToTextStatus["Error"] = 5] = "Error";
})(SpeechToTextStatus || (SpeechToTextStatus = {}));
export var TextToSpeechStatus;
(function (TextToSpeechStatus) {
    TextToSpeechStatus[TextToSpeechStatus["Started"] = 1] = "Started";
    TextToSpeechStatus[TextToSpeechStatus["Stopped"] = 2] = "Stopped";
    TextToSpeechStatus[TextToSpeechStatus["Error"] = 3] = "Error";
})(TextToSpeechStatus || (TextToSpeechStatus = {}));
export var KeywordRecognitionStatus;
(function (KeywordRecognitionStatus) {
    KeywordRecognitionStatus[KeywordRecognitionStatus["Recognized"] = 1] = "Recognized";
    KeywordRecognitionStatus[KeywordRecognitionStatus["Stopped"] = 2] = "Stopped";
    KeywordRecognitionStatus[KeywordRecognitionStatus["Canceled"] = 3] = "Canceled";
})(KeywordRecognitionStatus || (KeywordRecognitionStatus = {}));
export var AccessibilityVoiceSettingId;
(function (AccessibilityVoiceSettingId) {
    AccessibilityVoiceSettingId["SpeechTimeout"] = "accessibility.voice.speechTimeout";
    AccessibilityVoiceSettingId["AutoSynthesize"] = "accessibility.voice.autoSynthesize";
    AccessibilityVoiceSettingId["SpeechLanguage"] = "accessibility.voice.speechLanguage";
    AccessibilityVoiceSettingId["IgnoreCodeBlocks"] = "accessibility.voice.ignoreCodeBlocks";
})(AccessibilityVoiceSettingId || (AccessibilityVoiceSettingId = {}));
export const SPEECH_LANGUAGE_CONFIG = "accessibility.voice.speechLanguage" /* AccessibilityVoiceSettingId.SpeechLanguage */;
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
export function speechLanguageConfigToLanguage(config, lang = language) {
    if (typeof config === 'string') {
        if (config === 'auto') {
            if (lang !== 'en') {
                const langParts = lang.split('-');
                return speechLanguageConfigToLanguage(`${langParts[0]}-${(langParts[1] ?? langParts[0]).toUpperCase()}`);
            }
        }
        else {
            if (SPEECH_LANGUAGES[config]) {
                return config;
            }
        }
    }
    return 'en-US';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BlZWNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFJOUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFL0QsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBaUIsZUFBZSxDQUFDLENBQUM7QUFFL0UsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxhQUFhLENBQVUsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHdEQUF3RCxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25OLE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLElBQUksYUFBYSxDQUFVLHdCQUF3QixFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSwwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNwTixNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSx3QkFBd0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsMENBQTBDLENBQUMsRUFBRSxDQUFDLENBQUM7QUFPcE4sTUFBTSxDQUFOLElBQVksa0JBTVg7QUFORCxXQUFZLGtCQUFrQjtJQUM3QixpRUFBVyxDQUFBO0lBQ1gseUVBQWUsQ0FBQTtJQUNmLHVFQUFjLENBQUE7SUFDZCxpRUFBVyxDQUFBO0lBQ1gsNkRBQVMsQ0FBQTtBQUNWLENBQUMsRUFOVyxrQkFBa0IsS0FBbEIsa0JBQWtCLFFBTTdCO0FBV0QsTUFBTSxDQUFOLElBQVksa0JBSVg7QUFKRCxXQUFZLGtCQUFrQjtJQUM3QixpRUFBVyxDQUFBO0lBQ1gsaUVBQVcsQ0FBQTtJQUNYLDZEQUFTLENBQUE7QUFDVixDQUFDLEVBSlcsa0JBQWtCLEtBQWxCLGtCQUFrQixRQUk3QjtBQWFELE1BQU0sQ0FBTixJQUFZLHdCQUlYO0FBSkQsV0FBWSx3QkFBd0I7SUFDbkMsbUZBQWMsQ0FBQTtJQUNkLDZFQUFXLENBQUE7SUFDWCwrRUFBWSxDQUFBO0FBQ2IsQ0FBQyxFQUpXLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFJbkM7QUF5RUQsTUFBTSxDQUFOLElBQWtCLDJCQUtqQjtBQUxELFdBQWtCLDJCQUEyQjtJQUM1QyxrRkFBbUQsQ0FBQTtJQUNuRCxvRkFBcUQsQ0FBQTtJQUNyRCxvRkFBcUQsQ0FBQTtJQUNyRCx3RkFBeUQsQ0FBQTtBQUMxRCxDQUFDLEVBTGlCLDJCQUEyQixLQUEzQiwyQkFBMkIsUUFLNUM7QUFFRCxNQUFNLENBQUMsTUFBTSxzQkFBc0Isd0ZBQTZDLENBQUM7QUFFakYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUc7SUFDL0IsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsa0JBQWtCLENBQUM7S0FDMUQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxrQkFBa0IsQ0FBQztLQUMxRDtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLHFCQUFxQixDQUFDO0tBQzdEO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsa0JBQWtCLENBQUM7S0FDMUQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSwwQkFBMEIsQ0FBQztLQUNsRTtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLG1CQUFtQixDQUFDO0tBQzNEO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsaUJBQWlCLENBQUM7S0FDekQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSx1QkFBdUIsQ0FBQztLQUMvRDtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLHlCQUF5QixDQUFDO0tBQ2pFO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsaUJBQWlCLENBQUM7S0FDekQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxrQkFBa0IsQ0FBQztLQUMxRDtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLGlCQUFpQixDQUFDO0tBQ3pEO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsaUJBQWlCLENBQUM7S0FDekQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxlQUFlLENBQUM7S0FDdkQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxpQkFBaUIsQ0FBQztLQUN6RDtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLGtCQUFrQixDQUFDO0tBQzFEO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsc0JBQXNCLENBQUM7S0FDOUQ7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsQ0FBQztLQUM3RDtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLHVCQUF1QixDQUFDO0tBQy9EO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUscUJBQXFCLENBQUM7S0FDN0Q7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxrQkFBa0IsQ0FBQztLQUMxRDtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLGtCQUFrQixDQUFDO0tBQzFEO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLDhCQUE4QjtRQUM5QixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLG1CQUFtQixDQUFDO0tBQzNEO0lBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsNkJBQTZCLENBQUM7S0FDckU7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxrQ0FBa0MsQ0FBQztLQUMxRTtJQUNELENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLCtCQUErQixDQUFDO0tBQ3ZFO0NBQ0QsQ0FBQztBQUVGLE1BQU0sVUFBVSw4QkFBOEIsQ0FBQyxNQUFlLEVBQUUsSUFBSSxHQUFHLFFBQVE7SUFDOUUsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUNoQyxJQUFJLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUN2QixJQUFJLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDbkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFbEMsT0FBTyw4QkFBOEIsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDMUcsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxnQkFBZ0IsQ0FBQyxNQUF1QyxDQUFDLEVBQUUsQ0FBQztnQkFDL0QsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDIn0=