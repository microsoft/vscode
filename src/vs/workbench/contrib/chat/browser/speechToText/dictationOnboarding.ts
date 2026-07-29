/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID } from '../actions/configureVoiceInstructionsAction.js';
import { ChatInputOnboarding, ChatInputOnboardingCard } from '../widget/input/chatInputOnboarding.js';
import './media/dictationOnboarding.css';

/**
 * Marks the introduction as seen. Dictation-scoped and deliberately separate
 * from the Voice Mode introduction, so neither feature's card suppresses the
 * other's.
 */
const DICTATION_INTRO_SHOWN_KEY = 'chat.dictation.introShown';

/** Opens the settings editor, filtered by the query below. */
const OPEN_SETTINGS_COMMAND = 'workbench.action.openSettings';

/** Narrows settings to dictation's own: enabled, model, showTranscript. */
const DICTATION_SETTINGS_QUERY = 'dictation';

/** The `deviceId` value that means "whatever the system is using". */
const SYSTEM_DEFAULT_DEVICE_ID = '';

type DictationOnboardingAction = 'shown' | 'selectMicrophone' | 'openSettings' | 'openInstructions' | 'startDictation' | 'cancel';

type DictationOnboardingActionClassification = {
	action: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The action taken in the Dictation onboarding card.' };
	source: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Whether the card appeared automatically on first use or was opened manually.' };
	owner: 'meganrogge';
	comment: 'Tracks engagement with the Dictation onboarding card.';
};

type DictationOnboardingActionEvent = {
	action: DictationOnboardingAction;
	source: 'automatic' | 'manual';
};

// --- Level meter ---------------------------------------------------------

/**
 * Bar metrics. Voice Mode's waveform - both the toolbar pill and its own
 * introduction card - is a row of hairline strokes with a hairline of air
 * beside each, so this uses the same instrument at a larger size.
 */
const BAR_WIDTH = 1;
const BAR_GAP = 2;

/** Amplitude with nothing being said: present, but clearly at rest. */
const IDLE_GAIN = 0.55;

/** Extra amplitude at peak loudness. */
const SPEAKING_GAIN = 0.45;

/** How quickly the row chases the microphone. Low and slow reads as smooth; a
 * row that tracks every frame exactly reads as flicker rather than as level. */
const LEVEL_EASING = 0.12;

/** Opacity of the row when nothing is being said. */
const RESTING_OPACITY = 0.35;

/** Extra opacity at peak loudness, so the row brightens as the user speaks. */
const SPEAKING_OPACITY = 0.5;

/**
 * Opacity when the microphone cannot be read at all. Dimmer than rest, because
 * a row at resting strength implies a working device that simply is not hearing
 * anything - which is the opposite of what is true.
 */
const UNAVAILABLE_OPACITY = 0.2;

/**
 * Shortest gap between repaints when reduced motion is on. The meter is
 * feedback, not decoration - switching it off would remove the only answer the
 * card has to "is my microphone working" - so it is slowed to a readable step
 * rather than stopped.
 */
const REDUCED_MOTION_PAINT_INTERVAL_MS = 100;

/**
 * One sine component of the waveform's texture. The trace is a handful of these
 * summed together, which is what gives it a recognisable ripple rather than a
 * single pulsing curve.
 */
interface IWave {
	readonly frequency: number;
	readonly amplitude: number;
	readonly speed: number;
	readonly phase: number;
}

/**
 * The waveform's texture. Mirrors the signatures Voice Mode's introduction uses,
 * so the two cards read as the same instrument rather than as two features that
 * happen to both draw bars.
 */
const WAVES: readonly IWave[] = [
	{ frequency: 1.0, amplitude: 0.42, speed: 0.42, phase: 0.0 },
	{ frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
	{ frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
	{ frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 },
];

/**
 * Half-height of the row at `position` (0..1 across the strip), as a fraction of
 * the available half-height.
 *
 * Each component contributes an already-positive, cusp-free curve. Summing raw
 * sines and taking their magnitude would put a sharp corner at every zero
 * crossing - that is what makes a waveform look like it is snapping up and down
 * rather than flowing.
 */
function bandFraction(position: number, time: number): number {
	let amplitude = 0;
	let total = 0;
	for (const wave of WAVES) {
		const phase = position * wave.frequency * Math.PI * 2 + time * wave.speed + wave.phase;
		amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
		total += wave.amplitude;
	}
	if (total === 0) {
		return 0;
	}
	// Centre-peak silhouette, matching the toolbar waveform: tallest in the
	// middle, tapering to the ends, so the row reads as one instrument rather
	// than a strip cut off at both edges.
	const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, position)));
	return (amplitude / total) * (0.35 + 0.65 * taper);
}

