/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';
import './media/dictationOnboarding.css';

/**
 * Marks the introduction as seen. Dictation-scoped and deliberately separate
 * from the Voice Mode introduction, so neither feature's card suppresses the
 * other's.
 */
const DICTATION_INTRO_SHOWN_KEY = 'chat.dictation.introShown';

/** Setting that enables Voice Mode; decides which half of the copy is shown. */
const VOICE_MODE_ENABLED_SETTING = 'agents.voice.enabled';

/** The `deviceId` value that means "whatever the system is using". */
const SYSTEM_DEFAULT_DEVICE_ID = '';

// --- Level meter ---------------------------------------------------------

/**
 * Bars in the visualizer. Thin strokes rather than blocks, and enough of them
 * that the row reads as a waveform - at the ~250px the chat panel routinely
 * gives us, this lands each bar on a hairline with a hairline of air beside it.
 */
const BAR_COUNT = 42;

/**
 * The band the bars cover, as a fraction of the spectrum. Speech fundamentals
 * and the harmonics that carry it sit under ~6kHz; mapping the full range would
 * spend three quarters of the row on frequencies a voice never reaches.
 */
const VOICE_SPECTRUM_FRACTION = 0.25;

/**
 * Lowest bin the bars read from. Bin 0 carries the DC offset and bin 1 the
 * room rumble under the voice band; mapped straight onto the row they park the
 * first bar at full height and make a silent microphone look like a loud one.
 */
const FIRST_VOICE_BIN = 3;

/**
 * The dB window the bars are mapped across.
 *
 * `getByteFrequencyData` normalizes against these, and the Web Audio defaults
 * (-100 to -30) are far too generous for this job: near-silence still lands
 * around a third of the range, so a quiet room renders as a lively meter. Anchor
 * the floor just under a quiet room and the ceiling at conversational speech, and
 * the bars mean what they look like.
 */
const MIN_DECIBELS = -70;
const MAX_DECIBELS = -25;

/**
 * Magnitude below which a band is treated as silence. With the window above
 * doing most of the work this only has to catch the last of the room tone.
 */
const NOISE_FLOOR = 0.1;

/**
 * Curve applied to the magnitude. Below 1 it lifts the quiet end, so normal
 * speech uses most of the row instead of the bottom third of it.
 */
const RESPONSE_GAMMA = 0.75;

/** How quickly a bar falls back after a peak. Slow enough to read as motion. */
const BAR_DECAY = 0.22;

/**
 * Shortest gap between repaints when reduced motion is on. The meter is
 * feedback, not decoration - switching it off would remove the only answer the
 * card has to "is my microphone working" - so it is slowed to a readable step
 * rather than stopped.
 */
