/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ISpeechService } from '../../../speech/common/speechService.js';

/**
 * The two mutually-exclusive voice input modes exposed in the chat input.
 * - `dictation`: speech-to-text that types the recognized words into the input box.
 * - `voice`: the live, conversational Voice Mode agent (real-time listen + talk-back).
 */
export type VoiceInputMode = 'dictation' | 'voice';

/**
 * Simulated voice-cell visual states for development/preview, so the UI can be
 * inspected without a live backend connection. `undefined` = use real state.
 */
export type SimulatedVoiceState = 'off' | 'connecting' | 'idle' | 'listening' | 'speaking' | 'dictating';

/**
 * Which voice input mode is currently selected in the segmented toggle. This is the
 * single source of truth for *which* segment is highlighted — distinct from whether
 * that mode is currently active (listening / connected / speaking).
 */
export const CHAT_VOICE_INPUT_MODE = new RawContextKey<VoiceInputMode>('chatVoiceInputMode', 'voice', { type: 'string', description: localize('chatVoiceInputMode', "The currently selected voice input mode in the chat input (dictation or voice).") });

/**
 * Rollout flag. When enabled, the chat input shows a single segmented Dictation/Voice
 * toggle instead of the two independent mic buttons. Default off until stabilized.
 */
export const VoiceInputModeSegmentedSettingId = 'chat.voiceInputMode.segmentedToggle';

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

	/** Dev/preview override for the voice-cell visual state (undefined = real state). */
	readonly simulatedVoiceState: IObservable<SimulatedVoiceState | undefined>;

	/** Dev/preview override for hands-free layout (undefined = real config). */
	readonly simulatedHandsFree: IObservable<boolean | undefined>;

	/** Dev/preview: whether the voice cell is being "hovered" (walkthrough only). */
	readonly simulatedHover: IObservable<boolean>;

	/** Persist a new selected mode and update the context key. */
	setSelectedMode(mode: VoiceInputMode): void;

	/** Set (or clear) the dev/preview simulated voice-cell state. */
	setSimulatedVoiceState(state: SimulatedVoiceState | undefined): void;

	/** Auto-play through every voice-cell state (dev prototype), then clear. */
	startVoiceStateWalkthrough(handsFree?: boolean): void;

	/** Advance the simulated state to the next one in the walkthrough sequence. */
	stepVoiceStateWalkthrough(): void;

	/** Stop any running walkthrough and clear the simulated state. */
	clearSimulation(): void;
}

export class VoiceInputModeService extends Disposable implements IVoiceInputModeService {

	declare readonly _serviceBrand: undefined;

	private readonly _selectedMode: ISettableObservable<VoiceInputMode>;
	readonly selectedMode: IObservable<VoiceInputMode>;

	readonly voiceAvailable: IObservable<boolean>;
	readonly dictationAvailable: IObservable<boolean>;
	readonly handsFree: IObservable<boolean>;

	private readonly _simulatedVoiceState = observableValue<SimulatedVoiceState | undefined>(this, undefined);
	readonly simulatedVoiceState: IObservable<SimulatedVoiceState | undefined> = this._simulatedVoiceState;

	private readonly _simulatedHandsFree = observableValue<boolean | undefined>(this, undefined);
	readonly simulatedHandsFree: IObservable<boolean | undefined> = this._simulatedHandsFree;

	private readonly _simulatedHover = observableValue<boolean>(this, false);
	readonly simulatedHover: IObservable<boolean> = this._simulatedHover;

	private readonly _contextKey: IContextKey<VoiceInputMode>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISpeechService speechService: ISpeechService,
	) {
		super();

		const stored = this.storageService.get(STORAGE_KEY, StorageScope.PROFILE);
		const initial: VoiceInputMode = stored === 'dictation' ? 'dictation' : 'voice';
		this._selectedMode = observableValue<VoiceInputMode>(this, initial);
		this.selectedMode = this._selectedMode;

		this.voiceAvailable = observableFromEvent(this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<boolean>('agents.voice.enabled') === true);

		this.dictationAvailable = observableFromEvent(this,
			speechService.onDidChangeHasSpeechProvider,
			() => speechService.hasSpeechProvider);

		this.handsFree = observableFromEvent(this,
			configurationService.onDidChangeConfiguration,
			() => (configurationService.getValue<number>('agents.voice.autoSendDelay') ?? 500) >= 0);

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

	setSimulatedVoiceState(state: SimulatedVoiceState | undefined): void {
		this._simulatedVoiceState.set(state, undefined);
	}

	// A representative sequence exercising every transition, including hover-to-disconnect
	// previews. Each step sets a voice state and whether the voice icon is being hovered.
	private static readonly WALKTHROUGH: readonly { readonly state: SimulatedVoiceState | undefined; readonly hover?: boolean }[] = [
		{ state: 'off' },
		{ state: 'dictating' },
		{ state: 'off' },
		{ state: 'connecting' },
		{ state: 'idle' },
		{ state: 'idle', hover: true },   // hover preview → "silent" bars
		{ state: 'listening' },
		{ state: 'listening', hover: true },
		{ state: 'speaking' },
		{ state: 'idle' },
		{ state: 'off' },
		{ state: undefined },
	];

	private static readonly WALK_STEP_MS = 2600;

	private _walkTimer: ReturnType<typeof setTimeout> | undefined;
	private _walkIndex = 0;

	startVoiceStateWalkthrough(handsFree?: boolean): void {
		this.clearSimulation();
		this._simulatedHandsFree.set(handsFree, undefined);
		this._walkIndex = 0;
		const advance = () => {
			if (this._walkIndex >= VoiceInputModeService.WALKTHROUGH.length) {
				this._walkTimer = undefined;
				this.clearSimulation();
				return;
			}
			const step = VoiceInputModeService.WALKTHROUGH[this._walkIndex];
			transaction(tx => {
				this._simulatedVoiceState.set(step.state, tx);
				this._simulatedHover.set(step.hover ?? false, tx);
			});
			this._walkIndex++;
			this._walkTimer = setTimeout(advance, VoiceInputModeService.WALK_STEP_MS);
		};
		advance();
	}

	stepVoiceStateWalkthrough(): void {
		this._stopWalkTimer();
		const seq = VoiceInputModeService.WALKTHROUGH;
		this._walkIndex = this._walkIndex % seq.length;
		const step = seq[this._walkIndex];
		transaction(tx => {
			this._simulatedVoiceState.set(step.state, tx);
			this._simulatedHover.set(step.hover ?? false, tx);
		});
		this._walkIndex++;
	}

	clearSimulation(): void {
		this._stopWalkTimer();
		this._walkIndex = 0;
		transaction(tx => {
			this._simulatedVoiceState.set(undefined, tx);
			this._simulatedHandsFree.set(undefined, tx);
			this._simulatedHover.set(false, tx);
		});
	}

	private _stopWalkTimer(): void {
		if (this._walkTimer !== undefined) {
			clearTimeout(this._walkTimer);
			this._walkTimer = undefined;
		}
	}

	override dispose(): void {
		this._stopWalkTimer();
		super.dispose();
	}
}

registerSingleton(IVoiceInputModeService, VoiceInputModeService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatSidebar',
	order: 100,
	type: 'object',
	properties: {
		[VoiceInputModeSegmentedSettingId]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			description: localize('chat.voiceInputMode.segmentedToggle', "Show a single segmented Dictation / Voice Mode toggle in the chat input instead of two separate microphone buttons."),
		}
	}
});