/** Why the microphone preview is not showing a level. */
const enum MicrophonePreviewError {
	/** The user (or the OS) refused access to the microphone. */
	Denied = 'denied',
	/** There is no microphone to listen to. */
	NoDevice = 'noDevice',
	/** Anything else, including a browser without `getUserMedia`. */
	Unavailable = 'unavailable',
}

/**
 * Listens to a microphone purely so its loudness can be shown. Owns the media
 * stream, the audio graph and nothing else; releasing it frees the microphone.
 *
 * This is deliberately independent of the dictation pipeline: the whole point of
 * the card is to prove the chosen device works *before* anything is recorded.
 */
class MicrophonePreview extends Disposable {

	private readonly session = this._register(new MutableDisposable<DisposableStore>());

	private analyser: AnalyserNode | undefined;
	private waveform: Uint8Array<ArrayBuffer> | undefined;

	private readonly _onDidChangeError = this._register(new Emitter<MicrophonePreviewError | undefined>());
	/** Fires with the reason no level is available, or `undefined` once one is. */
	readonly onDidChangeError = this._onDidChangeError.event;

	private _error: MicrophonePreviewError | undefined;
	get error(): MicrophonePreviewError | undefined { return this._error; }

	constructor(
		private readonly element: HTMLElement,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	/**
	 * Current loudness, `0..1`, or `0` when nothing is being heard. Read every
	 * frame, so it stays allocation-free.
	 */
	getLevel(): number {
		if (!this.analyser || !this.waveform) {
			return 0;
		}
		this.analyser.getByteTimeDomainData(this.waveform);
		let sum = 0;
		for (const sample of this.waveform) {
			const centered = (sample - 128) / 128;
			sum += centered * centered;
		}
		// RMS, scaled so ordinary speech fills most of the row rather than a
		// sliver of it.
		return Math.min(1, Math.sqrt(sum / this.waveform.length) * 4);
	}

	/**
	 * Listen to `deviceId` (empty means the system default). Replaces any stream
	 * already running, so switching devices never leaves two microphones open.
	 */
	async listen(deviceId: string): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}

		this.releaseMicrophone();

		const targetWindow = dom.getWindow(this.element);
		const mediaDevices = targetWindow.navigator.mediaDevices;
		if (!mediaDevices?.getUserMedia) {
			this.setError(MicrophonePreviewError.Unavailable);
			return;
		}

		const constraints: MediaTrackConstraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true };
		if (deviceId) {
			constraints.deviceId = { exact: deviceId };
		}

		let stream: MediaStream;
		try {
			stream = await mediaDevices.getUserMedia({ audio: constraints });
		} catch (error) {
			this.setError(toPreviewError(error));
			this.logService.trace(`[chat-stt] microphone preview unavailable: ${error}`);
			return;
		}

		const store = new DisposableStore();
		store.add(toDisposable(() => stream.getTracks().forEach(track => track.stop())));

		let analyser: AnalyserNode;
		try {
			const context = new targetWindow.AudioContext();
			store.add(toDisposable(() => void context.close().catch(() => { /* already closing */ })));
			// Chromium starts an `AudioContext` suspended when the page has no
			// sticky user activation, and a suspended graph reports silence - a
			// dead meter that looks exactly like a dead microphone.
			if (context.state === 'suspended') {
				await context.resume();
			}
			analyser = context.createAnalyser();
			// Time-domain only: the row's shape comes from the travelling wave,
			// and all the analyser has to supply is how loud the room is.
			analyser.fftSize = 256;
			context.createMediaStreamSource(stream).connect(analyser);
		} catch (error) {
			store.dispose();
			this.setError(MicrophonePreviewError.Unavailable);
			this.logService.trace(`[chat-stt] microphone preview analyser unavailable: ${error}`);
			return;
		}

		// The card can be dismissed while `getUserMedia` is still resolving; the
		// session is already cleared in that case, so assigning here would leak a
		// live microphone.
		if (this._store.isDisposed) {
			store.dispose();
			return;
		}

		this.session.value = store;
		this.analyser = analyser;
		this.waveform = new Uint8Array(analyser.fftSize);
		this.setError(undefined);
	}

	/**
	 * Hand the microphone back. Called before dictation acquires its own stream:
	 * two captures of one device is what makes the audio service drop the
	 * capture, so the preview always lets go first.
	 */
	releaseMicrophone(): void {
		this.analyser = undefined;
		this.waveform = undefined;
		this.session.clear();
	}

	private setError(error: MicrophonePreviewError | undefined): void {
		if (this._error === error) {
			return;
		}
		this._error = error;
		this._onDidChangeError.fire(error);
	}
}

