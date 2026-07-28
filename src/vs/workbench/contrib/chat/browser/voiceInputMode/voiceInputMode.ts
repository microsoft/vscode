/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
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
 * Simulated voice-cell visual states for development/preview, so the UI can be
 * inspected without a live backend connection. `undefined` = use real state.
 */
export type SimulatedVoiceState = 'off' | 'connecting' | 'idle' | 'listening' | 'speaking' | 'dictating';

/**
 * The four push-to-talk interaction designs being compared. Each drives its own
 * prototype walkthrough (state sequence + layout + hint) so they can be evaluated
 * side by side without a live backend.
 * - `handsFree`:   auto-listen + auto-send; hold a key only to barge in / interrupt.
 * - `keyboardHold`: walkie-talkie — hold a keybinding to talk; button only connects.
 * - `buttonHold`:  hold the voice button to talk; a quick tap disconnects.
 * - `clickToggle`: tap the button to start listening, tap again to stop.
 */
export type VoiceWalkthroughVersion = 'handsFree' | 'keyboardHold' | 'buttonHold' | 'clickToggle';

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

	/** Dev/preview override for the voice-cell visual state (undefined = real state). */
	readonly simulatedVoiceState: IObservable<SimulatedVoiceState | undefined>;

	/** Dev/preview override for hands-free layout (undefined = real config). */
	readonly simulatedHandsFree: IObservable<boolean | undefined>;

	/** Dev/preview: which push-to-talk version the walkthrough is demoing (undefined = none). */
	readonly simulatedVersion: IObservable<VoiceWalkthroughVersion | undefined>;

	/** Dev/preview: whether the voice cell is being "hovered" (walkthrough only). */
	readonly simulatedHover: IObservable<boolean>;

	/** Persist a new selected mode and update the context key. */
	setSelectedMode(mode: VoiceInputMode): void;

	/** Set (or clear) the dev/preview simulated voice-cell state. */
	setSimulatedVoiceState(state: SimulatedVoiceState | undefined): void;

	/** Auto-play (looping) through a push-to-talk version's states, incl. glow. */
	startVoiceStateWalkthrough(version: VoiceWalkthroughVersion): void;

	/** Advance the simulated state to the next one in the walkthrough sequence. */
	stepVoiceStateWalkthrough(): void;

	/** Stop any running walkthrough and clear the simulated state. */
	clearSimulation(): void;
}

/** One dev/preview walkthrough: a layout flag plus a timed sequence of voice states. */
interface IVoiceWalkthrough {
	readonly handsFree: boolean;
	readonly steps: readonly { readonly state: SimulatedVoiceState | undefined; readonly hover?: boolean; readonly ms?: number }[];
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

	private readonly _simulatedVersion = observableValue<VoiceWalkthroughVersion | undefined>(this, undefined);
	readonly simulatedVersion: IObservable<VoiceWalkthroughVersion | undefined> = this._simulatedVersion;

	private readonly _simulatedHover = observableValue<boolean>(this, false);
	readonly simulatedHover: IObservable<boolean> = this._simulatedHover;

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

	setSimulatedVoiceState(state: SimulatedVoiceState | undefined): void {
		this._simulatedVoiceState.set(state, undefined);
	}

