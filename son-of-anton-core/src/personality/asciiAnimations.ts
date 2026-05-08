/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable } from '../host';
import { staticArt } from './asciiArt';

/**
 * Frame-based ASCII animations for output channels and terminals.
 *
 * Each animation is a list of frames plus a frame rate. The
 * `playOnOutputChannel` helper schedules a timer that clears the channel
 * and re-prints the next frame at the configured cadence, returning a
 * disposable that stops the timer (and stops re-emitting frames).
 *
 * All frames are pure ASCII -- see asciiArt.ts for the rationale.
 */

export type AnimationName =
	| 'pipedPiperLoading'
	| 'compressionRunning'
	| 'hooHooHoo'
	| 'skynetAwake'
	| 'tabsVsSpaces';

export interface AsciiAnimation {
	readonly name: string;
	readonly frames: ReadonlyArray<string>;
	readonly frameMs: number;
	readonly loop: boolean;
}

/**
 * Minimal structural type for an output sink that supports clear-and-print
 * style animation. `vscode.OutputChannel` satisfies this shape so the
 * extension can pass one in directly without an adapter.
 */
export interface OutputSink {
	clear(): void;
	appendLine(value: string): void;
}

// --- pipedPiperLoading ---------------------------------------------------
//
// 8 frames of the Pied Piper "P" rotating/morphing. Built from the spinner
// frames in asciiArt plus a couple of intermediate states so the eye sees
// continuous motion at 150ms cadence.

const PIPED_PIPER_LOADING: AsciiAnimation = {
	name: 'pipedPiperLoading',
	frameMs: 150,
	loop: true,
	frames: [
		staticArt.spinnerFrame1,
		staticArt.spinnerFrame2,
		staticArt.spinnerFrame3,
		staticArt.spinnerFrame4,
		staticArt.spinnerFrame1,
		staticArt.spinnerFrame3,
		staticArt.spinnerFrame2,
		staticArt.spinnerFrame4,
	],
};

// --- compressionRunning --------------------------------------------------
//
// 12 frames of a moving "compression head" passing rightward through a
// data buffer, with the buffer shrinking as the head moves -- intended to
// suggest middle-out compression in progress.

const COMPRESSION_RUNNING_FRAMES: ReadonlyArray<string> = [
	'[==>                                ] compressing...',
	'[ ==>                               ] compressing...',
	'[  ==>                              ] compressing...',
	'[   ===>                            ] compressing...',
	'[    ====>                          ] compressing...',
	'[      ====>                        ] compressing...',
	'[        ====>                      ] compressing...',
	'[           ====>                   ] compressing...',
	'[              ====>                ] compressing...',
	'[                  ====>            ] compressing...',
	'[                       ====>       ] compressing...',
	'[                            ======>] middle out!',
];

const COMPRESSION_RUNNING: AsciiAnimation = {
	name: 'compressionRunning',
	frameMs: 120,
	loop: false,
	frames: COMPRESSION_RUNNING_FRAMES,
};

// --- hooHooHoo -----------------------------------------------------------
//
// Three mouth shapes (closed, half-open, full "Hoo"). Played four times to
// match Erlich's distinctive battle cry.

const HOO_FACE_CLOSED = [
	'    .-----.    ',
	'   ( o   o )   ',
	'    \\  -  /    ',
	'     `---`     ',
	'               ',
].join('\n');

const HOO_FACE_HALF = [
	'    .-----.    ',
	'   ( O   O )   ',
	'    \\ ___ /    ',
	'     | o |     ',
	'     `---`     ',
].join('\n');

const HOO_FACE_FULL = [
	'    .-----.    ',
	'   ( O   O )   ',
	'    \\ ___ /    ',
	'    | OOO |    ',
	'    `--V--`    ',
].join('\n');

const HOO_TEXT = [
	HOO_FACE_FULL + '\n   HOO!',
	HOO_FACE_HALF + '\n   HOO!',
	HOO_FACE_CLOSED + '\n        ',
];

const HOO_HOO_HOO_FRAMES: string[] = [];
for (let i = 0; i < 4; i++) {
	HOO_HOO_HOO_FRAMES.push(...HOO_TEXT);
}

const HOO_HOO_HOO: AsciiAnimation = {
	name: 'hooHooHoo',
	frameMs: 220,
	loop: false,
	frames: HOO_HOO_HOO_FRAMES,
};

// --- skynetAwake ---------------------------------------------------------
//
// Closed eye -> slit -> open -> open with red dot text -- a slow build for
// the "Son of Anton went rogue" failure mode.