/** Map a `getUserMedia` rejection onto the reason shown in the card. */
function toPreviewError(error: unknown): MicrophonePreviewError {
	if (error instanceof DOMException) {
		if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
			return MicrophonePreviewError.Denied;
		}
		if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
			return MicrophonePreviewError.NoDevice;
		}
	}
	return MicrophonePreviewError.Unavailable;
}

/** What the waveform needs each frame, supplied by the preview. */
interface IWaveformSource {
	/** Loudness of the room, `0` when nothing is being heard. */
	getLevel(): number;
	/** `false` when the microphone cannot be read at all. */
	isAvailable(): boolean;
}

/**
 * The live waveform: a row of hairline strokes whose shape flows and whose
 * height follows the microphone. The card's whole job is to answer "is this
 * device hearing me", and a trace that swells when you speak answers it before
 * any words are read.
 *
 * Deliberately not a spectrum analyser. Per-band bars make neighbours jump
 * independently, which reads as a chart; the shape here is one continuous
 * travelling wave - the same instrument Voice Mode uses - so the row moves like
 * a voice.
 */
class MicrophoneWaveform extends Disposable {

	private bars: HTMLElement[] = [];
	private readonly animationFrame = this._register(new MutableDisposable<IDisposable>());

	private running = false;
	private lastPaint = 0;
	private level = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly source: IWaveformSource,
		observerCtor: typeof ResizeObserver | undefined,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		container.setAttribute('aria-hidden', 'true');

		// The bar count follows the measured width rather than being fixed: at a
		// fixed count the gaps stretch or crowd as the panel resizes, and the
		// 1px/2px rhythm the instrument is built on is the first thing lost.
		const observer = new (observerCtor ?? dom.getWindow(container).ResizeObserver)(() => this.layout());
		observer.observe(container);
		this._register(toDisposable(() => observer.disconnect()));

		this.layout();
		this._register(toDisposable(() => this.stop()));
	}

	/** Rebuild the row for the current width, if the count actually changed. */
	private layout(): void {
		const width = this.container.clientWidth;
		if (!width) {
			return;
		}
		const count = Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
		if (count === this.bars.length) {
			return;
		}
		dom.clearNode(this.container);
		this.bars = [];
		for (let i = 0; i < count; i++) {
			this.bars.push(dom.append(this.container, dom.$('span.dictation-onboarding-bar')));
		}
	}

	start(): void {
		if (this.running) {
			return;
		}
		this.running = true;
		const targetWindow = dom.getWindow(this.container);
		const tick = () => {
			if (!this.running) {
				return;
			}
			this.update(targetWindow.performance.now());
			this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
		};
		this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
	}

	stop(): void {
		this.running = false;
		this.animationFrame.clear();
	}

	private update(timestamp: number): void {
		const interval = this.accessibilityService.isMotionReduced() ? REDUCED_MOTION_PAINT_INTERVAL_MS : 0;
		if (timestamp - this.lastPaint < interval) {
			return;
		}
		this.lastPaint = timestamp;

		// Ease towards the microphone rather than tracking it exactly: the level
		// is what the row *means*, and a value that jumps every frame reads as
		// flicker instead of as loudness.
		this.level += (this.source.getLevel() - this.level) * LEVEL_EASING;
		const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;
		const time = timestamp * 0.001;

		// Brightness rides the same level as the height, so the row is quiet at
		// rest and lifts as the user speaks - and drops below rest entirely when
		// there is no microphone to hear. Set on the container: one style write
		// per frame rather than one per stroke.
		this.container.style.opacity = (this.source.isAvailable()
			? RESTING_OPACITY + this.level * SPEAKING_OPACITY
			: UNAVAILABLE_OPACITY).toFixed(3);

		const count = this.bars.length;
		for (let i = 0; i < count; i++) {
			const position = count > 1 ? i / (count - 1) : 0;
			// Scaled rather than resized: transform stays off the layout path, so
			// a row of hairlines at 60fps never reflows the chat input. The floor
			// leaves a thin line rather than nothing, so a silent microphone
			// still reads as present.
			const amount = Math.max(0.08, Math.min(1, bandFraction(position, time) * gain));
			this.bars[i].style.transform = `scaleY(${amount.toFixed(3)})`;
		}
	}
}