	// Per-version walkthrough sequences. Each exercises the full lifecycle for one
	// push-to-talk design so the bars, colors, hover previews and input-box glow can be
	// watched exactly as a user would experience them. Sequences loop until cleared.
	private static readonly WALKTHROUGHS: Readonly<Record<VoiceWalkthroughVersion, IVoiceWalkthrough>> = {
		// Hands-free: connects, then auto-listens and replies; a quick listening flash
		// during a reply represents barge-in.
		handsFree: {
			handsFree: true,
			steps: [
				{ state: 'off', ms: 1600 },
				{ state: 'connecting', ms: 1400 },
				{ state: 'idle', ms: 1400 },
				{ state: 'listening', ms: 2800 },
				{ state: 'speaking', ms: 2800 },
				{ state: 'listening', ms: 1600 },   // barge-in
				{ state: 'speaking', ms: 2400 },
				{ state: 'idle', ms: 1600 },
				{ state: 'off', ms: 1600 },
			],
		},
		// Keyboard hold-to-talk (walkie-talkie): hold the keybinding to talk; the button
		// only connects/disconnects.
		keyboardHold: {
			handsFree: false,
			steps: [
				{ state: 'off', ms: 1600 },
				{ state: 'connecting', ms: 1400 },
				{ state: 'idle', ms: 2400 },        // "Hold ⌘⇧Space to talk"
				{ state: 'listening', ms: 2800 },   // key held
				{ state: 'speaking', ms: 2800 },    // reply
				{ state: 'idle', ms: 1800 },
				{ state: 'listening', ms: 2600 },
				{ state: 'speaking', ms: 2400 },
				{ state: 'idle', ms: 1600 },
				{ state: 'off', ms: 1600 },
			],
		},
		// Button hold-to-talk: hold the voice button to talk; a quick tap disconnects. The
		// idle+hover step previews the tap-to-disconnect affordance.
		buttonHold: {
			handsFree: false,
			steps: [
				{ state: 'off', ms: 1600 },
				{ state: 'connecting', ms: 1400 },
				{ state: 'idle', ms: 2200 },
				{ state: 'idle', hover: true, ms: 1800 },   // tap-to-disconnect preview
				{ state: 'listening', ms: 2800 },           // button held
				{ state: 'speaking', ms: 2800 },
				{ state: 'idle', ms: 1800 },
				{ state: 'listening', ms: 2600 },
				{ state: 'speaking', ms: 2400 },
				{ state: 'idle', ms: 1600 },
				{ state: 'off', ms: 1600 },
			],
		},
		// Click-to-toggle listening: tap to start listening, tap again to stop.
		clickToggle: {
			handsFree: false,
			steps: [
				{ state: 'off', ms: 1600 },
				{ state: 'connecting', ms: 1400 },
				{ state: 'idle', ms: 2000 },
				{ state: 'listening', ms: 2800 },   // tapped on
				{ state: 'idle', ms: 1800 },        // tapped off
				{ state: 'listening', ms: 2600 },
				{ state: 'speaking', ms: 2800 },    // reply
				{ state: 'listening', ms: 1800 },
				{ state: 'idle', ms: 1600 },
				{ state: 'off', ms: 1600 },
			],
		},
	};

	private static readonly WALK_STEP_MS = 2400;

	private _walkTimer: ReturnType<typeof setTimeout> | undefined;
	private _walkIndex = 0;
	private _walkVersion: VoiceWalkthroughVersion | undefined;

	startVoiceStateWalkthrough(version: VoiceWalkthroughVersion): void {
		this.clearSimulation();
		const walkthrough = VoiceInputModeService.WALKTHROUGHS[version];
		this._walkVersion = version;
		this._simulatedHandsFree.set(walkthrough.handsFree, undefined);
		this._simulatedVersion.set(version, undefined);
		this._walkIndex = 0;
		const advance = () => {
			const steps = walkthrough.steps;
			const step = steps[this._walkIndex % steps.length];
			transaction(tx => {
				this._simulatedVoiceState.set(step.state, tx);
				this._simulatedHover.set(step.hover ?? false, tx);
			});
			this._walkIndex++;
			this._walkTimer = setTimeout(advance, step.ms ?? VoiceInputModeService.WALK_STEP_MS);
		};
		advance();
	}

	stepVoiceStateWalkthrough(): void {
		this._stopWalkTimer();
		const version = this._walkVersion ?? 'keyboardHold';
		const steps = VoiceInputModeService.WALKTHROUGHS[version].steps;
		this._walkIndex = this._walkIndex % steps.length;
		const step = steps[this._walkIndex];
		transaction(tx => {
			this._simulatedVersion.set(version, tx);
			this._simulatedHandsFree.set(VoiceInputModeService.WALKTHROUGHS[version].handsFree, tx);
			this._simulatedVoiceState.set(step.state, tx);
			this._simulatedHover.set(step.hover ?? false, tx);
		});
		this._walkIndex++;
	}

	clearSimulation(): void {
		this._stopWalkTimer();
		this._walkIndex = 0;
		this._walkVersion = undefined;
		transaction(tx => {
			this._simulatedVoiceState.set(undefined, tx);
			this._simulatedHandsFree.set(undefined, tx);
			this._simulatedVersion.set(undefined, tx);
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