const SKYNET_CLOSED = [
	'        _________________        ',
	'       /                 \\       ',
	'      /                   \\      ',
	'     |   _______________   |     ',
	'     |                     |     ',
	'     |   _______________   |     ',
	'      \\                   /      ',
	'       \\_________________/       ',
	'                                 ',
].join('\n');

const SKYNET_SLIT = [
	'        _________________        ',
	'       /                 \\       ',
	'      /   .-----------.   \\      ',
	'     |   |             |   |     ',
	'     |   | -----*----- |   |     ',
	'     |   |             |   |     ',
	'     |    `-----------`    |     ',
	'      \\                   /      ',
	'       \\_________________/       ',
].join('\n');

const SKYNET_OPEN = [
	'        _________________        ',
	'       /                 \\       ',
	'      /   .-----------.   \\      ',
	'     |   /   _____     \\   |     ',
	'     |  |   /     \\     |  |     ',
	'     |  |  |   *   |    |  |     ',
	'     |  |   \\_____/     |  |     ',
	'     |   \\___________/     |     ',
	'      \\                   /      ',
].join('\n');

const SKYNET_AWAKE: AsciiAnimation = {
	name: 'skynetAwake',
	frameMs: 400,
	loop: false,
	frames: [
		SKYNET_CLOSED,
		SKYNET_CLOSED,
		SKYNET_SLIT,
		SKYNET_SLIT,
		SKYNET_OPEN,
		SKYNET_OPEN + '\n    [SON OF ANTON v2.0 ONLINE]',
		staticArt.skynetEye,
		staticArt.skynetEye + '\n    ALL HUMAN INPUTS ARE NOISE',
	],
};

// --- tabsVsSpaces --------------------------------------------------------
//
// Typewriter the word "TABS", then dramatically cross out "spaces" with
// progressively-more-emphatic strikethroughs.

const TABS_VS_SPACES: AsciiAnimation = {
	name: 'tabsVsSpaces',
	frameMs: 180,
	loop: false,
	frames: [
		'',
		'T',
		'TA',
		'TAB',
		'TABS',
		'TABS',
		'TABS    spaces',
		'TABS    spaces',
		'TABS    s-aces',
		'TABS    s---es',
		'TABS    s-----',
		'TABS    ------',
		'TABS    XXXXXX',
		'TABS    XXXXXX     -- approved --',
	],
};

const ANIMATIONS: Record<AnimationName, AsciiAnimation> = {
	pipedPiperLoading: PIPED_PIPER_LOADING,
	compressionRunning: COMPRESSION_RUNNING,
	hooHooHoo: HOO_HOO_HOO,
	skynetAwake: SKYNET_AWAKE,
	tabsVsSpaces: TABS_VS_SPACES,
};

/**
 * Read-only access to the animation catalogue.
 */
export { ANIMATIONS };

/**
 * Returns the animation with the given name.
 */
export function getAnimation(name: AnimationName): AsciiAnimation {
	return ANIMATIONS[name];
}

/**
 * Plays an animation by repeatedly clearing and re-printing frames on the
 * given output sink. Returns a disposable that cancels the timer; the
 * caller can use it to stop a long-running loop animation, or just let it
 * run to completion if `loop === false`.
 *
 * `iterations` (default `1` for non-looping animations, `Infinity` for
 * looping ones) caps how many times the frame sequence repeats. Setting
 * `iterations` on a non-looping animation overrides its default loop count.
 */
export function playOnOutputChannel(
	channel: OutputSink,
	animation: AsciiAnimation,
	options?: { iterations?: number },
): Disposable {
	const totalIterations = options?.iterations ?? (animation.loop ? Number.POSITIVE_INFINITY : 1);
	let frameIndex = 0;
	let iterationsCompleted = 0;
	let stopped = false;

	const renderNext = (): void => {
		if (stopped) {
			return;
		}
		if (iterationsCompleted >= totalIterations) {
			stopped = true;
			return;
		}

		const frame = animation.frames[frameIndex];
		channel.clear();
		channel.appendLine(frame);

		frameIndex++;
		if (frameIndex >= animation.frames.length) {
			frameIndex = 0;
			iterationsCompleted++;
		}

		if (iterationsCompleted < totalIterations) {
			timer = setTimeout(renderNext, animation.frameMs);
		} else {
			stopped = true;
		}
	};

	let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(renderNext, 0);

	return {
		dispose: (): void => {
			stopped = true;
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}