const REDUCED_MOTION_PAINT_INTERVAL_MS = 100;

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
	private spectrum: Uint8Array<ArrayBuffer> | undefined;

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
	 * Magnitude of `bar` of `barCount` across the speech range, `0..1`. Driving
	 * the bars from the spectrum rather than from one shared level is what makes
	 * the row move like a voice instead of a single block pumping up and down.
	 */
	getBandMagnitude(bar: number, barCount: number): number {
		if (!this.analyser || !this.spectrum) {
			return 0;
		}
		if (bar === 0) {
			this.analyser.getByteFrequencyData(this.spectrum);
		}

		// Bands are spaced logarithmically, the way hearing is. Spaced linearly,
		// a voice piles into the first few bars - its fundamental and first
		// harmonics are all in the bottom bins - and leaves the rest of the row
		// dead no matter how loudly anyone talks.
		const topBin = Math.max(FIRST_VOICE_BIN + 1, Math.floor(this.spectrum.length * VOICE_SPECTRUM_FRACTION));
		const ratio = topBin / FIRST_VOICE_BIN;
		const from = Math.floor(FIRST_VOICE_BIN * ratio ** (bar / barCount));
		const to = Math.max(from + 1, Math.floor(FIRST_VOICE_BIN * ratio ** ((bar + 1) / barCount)));

		let sum = 0;
		for (let i = from; i < to && i < this.spectrum.length; i++) {
			sum += this.spectrum[i];
		}
		const raw = sum / (to - from) / 255;

		// Speech energy still falls off towards the top of the band, so a gentle
		// tilt keeps the right-hand bars in play rather than leaving them flat.
		const tilt = 0.85 + 0.75 * (bar / Math.max(1, barCount - 1));
		const gated = Math.max(0, raw * tilt - NOISE_FLOOR) / (1 - NOISE_FLOOR);
		return Math.min(1, gated ** RESPONSE_GAMMA);
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
			// Enough bins to give every one of the thin bars its own slice of the
			// spectrum once the logarithmic mapping has spread them out.
			analyser.fftSize = 1024;
			analyser.minDecibels = MIN_DECIBELS;
			analyser.maxDecibels = MAX_DECIBELS;
			// Some smoothing in the graph itself, so the per-bar easing below only
			// has to take the edge off rather than carry the whole illusion.
			analyser.smoothingTimeConstant = 0.6;
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
		this.spectrum = new Uint8Array(analyser.frequencyBinCount);
		this.setError(undefined);
	}

	/**
	 * Hand the microphone back. Called before dictation acquires its own stream:
	 * two captures of one device is what makes the audio service drop the
	 * capture, so the preview always lets go first.
	 */
	releaseMicrophone(): void {
		this.analyser = undefined;
		this.spectrum = undefined;
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

/** What the spectrum needs each frame, supplied by the preview. */
interface ISpectrumSource {
	getBandMagnitude(bar: number, barCount: number): number;
}

/**
 * The live spectrum. Bars are driven by the microphone's own frequency content,
 * so the card answers "is this device hearing me" the way a voice UI should - by
 * moving like a voice.
 */
class MicrophoneSpectrum extends Disposable {

	private readonly bars: HTMLElement[] = [];
	private readonly levels: number[] = [];
	private readonly animationFrame = this._register(new MutableDisposable<IDisposable>());

	private running = false;
	private lastPaint = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly source: ISpectrumSource,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		container.setAttribute('aria-hidden', 'true');
		for (let i = 0; i < BAR_COUNT; i++) {
			this.bars.push(dom.append(container, dom.$('span.dictation-onboarding-bar')));
			this.levels.push(0);
		}

		this._register(toDisposable(() => this.stop()));
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
			this.update(Date.now());
			this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
		};
		this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
	}

	stop(): void {
		this.running = false;
		this.animationFrame.clear();
	}

	private update(now: number): void {
		const interval = this.accessibilityService.isMotionReduced() ? REDUCED_MOTION_PAINT_INTERVAL_MS : 0;
		if (now - this.lastPaint < interval) {
			return;
		}
		this.lastPaint = now;

		for (let i = 0; i < this.bars.length; i++) {
			const target = this.source.getBandMagnitude(i, this.bars.length);
			// Rise instantly, fall gently: a bar that drops as fast as it climbs
			// reads as flicker rather than as level.
			this.levels[i] = target > this.levels[i] ? target : this.levels[i] + (target - this.levels[i]) * BAR_DECAY;
			// Scaled rather than resized: transform stays off the layout path, so
			// a row of hairlines at 60fps never reflows the chat input. The
			// resting scale leaves a thin line rather than nothing, so a silent
			// microphone still reads as present.
			this.bars[i].style.transform = `scaleY(${(0.08 + this.levels[i] * 0.92).toFixed(3)})`;
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

	readonly domNode = dom.$('.dictation-onboarding-banner');

	private readonly preview: MicrophonePreview;
	private readonly spectrum: MicrophoneSpectrum;
	private readonly hint: HTMLElement;
	private readonly pickerContainer: HTMLElement;

	private readonly picker = this._register(new MutableDisposable<DisposableStore>());
	private readonly handoff = this._register(new MutableDisposable<IDisposable>());
	private options: IMicrophoneOption[] = [];
	private finished = false;

	constructor(
		private readonly bannerOptions: IDictationOnboardingBannerOptions,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Attach up front: the Agents window is an auxiliary window, so anything
		// window-bound below (`AudioContext`, `navigator.mediaDevices`) has to
		// resolve against the document the card actually lives in.
		bannerOptions.container.appendChild(this.domNode);
		this._register(toDisposable(() => this.domNode.remove()));

		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', localize('dictation.onboarding.region', "Dictation introduction"));
		// Sighted users get this from the waveform moving as they talk. A
		// screen-reader user has no waveform to watch, so the card has to say
		// what it is for and how to leave it.
		this.domNode.setAttribute('aria-description', localize('dictation.onboarding.regionDescription', "Say anything to check your microphone, then start dictating."));

		const header = dom.append(this.domNode, dom.$('.dictation-onboarding-header'));
		const title = dom.append(header, dom.$('.dictation-onboarding-title'));
		title.textContent = localize('dictation.onboarding.title', "Dictation");
		const description = dom.append(header, dom.$('.dictation-onboarding-description'));
		description.textContent = this.getDescription();

		// The device and its level are one group: the bars are *this* microphone's
		// level, and separating them would leave the meter reading as decoration.
		const device = dom.append(this.domNode, dom.$('.dictation-onboarding-device'));
		this.pickerContainer = dom.append(device, dom.$('.dictation-onboarding-picker'));
		const spectrumContainer = dom.append(device, dom.$('.dictation-onboarding-spectrum'));

		this.preview = this._register(instantiationService.createInstance(MicrophonePreview, this.domNode));
		this.spectrum = this._register(instantiationService.createInstance(MicrophoneSpectrum, spectrumContainer, {
			getBandMagnitude: (bar, count) => this.preview.getBandMagnitude(bar, count),
		}));
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

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				dom.EventHelper.stop(event, true);
				this.cancel();
			}
		}));

		const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
		if (mediaDevices) {
			this._register(dom.addDisposableListener(mediaDevices, 'devicechange', () => void this.refreshDevices()));
		}

		this.spectrum.start();
		void this.startPreview();
	}

	/**
	 * What dictation is, in one line. When Voice Mode is available the sentence
	 * also has to say what dictation is *not*, because the two share a microphone
	 * button and are otherwise easy to confuse.
	 */
	private getDescription(): string {
		return this.configurationService.getValue<boolean>(VOICE_MODE_ENABLED_SETTING) === true
			? localize('dictation.onboarding.descriptionWithVoiceMode', "Speak and it becomes text. Voice Mode is for conversation.")
			: localize('dictation.onboarding.description', "Speak and it becomes text.");
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
		const close = dom.append(this.domNode, dom.$('.dictation-onboarding-close'));
		close.tabIndex = 0;
		close.setAttribute('role', 'button');
		close.setAttribute('aria-label', localize('dictation.onboarding.close', "Start Dictating"));
		dom.append(close, dom.$(`span.codicon.codicon-${Codicon.check.id}`)).setAttribute('aria-hidden', 'true');
		this._register(dom.addDisposableListener(close, dom.EventType.CLICK, () => this.finish()));
		this._register(dom.addDisposableListener(close, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				keyboardEvent.preventDefault();
				this.finish();
			}
		}));
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
		this.spectrum.stop();
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
		this.spectrum.stop();
		this.preview.releaseMicrophone();
		this.bannerOptions.onCancel();
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