// --- Microphone options --------------------------------------------------

/** One entry in the card's microphone picker. */
export interface IMicrophoneOption {
	readonly deviceId: string;
	readonly label: string;
}

/**
 * The pickable microphones, always led by "System default".
 *
 * Drops the virtual `default`/`communications` entries (which duplicate a real
 * device under a synthetic id) and de-duplicates by `deviceId`, so one physical
 * microphone appears exactly once - the same normalization the "Select
 * Microphone" quick pick does, kept in one place so the two never disagree.
 */
export function buildMicrophoneOptions(devices: readonly MediaDeviceInfo[]): IMicrophoneOption[] {
	const options: IMicrophoneOption[] = [{
		deviceId: SYSTEM_DEFAULT_DEVICE_ID,
		label: localize('dictation.onboarding.systemDefault', "System default"),
	}];

	const seen = new Set<string>();
	for (const device of devices) {
		if (device.kind !== 'audioinput' || device.deviceId === 'default' || device.deviceId === 'communications') {
			continue;
		}
		if (seen.has(device.deviceId)) {
			continue;
		}
		seen.add(device.deviceId);
		options.push({
			deviceId: device.deviceId,
			// Labels are empty until microphone permission has been granted at
			// least once; a truncated id is still better than a blank row.
			label: device.label || localize('dictation.onboarding.unknownDevice', "Unknown device ({0})", device.deviceId.slice(0, 8)),
		});
	}

	return options;
}

/**
 * Index of the microphone currently in use. Falls back to the system default
 * when the remembered device has been unplugged, which is exactly what dictation
 * itself does when it acquires the stream.
 */
export function indexOfMicrophone(options: readonly IMicrophoneOption[], deviceId: string): number {
	const index = options.findIndex(option => option.deviceId === deviceId);
	return index === -1 ? 0 : index;
}

// --- Banner --------------------------------------------------------------

/**
 * How long the card waits before dictation takes over.
 *
 * Load-bearing rather than cosmetic: the preview microphone is released at the
 * start of it, and the audio service needs a moment to actually hand the device
 * over before dictation asks for it.
 */
const HANDOFF_DELAY_MS = 300;

export interface IDictationOnboardingBannerOptions {
	/** The element the card attaches itself to. */
	readonly container: HTMLElement;
	/** Dismiss the card without dictating (Escape). */
	readonly onCancel: () => void;
	/** Dismiss the card and start the dictation it deferred. */
	readonly onStartDictation: () => void;
	readonly source: 'automatic' | 'manual';
}

/**
 * The first-run dictation card: which microphone dictation will use, live proof
 * that it is working, and one line on what dictation is.
 *
 * The card takes over the very first dictation rather than running alongside it,
 * because "is my microphone even connected" cannot be answered while words are
 * already being transcribed. Nothing is recorded while it is up: talking here
 * only moves the waveform, and dictation starts when the user says it should.
 */
export class DictationOnboardingBanner extends Disposable {

	readonly domNode: HTMLElement;

	private readonly card: ChatInputOnboardingCard;
	private readonly preview: MicrophonePreview;
	private readonly waveform: MicrophoneWaveform;
	private readonly hint: HTMLElement;
	private readonly pickerContainer: HTMLElement;

	private readonly picker = this._register(new MutableDisposable<DisposableStore>());
	private readonly handoff = this._register(new MutableDisposable<IDisposable>());
	private options: IMicrophoneOption[] = [];
	private finished = false;

