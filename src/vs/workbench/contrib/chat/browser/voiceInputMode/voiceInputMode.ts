/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatSpeechToTextService } from '../speechToText/chatSpeechToTextService.js';

/**
 * The two mutually-exclusive voice input modes exposed in the chat input.
 * - `dictation`: speech-to-text that types the recognized words into the input box.
 * - `voice`: the live, conversational Voice Mode agent (real-time listen + talk-back).
 */
export type VoiceInputMode = 'dictation' | 'voice';

/**
 * Which voice input mode is currently selected in the segmented toggle. This is the
 * single source of truth for *which* segment is highlighted — distinct from whether
 * that mode is currently active (listening / connected / speaking).
 */
export const CHAT_VOICE_INPUT_MODE = new RawContextKey<VoiceInputMode>('chatVoiceInputMode', 'voice', { type: 'string', description: localize('chatVoiceInputMode', "The currently selected voice input mode in the chat input (dictation or voice).") });

const STORAGE_KEY = 'chat.voiceInputMode.selected';

export const IVoiceInputModeService = createDecorator<IVoiceInputModeService>('voiceInputModeService');

export interface IVoiceInputModeService {
	readonly _serviceBrand: undefined;

	/** The currently selected mode (persisted). */
	readonly selectedMode: IObservable<VoiceInputMode>;

	/** Whether live Voice Mode is available (feature enabled). */
	readonly voiceAvailable: IObservable<boolean>;

	/** Whether dictation is available (a speech provider is registered). */
	readonly dictationAvailable: IObservable<boolean>;

	/** Whether Voice Mode runs hands-free (auto-listen) vs manual push-to-talk. */
	readonly handsFree: IObservable<boolean>;

	/** Persist a new selected mode and update the context key. */
	setSelectedMode(mode: VoiceInputMode): void;

}

export class VoiceInputModeService extends Disposable implements IVoiceInputModeService {

	declare readonly _serviceBrand: undefined;

	private readonly _selectedMode: ISettableObservable<VoiceInputMode>;
	readonly selectedMode: IObservable<VoiceInputMode>;

	readonly voiceAvailable: IObservable<boolean>;
	readonly dictationAvailable: IObservable<boolean>;
	readonly handsFree: IObservable<boolean>;

	private readonly _contextKey: IContextKey<VoiceInputMode>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatSpeechToTextService chatSpeechToTextService: IChatSpeechToTextService,
	) {
		super();

		const stored = this.storageService.get(STORAGE_KEY, StorageScope.PROFILE);
		const initial: VoiceInputMode = stored === 'dictation' ? 'dictation' : 'voice';
		this._selectedMode = observableValue<VoiceInputMode>(this, initial);
		this.selectedMode = this._selectedMode;

		this.voiceAvailable = observableFromEvent(this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<boolean>('agents.voice.enabled') === true);

		// The dictation segment drives built-in on-device dictation
		// (`workbench.action.chat.toggleSpeechToText`). `isConfigured` already
		// requires native on-device transcription support (false on web) and the
		// `chat.speechToText.enabled` kill-switch, so the segment only appears
		// where clicking it can actually dictate.
		this.dictationAvailable = observableFromEvent(this,
			configurationService.onDidChangeConfiguration,
			() => chatSpeechToTextService.isConfigured);

		// Hands-free mirrors the voice controller's auto-listen source of truth
		// (`agents.voice.handsFree`, default true). In manual (non-hands-free)
		// mode the pill shows a dedicated listen cell to start/stop each turn.
		this.handsFree = observableFromEvent(this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<boolean>('agents.voice.handsFree') !== false);

		this._contextKey = CHAT_VOICE_INPUT_MODE.bindTo(contextKeyService);
		this._register(autorun(reader => {
			this._contextKey.set(this._selectedMode.read(reader));
		}));
	}

	setSelectedMode(mode: VoiceInputMode): void {
		if (this._selectedMode.get() === mode) {
			return;
		}
		this._selectedMode.set(mode, undefined);
		this.storageService.store(STORAGE_KEY, mode, StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(IVoiceInputModeService, VoiceInputModeService, InstantiationType.Delayed);