interface IHost {
	readonly container: HTMLElement;
	readonly focusRoot: HTMLElement;
	lastFocused: number;
}

export class DictationOnboardingService extends Disposable implements IDictationOnboardingService {

	declare readonly _serviceBrand: undefined;

	private readonly hosts = new Set<IHost>();
	private readonly banner = this._register(new MutableDisposable<DisposableStore>());
	private bannerHost: IHost | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	registerHost(container: HTMLElement, focusRoot: HTMLElement): IDisposable {
		const host: IHost = { container, focusRoot, lastFocused: 0 };
		this.hosts.add(host);

		const store = new DisposableStore();
		const focusTracker = store.add(dom.trackFocus(focusRoot));
		store.add(focusTracker.onDidFocus(() => host.lastFocused = Date.now()));
		store.add(toDisposable(() => {
			this.hosts.delete(host);
			if (this.bannerHost === host) {
				this.hide();
			}
		}));
		return store;
	}

	showIfNeeded(startDictation: () => void): boolean {
		if (this.storageService.getBoolean(DICTATION_INTRO_SHOWN_KEY, StorageScope.APPLICATION, false)) {
			return false;
		}
		return this.show(startDictation);
	}

	show(startDictation?: () => void): boolean {
		const host = this.pickHost();
		if (!host) {
			return false;
		}

		this.storageService.store(DICTATION_INTRO_SHOWN_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);

		// Tear the previous card down *first*. Assigning to the `MutableDisposable`
		// below would otherwise dispose it afterwards, and its disposer strips the
		// very class this one just added - leaving the new card invisible.
		this.hide();

		const store = new DisposableStore();
		host.container.classList.add('has-dictation-onboarding');
		store.add(toDisposable(() => host.container.classList.remove('has-dictation-onboarding')));
		store.add(this.instantiationService.createInstance(DictationOnboardingBanner, {
			container: host.container,
			onCancel: () => this.hide(),
			onStartDictation: () => {
				this.hide();
				startDictation?.();
			},
		}));

		this.bannerHost = host;
		this.banner.value = store;
		return true;
	}

	/**
	 * The visible host that was focused most recently - i.e. the chat input the
	 * user just pressed the mic in. Falls back to any visible host so a
	 * command-palette invocation still gets the card.
	 */
	private pickHost(): IHost | undefined {
		let best: IHost | undefined;
		for (const host of this.hosts) {
			if (!host.container.isConnected || host.focusRoot.getClientRects().length === 0) {
				continue;
			}
			if (!best || host.lastFocused > best.lastFocused) {
				best = host;
			}
		}
		return best;
	}

	private hide(): void {
		this.bannerHost = undefined;
		this.banner.clear();
	}
}

registerSingleton(IDictationOnboardingService, DictationOnboardingService, InstantiationType.Delayed);