	constructor(
		private readonly bannerOptions: IDictationOnboardingBannerOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.card = this._register(new ChatInputOnboardingCard({
			container: bannerOptions.container,
			className: 'dictation-onboarding-banner',
			ariaLabel: localize('dictation.onboarding.region', "Dictation introduction"),
			// Sighted users get this from the waveform moving as they talk. A
			// screen-reader user has no waveform to watch, so the card has to say
			// what it is for and how to leave it.
			ariaDescription: localize('dictation.onboarding.regionDescription', "Say anything to check your microphone, then start dictating."),
			onEscape: () => this.cancel(),
		}));
		this.domNode = this.card.domNode;

		const header = dom.append(this.domNode, dom.$('.dictation-onboarding-header'));
		const title = dom.append(header, dom.$('.dictation-onboarding-title'));
		title.textContent = localize('dictation.onboarding.title', "Dictation");
		this.renderDescription(header);

		// The device and its level are one group: the bars are *this* microphone's
		// level, and separating them would leave the meter reading as decoration.
		const device = dom.append(this.domNode, dom.$('.dictation-onboarding-device'));
		this.pickerContainer = dom.append(device, dom.$('.dictation-onboarding-picker'));
		const waveformContainer = dom.append(device, dom.$('.dictation-onboarding-waveform'));

		this.preview = this._register(instantiationService.createInstance(MicrophonePreview, this.domNode));
		this.waveform = this._register(instantiationService.createInstance(MicrophoneWaveform, waveformContainer, {
			getLevel: () => this.preview.getLevel(),
			isAvailable: () => this.preview.error === undefined,
		}, undefined));
		this._register(this.preview.onDidChangeError(() => this.updateHint()));

		this.hint = dom.append(this.domNode, dom.$('.dictation-onboarding-hint'));
		// The hint only appears when the microphone cannot be read, which can
		// happen well after the card is opened, so it has to reach a screen
		// reader as it changes rather than only on focus.
		this.hint.setAttribute('aria-live', 'polite');
		this.updateHint();

		this.renderClose();

		// Paint the row before the microphone is up. Enumerating devices means
		// waiting on the OS, and an empty row that fills in a second later reads
		// as the card still loading; the system default is true no matter what
		// comes back, so the row can start there and refine itself.
		this.options = [{
			deviceId: SYSTEM_DEFAULT_DEVICE_ID,
			label: localize('dictation.onboarding.systemDefault', "System default"),
		}];
		this.renderPicker();

		const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
		if (mediaDevices) {
			this._register(dom.addDisposableListener(mediaDevices, 'devicechange', () => void this.refreshDevices()));
		}

		this.waveform.start();
		void this.startPreview();
		this.logAction('shown');
	}

	/**
	 * What dictation is, and that none of it is fixed. The card is shown once, so
	 * the two things a user might want to change afterwards - whether dictation
	 * runs at all, and how it writes what they say - have to be reachable from
	 * here rather than left to a command nobody knows to look for.
	 *
	 * `[[...]]` marks the clauses that become links, so translators can keep the
	 * sentence natural instead of having fixed phrases concatenated on.
	 */
	private renderDescription(container: HTMLElement): void {
		const description = dom.append(container, dom.$('.dictation-onboarding-description'));
		const text = localize({
			key: 'dictation.onboarding.description',
			comment: ['Preserve the double square brackets: they mark the text that becomes a link. Keep both links, in this order - the first opens settings, the second opens the customization file.'],
		}, "Speak and it becomes text. Adjust [[settings]] or [[how it's written]] any time.");

		dom.append(description, renderFormattedText(text, {
			actionHandler: {
				// The handler is given the link's index, so the two are told apart
				// by position - hence the ordering note to translators above.
				callback: index => {
					const [commandId, ...args] = index === '0'
						? [OPEN_SETTINGS_COMMAND, { query: DICTATION_SETTINGS_QUERY }]
						: [CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID];
					this.logAction(index === '0' ? 'openSettings' : 'openInstructions');
					this.commandService.executeCommand(commandId as string, ...args)
						.catch(error => this.logService.error(`[chat-stt] failed to open dictation customization: ${error}`));
				},
				disposables: this._store,
			},
		}, dom.$('span')));

		// `renderFormattedText` gives each anchor a click listener and nothing
		// else, so make them real controls: reachable by Tab and operable by
		// Enter or Space like any other button. The renderer owns this DOM, so a
		// selector is the only handle on it.
		// eslint-disable-next-line no-restricted-syntax
		for (const link of description.querySelectorAll('a')) {
			link.tabIndex = 0;
			link.setAttribute('role', 'button');
			this._register(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
					keyboardEvent.preventDefault();
					link.click();
				}
			}));
		}
	}

	/**
	 * Bring the card to life. The device list and the microphone are started
	 * together rather than in sequence: `getUserMedia` can take a second or more
	 * to return, and waiting for it would leave the picker empty for that whole
	 * time. Enumeration is repeated once the microphone is live, because device
	 * labels stay blank until permission has been granted at least once.
	 */
	private async startPreview(): Promise<void> {
		const listening = this.preview.listen(this.currentDeviceId());
		await Promise.all([listening, this.refreshDevices()]);
		await this.refreshDevices();
	}

	private currentDeviceId(): string {
		return this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, SYSTEM_DEFAULT_DEVICE_ID);
	}

	private async refreshDevices(): Promise<void> {
		const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
		if (!mediaDevices?.enumerateDevices) {
			return;
		}

		let devices: MediaDeviceInfo[];
		try {
			devices = await mediaDevices.enumerateDevices();
		} catch (error) {
			this.logService.trace(`[chat-stt] could not enumerate microphones: ${error}`);
			return;
		}

		if (this._store.isDisposed) {
			return;
		}

		const options = buildMicrophoneOptions(devices);
		// Before permission is granted the browser reports the devices but not
		// their names. Re-rendering a list of "Unknown device" rows and then
		// swapping in the real names a moment later is worse than waiting: keep
		// the row as it is until there is something worth showing.
		if (this.options.length > 1 && !options.some(option => option.deviceId && option.label)) {
			return;
		}

		this.options = options;
		this.renderPicker();
	}

	/**
	 * A picker with one entry is not a choice - it is a label that happens to
	 * open a menu. With a single microphone the card just names it.
	 */
	private renderPicker(): void {
		this.picker.clear();
		dom.clearNode(this.pickerContainer);

		dom.append(this.pickerContainer, dom.$(`span.codicon.codicon-${Codicon.mic.id}.dictation-onboarding-picker-icon`))
			.setAttribute('aria-hidden', 'true');

		const selected = indexOfMicrophone(this.options, this.currentDeviceId());

		if (this.options.length <= 1) {
			const label = dom.append(this.pickerContainer, dom.$('span.dictation-onboarding-picker-label'));
			label.textContent = this.options[selected]?.label ?? localize('dictation.onboarding.noMicrophone', "No microphone found");
			label.title = label.textContent;
			return;
		}

		const store = new DisposableStore();
		// Custom-drawn rather than the platform control, and with the face colors
		// blanked so the row inherits the card instead of carrying the platform's
		// select chrome - that fill is exactly what this row should not have at
		// rest. The dropdown keeps its own colors, so only the face changes.
		const selectBox = store.add(new SelectBox(
			this.options.map(option => ({ text: option.label })),
			selected,
			this.contextViewService,
			{ ...defaultSelectBoxStyles, selectBackground: undefined, selectBorder: undefined, selectForeground: undefined },
			{ ariaLabel: localize('dictation.onboarding.microphone', "Microphone"), useCustomDrawn: true },
		));
		selectBox.render(this.pickerContainer);
		store.add(selectBox.onDidSelect(event => this.selectMicrophone(event.index)));
		this.picker.value = store;
	}

	private selectMicrophone(index: number): void {
		const option = this.options[index];
		if (!option) {
			return;
		}
		this.logAction('selectMicrophone');

		// Shared with Voice Mode and with the "Select Microphone" quick pick, so
		// the choice made here is the one dictation actually records from.
		if (option.deviceId) {
			this.storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, option.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
		}

		status(localize('dictation.onboarding.microphoneSelected', "{0} selected.", option.label));
		void this.preview.listen(option.deviceId).then(() => this.updateHint());
	}

	/**
	 * The hint only speaks when the microphone cannot be read. At rest the
	 * moving waveform is the instruction - a line of text telling you to talk is
	 * one the card can do without.
	 */
	private updateHint(): void {
		if (this.finished) {
			return;
		}
		const error = this.preview.error;
		this.domNode.classList.toggle('has-error', error !== undefined);
		this.hint.textContent = error === undefined ? '' : hintForError(error);
	}

	/**
	 * The one control that starts dictation. A check rather than a cross:
	 * leaving this card is a confirmation that the microphone is right, not an
	 * abandonment.
	 *
	 * Pinned to the corner and out of the content flow, so it never competes
	 * with the picker for room and never moves as the card re-flows.
	 */
	private renderClose(): void {
		this.card.addAction({
			className: 'dictation-onboarding-close',
			ariaLabel: localize('dictation.onboarding.close', "Start Dictating"),
			icon: Codicon.check,
			onActivate: () => this.finish(),
		});
	}

	/**
	 * Hand the session over to real dictation, at the user's word rather than on
	 * a guess about what they meant by talking.
	 *
	 * The preview microphone is released first and the hand-off is deferred by a
	 * beat: dictation would otherwise be asking the audio service for a device
	 * the card has not finished giving back.
	 */
	private finish(): void {
		if (this.finished) {
			return;
		}
		this.finished = true;
		this.logAction('startDictation');
		this.waveform.stop();
		this.preview.releaseMicrophone();

		this.domNode.classList.remove('has-error');
		this.domNode.classList.add('handing-off');
		// Announced rather than shown: the card is on its way out, so a line of
		// text nobody has time to read would only be noise. A screen reader has
		// no waveform to watch and does need telling.
		status(localize('dictation.onboarding.starting', "Starting dictation…"));

		this.handoff.value = disposableTimeout(() => this.bannerOptions.onStartDictation(), HANDOFF_DELAY_MS);
	}

	/** Escape means "I did not want to dictate after all". */
	private cancel(): void {
		if (this.finished) {
			return;
		}
		this.finished = true;
		this.logAction('cancel');
		this.waveform.stop();
		this.preview.releaseMicrophone();
		this.bannerOptions.onCancel();
	}

	private logAction(action: DictationOnboardingAction): void {
		this.telemetryService.publicLog2<DictationOnboardingActionEvent, DictationOnboardingActionClassification>(
			'dictationOnboarding.action',
			{ action, source: this.bannerOptions.source }
		);
	}
}

function hintForError(error: MicrophonePreviewError): string {
	switch (error) {
		case MicrophonePreviewError.Denied:
			return localize('dictation.onboarding.denied', "No microphone access. Check your system privacy settings.");
		case MicrophonePreviewError.NoDevice:
			return localize('dictation.onboarding.noDevice', "No microphone found.");
		default:
			return localize('dictation.onboarding.unavailable', "Can't read the microphone level.");
	}
}

// --- Service -------------------------------------------------------------

export const IDictationOnboardingService = createDecorator<IDictationOnboardingService>('dictationOnboardingService');

export interface IDictationOnboardingService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a container that can host the card (a chat input). The most
	 * recently focused host wins when the card is shown.
	 *
	 * @param container the element the card is appended to.
	 * @param focusRoot the element whose focus marks this host as the active one
	 * (typically the chat input part the container lives in).
	 */
	registerHost(container: HTMLElement, focusRoot: HTMLElement): IDisposable;

	/**
	 * Show the card in place of the user's first dictation. Returns `true` when
	 * it took the dictation over, in which case `startDictation` is called once
	 * the user confirms the card - and never called at all if they pressed
	 * Escape. Returns `false` when the card has been seen before or there is no
	 * chat input to dock it to, and the caller should just dictate.
	 */
	showIfNeeded(startDictation: () => void): boolean;

	/**
	 * Show the card again regardless of whether it has been seen, for the "Show
	 * Introduction" command. Returns `false` when there is no visible chat input
	 * to dock it to, so the caller can explain why nothing happened.
	 */
	show(startDictation?: () => void): boolean;
}

export class DictationOnboardingService extends Disposable implements IDictationOnboardingService {

	declare readonly _serviceBrand: undefined;

	private readonly onboarding: ChatInputOnboarding;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: DICTATION_INTRO_SHOWN_KEY,
			hostClass: 'has-dictation-onboarding',
		}));
	}

	registerHost(container: HTMLElement, focusRoot: HTMLElement): IDisposable {
		return this.onboarding.registerHost(container, focusRoot);
	}

	showIfNeeded(startDictation: () => void): boolean {
		return this.onboarding.showIfNeeded(context => this.createBanner(context.container, context.dismiss, 'automatic', startDictation));
	}

	show(startDictation?: () => void): boolean {
		return this.onboarding.show(context => this.createBanner(context.container, context.dismiss, 'manual', startDictation));
	}

	private createBanner(container: HTMLElement, dismiss: () => void, source: 'automatic' | 'manual', startDictation?: () => void): DictationOnboardingBanner {
		return this.instantiationService.createInstance(DictationOnboardingBanner, {
			container,
			onCancel: dismiss,
			onStartDictation: () => {
				dismiss();
				startDictation?.();
			},
			source,
		});
	}
}

registerSingleton(IDictationOnboardingService, DictationOnboardingService, InstantiationType.Delayed);
