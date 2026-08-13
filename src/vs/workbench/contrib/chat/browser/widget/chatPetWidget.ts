/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPet.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { autorun, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ChatPetVariant, IChatPetService } from '../chatPetService.js';

export type ChatPetState = 'idle' | 'sleep' | 'waking' | 'typing' | 'rendering' | 'buttonPress' | 'complete' | 'love' | 'clapping' | 'jump' | 'cool' | 'yapping' | 'yappingMouthOpen' | 'sing' | 'speechless' | 'worry' | 'dizzy' | 'falling' | 'wallImpact' | 'splat' | 'onTheRun' | 'searching' | 'searchingDown';
export type ChatPetClickInteraction = Extract<ChatPetState, 'buttonPress' | 'complete' | 'love' | 'cool' | 'yapping' | 'sing' | 'speechless' | 'worry'>;

export const CHAT_PET_IDLE_SLEEP_DELAY = 20_000;
export const CHAT_PET_CONFIRMATION_ATTENTION_DURATION = 2_000;
export const CHAT_PET_ICON_TRANSFORMATION_CHANCE = 1 / 100;
export const CHAT_PET_YAPPING_CHANCE = 1 / 100;
const TRANSIENT_STATE_DURATION = 2_000;
const COMPLETE_STATE_DURATION = 960;
const BUTTON_PRESS_STATE_DURATION = 2_850;
const SPLAT_STATE_DURATION = 520;
const LOVE_STATE_DURATION = 2_940;
const COOL_STATE_DURATION = 3_000;
const SING_STATE_DURATION = 2_880;
const SPEECHLESS_STATE_DURATION = 2_720;
const WORRY_STATE_DURATION = 2_400;
const DIZZY_STATE_DURATION = 2_200;
const WAKE_STATE_DURATION = 880;
const DIZZY_DIRECTION_CHANGE_COUNT = 8;
const DIZZY_DIRECTION_CHANGE_MAX_INTERVAL = 600;
const SEARCH_INTERVAL = 10_000;
const RESPAWN_EFFECT_DURATION = 800;
const RESPAWN_EFFECT_REDUCED_MOTION_DURATION = 400;
const DRAG_THRESHOLD = 2;
const HOP_DISTANCE = 24;
const HOP_APEX_DELAY = 300;
const HOP_REST_DELAY = 90;
const HOP_HOLD_GRACE = 350;
const HOP_IDLE_DEBOUNCE = 900;
const POSITION_EPSILON = 0.5;
const THROW_VELOCITY_SAMPLE_DURATION = 100;
const THROW_RELEASE_GRACE_DURATION = 80;
const THROW_MIN_HORIZONTAL_VELOCITY = 650;
const THROW_MIN_FLIGHT_VELOCITY = 1_000;
const THROW_MAX_HORIZONTAL_VELOCITY = 2_400;
const THROW_MIN_UPWARD_VELOCITY = 420;
const THROW_MAX_UPWARD_VELOCITY = 1_400;
const THROW_KEYBOARD_HORIZONTAL_VELOCITY = 1_400;
const THROW_GRAVITY = 1_800;
const THROW_MAX_FRAME_DURATION = 32;
const THROW_MAX_DURATION = 4_000;
const THROW_WALL_IMPACT_DURATION = 110;
const THROW_WALL_RESTITUTION = 0.1;
const THROW_WALL_REBOUND_VELOCITY = 120;
const THROW_CEILING_RESTITUTION = 0.2;
const THROW_ROTATION_PER_PIXEL = 0.65;
const CHAT_PET_SOURCE_SIZE = 96;
const CHAT_PET_SLEEP_SOURCE_WIDTH = 120;
const CHAT_PET_TYPING_SOURCE_WIDTH = 168;
const CHAT_PET_BUTTON_PRESS_SOURCE_WIDTH = 160;
const CHAT_PET_SING_SOURCE_WIDTH = 164;
const CHAT_PET_SING_SOURCE_HEIGHT = 124;
const CHAT_PET_DIZZY_SOURCE_HEIGHT = 128;
const CHAT_PET_MAX_VERTICAL_OFFSET = 10;
const CHAT_PET_DEFAULT_RIGHT_INSET = 32;
const CHAT_PET_MIN_SCALE = 0.4;
const CHAT_PET_SCALE_STEP = 0.2;
const CHAT_PET_SPEECH_BUBBLE_RIGHT_OVERHANG = 20;
const CHAT_PET_SLEEP_RIGHT_OVERHANG = (CHAT_PET_SLEEP_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const CHAT_PET_TYPING_RIGHT_OVERHANG = (CHAT_PET_TYPING_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const CHAT_PET_BUTTON_PRESS_RIGHT_OVERHANG = (CHAT_PET_BUTTON_PRESS_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const CHAT_PET_SING_RIGHT_OVERHANG = (CHAT_PET_SING_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;

const IDLE_FRAME_DURATIONS = Array.from({ length: 50 }, () => 40);
const SLEEP_FRAME_DURATIONS = Array.from({ length: 8 }, () => 300);
const WAKE_FRAME_DURATIONS = [160, 100, 80, 90, 90, 90, 100, 170];
const TYPING_FRAME_DURATIONS = [320, 480];
const BUTTON_PRESS_FRAME_DURATIONS = [500, 300, 350, 250, 450, 1_000];
const FALLING_FRAME_DURATIONS = [120, 80, 80, 120, 80, 80];
const JUMP_FRAME_DURATIONS = [70, 80, 90, 160, 100, 100];
const SPLAT_FRAME_DURATIONS = [120, 100, 100, 200];
const RESPAWN_FRAME_DURATIONS = [120, 100, 120, 240, 100, 120];
const SPEECH_FRAME_DURATIONS = [220, 220, 220, 100, 160, 180];
const CLAPPING_FRAME_DURATIONS = [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80];
const LOVE_FRAME_DURATIONS = [200, 200, 380, 100, 80, 1_980];
const COOL_FRAME_DURATIONS = [600, 120, 120, 120, 160, 80, 80, 80, 1_640];
const SING_FRAME_DURATIONS = [180, 180, 180, 180];
const SPEECHLESS_FRAME_DURATIONS = [400, 120, 1_000, 120, 1_080];
const WORRY_FRAME_DURATIONS = [600, 600];
const DIZZY_FRAME_DURATIONS = Array.from({ length: 8 }, () => 120);
const SEARCH_FRAME_DURATIONS = [500, 500, 500, 500];

interface ChatPetFixedOrientationDecoration {
	readonly frameBounds: readonly (readonly [number, number, number, number])[];
	readonly sourceFrame: number;
}

interface ChatPetSpriteSource {
	readonly url: string;
	readonly frameWidth: number;
	readonly frameHeight?: number;
	readonly fixedOrientationDecorations?: readonly ChatPetFixedOrientationDecoration[];
	readonly frameDurations: readonly number[];
	readonly iterations: number;
}

interface ChatPetSpriteSources {
	readonly animated: ChatPetSpriteSource;
	readonly reducedMotion: ChatPetSpriteSource;
}

interface ChatPetSpriteElement {
	readonly container: HTMLElement;
	readonly image: HTMLImageElement;
	readonly canvas: HTMLCanvasElement;
}

const CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS: readonly ChatPetFixedOrientationDecoration[] = [
	{
		frameBounds: [
			[16, 36, 80, 52],
			[16, 36, 80, 52],
			[16, 36, 80, 52],
			[16, 36, 80, 52],
		],
		sourceFrame: 0,
	},
	{
		frameBounds: [
			[96, 8, 160, 72],
			[96, 4, 160, 68],
			[100, 0, 164, 64],
			[92, 4, 156, 68],
		],
		sourceFrame: 0,
	},
];

interface ChatPetPointerSample {
	readonly x: number;
	readonly y: number;
	readonly time: number;
}

interface ChatPetThrowVelocity {
	readonly x: number;
	readonly y: number;
}

interface ChatPetThrowMotion extends ChatPetThrowVelocity {
	readonly left: number;
	readonly top: number;
}

type ChatPetWall = 'left' | 'right';

interface ChatPetThrowBounds {
	readonly minimumLeft: number;
	readonly maximumLeft: number;
	readonly minimumTop: number;
}

interface ChatPetThrowGeometry {
	readonly bounds: ChatPetThrowBounds;
	readonly displaySize: number;
	readonly overlayLeft: number;
	readonly overlayTop: number;
	readonly platformLeft: number;
	readonly platformRight: number;
	readonly platformTop: number;
	readonly floorTop: number;
}

interface ChatPetThrowStep extends ChatPetThrowMotion {
	readonly wall: ChatPetWall | undefined;
}

export function getChatPetBuddyName(quality: string | undefined): 'buddy-idle-stable' | 'buddy-idle-insiders' {
	return quality === 'stable' ? 'buddy-idle-stable' : 'buddy-idle-insiders';
}

const spriteSources = new Map<ChatPetVariant, Record<ChatPetState, ChatPetSpriteSources>>();
const speechSpriteSources = new Map<ChatPetVariant, ChatPetSpriteSources>();
const respawnSpriteSources = new Map<ChatPetVariant, ChatPetSpriteSources>();

export function doesChatPetStateTrackCursor(state: ChatPetState | undefined): boolean {
	return state !== undefined && state !== 'sleep' && state !== 'waking' && state !== 'typing' && state !== 'buttonPress' && state !== 'complete' && state !== 'jump' && state !== 'love' && state !== 'cool' && state !== 'yappingMouthOpen' && state !== 'sing' && state !== 'speechless' && state !== 'worry' && state !== 'dizzy' && state !== 'falling' && state !== 'wallImpact' && state !== 'splat' && state !== 'onTheRun' && state !== 'searching' && state !== 'searchingDown';
}

export function doesChatPetStateBlink(state: ChatPetState | undefined, frameIndex?: number): boolean {
	return (state === 'typing' || state === 'buttonPress' || state === 'love')
		&& (state !== 'buttonPress' || frameIndex !== BUTTON_PRESS_FRAME_DURATIONS.length - 1);
}

export function getChatPetSpriteName(state: ChatPetState, quality: string | undefined): string {
	const variant = quality === 'stable' ? 'stable' : 'insiders';
	switch (state) {
		case 'love':
			return `buddy-love-${variant}`;
		case 'clapping':
			return `buddy-clapping-${variant}`;
		case 'cool':
			return `buddy-cool-${variant}`;
		case 'buttonPress':
			return `buddy-press-button-${variant}`;
		case 'falling':
			return `buddy-falling-${variant}`;
		case 'jump':
			return `buddy-jump-${variant}`;
		case 'dizzy':
			return `buddy-dizzy-${variant}`;
		case 'wallImpact':
			return `buddy-wall-impact-${variant}`;
		case 'splat':
			return `buddy-splat-${variant}`;
		case 'onTheRun':
		case 'searching':
		case 'searchingDown':
			return `buddy-search-${variant}`;
		case 'sleep':
			return `buddy-sleep-${variant}`;
		case 'waking':
			return `buddy-waking-${variant}`;
		case 'typing':
			return `buddy-typing-${variant}`;
		case 'rendering':
			return `buddy-rendering-${variant}`;
		case 'yappingMouthOpen':
			return `buddy-yapping-${variant}`;
		case 'sing':
		case 'speechless':
		case 'worry':
			return `buddy-${state}-${variant}`;
		default:
			return getChatPetBuddyName(quality);
	}
}

export function getChatPetFrameDurations(state: ChatPetState): readonly number[] {
	switch (state) {
		case 'sleep':
			return SLEEP_FRAME_DURATIONS;
		case 'waking':
			return WAKE_FRAME_DURATIONS;
		case 'typing':
			return TYPING_FRAME_DURATIONS;
		case 'buttonPress':
			return BUTTON_PRESS_FRAME_DURATIONS;
		case 'falling':
			return FALLING_FRAME_DURATIONS;
		case 'jump':
			return JUMP_FRAME_DURATIONS;
		case 'splat':
			return SPLAT_FRAME_DURATIONS;
		case 'rendering':
			return IDLE_FRAME_DURATIONS;
		case 'clapping':
			return CLAPPING_FRAME_DURATIONS;
		case 'love':
			return LOVE_FRAME_DURATIONS;
		case 'cool':
			return COOL_FRAME_DURATIONS;
		case 'sing':
			return SING_FRAME_DURATIONS;
		case 'speechless':
			return SPEECHLESS_FRAME_DURATIONS;
		case 'worry':
			return WORRY_FRAME_DURATIONS;
		case 'dizzy':
			return DIZZY_FRAME_DURATIONS;
		case 'searching':
			return SEARCH_FRAME_DURATIONS;
		case 'onTheRun':
		case 'wallImpact':
		case 'searchingDown':
			return [];
		case 'yappingMouthOpen':
		case 'yapping':
			return [];
		default:
			return IDLE_FRAME_DURATIONS;
	}
}

function createSpriteSources(name: string, state: ChatPetState, tracksCursor = true, sourceWidth?: number, sourceHeight = CHAT_PET_SOURCE_SIZE, fixedOrientationDecorations?: readonly ChatPetFixedOrientationDecoration[]): ChatPetSpriteSources {
	const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
	const suffix = tracksCursor ? '-tracking-96' : `-${sourceHeight}`;
	const frameDurations = getChatPetFrameDurations(state);
	const frameWidth = sourceWidth ?? (state === 'typing'
		? CHAT_PET_TYPING_SOURCE_WIDTH
		: state === 'buttonPress'
			? CHAT_PET_BUTTON_PRESS_SOURCE_WIDTH
			: CHAT_PET_SOURCE_SIZE);
	const staticSource = {
		url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.png`).toString(true),
		frameWidth,
		frameHeight: sourceHeight,
		fixedOrientationDecorations,
		frameDurations: [],
		iterations: 1,
	};
	return {
		animated: frameDurations.length === 0 ? staticSource : {
			url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.spritesheet.png`).toString(true),
			frameWidth,
			frameHeight: sourceHeight,
			fixedOrientationDecorations,
			frameDurations,
			iterations: state === 'waking' || state === 'buttonPress' || state === 'cool' || state === 'splat' || state === 'searching' || state === 'jump' ? 1 : Infinity,
		},
		reducedMotion: staticSource,
	};
}

export function getChatPetSpeechFrameDurations(): readonly number[] {
	return SPEECH_FRAME_DURATIONS;
}

export function getChatPetRespawnFrameDurations(): readonly number[] {
	return RESPAWN_FRAME_DURATIONS;
}

function getSpriteSources(variant: ChatPetVariant): Record<ChatPetState, ChatPetSpriteSources> {
	let sources = spriteSources.get(variant);
	if (!sources) {
		const createStateSpriteSources = (state: ChatPetState) => createSpriteSources(getChatPetSpriteName(state, variant), state, doesChatPetStateTrackCursor(state));
		sources = {
			idle: createStateSpriteSources('idle'),
			sleep: createSpriteSources(getChatPetSpriteName('sleep', variant), 'sleep', false, CHAT_PET_SLEEP_SOURCE_WIDTH),
			waking: createSpriteSources(getChatPetSpriteName('waking', variant), 'waking', false, CHAT_PET_SLEEP_SOURCE_WIDTH),
			typing: createStateSpriteSources('typing'),
			rendering: createStateSpriteSources('rendering'),
			buttonPress: createStateSpriteSources('buttonPress'),
			complete: createStateSpriteSources('complete'),
			love: createStateSpriteSources('love'),
			clapping: createStateSpriteSources('clapping'),
			jump: createStateSpriteSources('jump'),
			cool: createStateSpriteSources('cool'),
			yapping: createStateSpriteSources('yapping'),
			yappingMouthOpen: createStateSpriteSources('yappingMouthOpen'),
			sing: createSpriteSources(getChatPetSpriteName('sing', variant), 'sing', false, CHAT_PET_SING_SOURCE_WIDTH, CHAT_PET_SING_SOURCE_HEIGHT, CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS),
			speechless: createStateSpriteSources('speechless'),
			worry: createStateSpriteSources('worry'),
			dizzy: createSpriteSources(getChatPetSpriteName('dizzy', variant), 'dizzy', false, undefined, CHAT_PET_DIZZY_SOURCE_HEIGHT),
			falling: createStateSpriteSources('falling'),
			wallImpact: createStateSpriteSources('wallImpact'),
			splat: createStateSpriteSources('splat'),
			onTheRun: createStateSpriteSources('onTheRun'),
			searching: createStateSpriteSources('searching'),
			searchingDown: createStateSpriteSources('searchingDown'),
		};
		spriteSources.set(variant, sources);
	}

	return sources;
}

function getSpeechSpriteSources(variant: ChatPetVariant): ChatPetSpriteSources {
	let sources = speechSpriteSources.get(variant);
	if (!sources) {
		const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
		const name = `buddy-speech-${variant}-96`;
		sources = {
			animated: {
				url: FileAccess.asBrowserUri(`${root}/${name}.spritesheet.png`).toString(true),
				frameWidth: CHAT_PET_SOURCE_SIZE,
				frameDurations: SPEECH_FRAME_DURATIONS,
				iterations: Infinity,
			},
			reducedMotion: {
				url: FileAccess.asBrowserUri(`${root}/${name}.png`).toString(true),
				frameWidth: CHAT_PET_SOURCE_SIZE,
				frameDurations: [],
				iterations: 1,
			},
		};
		speechSpriteSources.set(variant, sources);
	}
	return sources;
}

function getRespawnSpriteSources(variant: ChatPetVariant): ChatPetSpriteSources {
	let sources = respawnSpriteSources.get(variant);
	if (!sources) {
		const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
		const name = `buddy-respawn-${variant}-96`;
		sources = {
			animated: {
				url: FileAccess.asBrowserUri(`${root}/${name}.spritesheet.png`).toString(true),
				frameWidth: CHAT_PET_SOURCE_SIZE,
				frameDurations: RESPAWN_FRAME_DURATIONS,
				iterations: 1,
			},
			reducedMotion: {
				url: FileAccess.asBrowserUri(`${root}/${name}.png`).toString(true),
				frameWidth: CHAT_PET_SOURCE_SIZE,
				frameDurations: [],
				iterations: 1,
			},
		};
		respawnSpriteSources.set(variant, sources);
	}
	return sources;
}

function doesChatPetStateSpeak(state: ChatPetState | undefined): boolean {
	return state === 'rendering';
}

export function isChatPetImageSource(image: Pick<HTMLImageElement, 'getAttribute'>, source: string): boolean {
	return image.getAttribute('src') === source;
}

export function getChatPetBaseState(hasActiveRequest: boolean, needsInput: boolean, confirmationAttentionExpired: boolean, hasInput: boolean, idleExpired: boolean): ChatPetState {
	if (needsInput) {
		return confirmationAttentionExpired ? 'idle' : 'clapping';
	}
	if (hasActiveRequest) {
		return 'rendering';
	}
	if (idleExpired) {
		return 'sleep';
	}
	if (hasInput) {
		return 'typing';
	}
	return 'idle';
}

export function isChatPetVisible(enabled: boolean, isLatestFocusedWidget: boolean): boolean {
	return enabled && isLatestFocusedWidget;
}

export function isChatPetKeyboardInteractionEnabled(enabled: boolean, isDead: boolean, hasPointerInteraction: boolean, isAirborne: boolean, onTheRun: boolean): boolean {
	return enabled && !isDead && !hasPointerInteraction && !isAirborne && !onTheRun;
}

function isChatPetYapState(state: ChatPetState | undefined): boolean {
	return state === 'yapping' || state === 'yappingMouthOpen';
}

export function getChatPetRenderedState(baseState: ChatPetState, transientState: ChatPetState | undefined, isDragging: boolean): ChatPetState {
	if (isDragging) {
		return 'idle';
	}
	if (isChatPetYapState(transientState) && baseState !== 'idle') {
		return baseState;
	}
	return transientState ?? baseState;
}

type ChatPetAnimationFrame = { frameIndex: number; complete: true } | { frameIndex: number; complete: false; nextFrameDelay: number };

export function getChatPetAnimationFrame(frameDurations: readonly number[], elapsed: number, iterations: number, reverse = false): ChatPetAnimationFrame {
	if (frameDurations.length === 0) {
		return { frameIndex: 0, complete: true };
	}

	const totalDuration = frameDurations.reduce((total, duration) => total + duration, 0);
	const lastFrameIndex = frameDurations.length - 1;
	if (elapsed >= totalDuration * iterations) {
		return { frameIndex: reverse ? 0 : lastFrameIndex, complete: true };
	}
	const iterationElapsed = Math.max(0, elapsed) % totalDuration;
	let frameEnd = 0;
	for (let animationFrameIndex = 0; animationFrameIndex < frameDurations.length; animationFrameIndex++) {
		const frameIndex = reverse ? lastFrameIndex - animationFrameIndex : animationFrameIndex;
		frameEnd += frameDurations[frameIndex];
		if (iterationElapsed < frameEnd) {
			return { frameIndex, complete: false, nextFrameDelay: frameEnd - iterationElapsed };
		}
	}
	return { frameIndex: reverse ? 0 : lastFrameIndex, complete: false, nextFrameDelay: totalDuration };
}

function getTransientStateDuration(state: ChatPetState): number {
	switch (state) {
		case 'buttonPress':
			return BUTTON_PRESS_STATE_DURATION;
		case 'complete':
			return COMPLETE_STATE_DURATION;
		case 'splat':
			return SPLAT_STATE_DURATION;
		case 'love':
			return LOVE_STATE_DURATION;
		case 'cool':
			return COOL_STATE_DURATION;
		case 'sing':
			return SING_STATE_DURATION;
		case 'speechless':
			return SPEECHLESS_STATE_DURATION;
		case 'worry':
			return WORRY_STATE_DURATION;
		case 'dizzy':
			return DIZZY_STATE_DURATION;
		case 'waking':
			return WAKE_STATE_DURATION;
		default:
			return TRANSIENT_STATE_DURATION;
	}
}

export function getChatPetClickInteraction(random: number, previousInteraction?: ChatPetClickInteraction): ChatPetClickInteraction {
	if (random < CHAT_PET_ICON_TRANSFORMATION_CHANCE) {
		return 'complete';
	}
	const yappingThreshold = CHAT_PET_ICON_TRANSFORMATION_CHANCE + CHAT_PET_YAPPING_CHANCE;
	if (random < yappingThreshold) {
		return 'yapping';
	}

	const interactions: readonly ChatPetClickInteraction[] = ['buttonPress', 'love', 'cool', 'sing', 'speechless', 'worry'];
	const availableInteractions = interactions.filter(interaction => interaction !== previousInteraction);
	const normalizedRandom = (random - yappingThreshold) / (1 - yappingThreshold);
	return availableInteractions[Math.min(Math.floor(normalizedRandom * availableInteractions.length), availableInteractions.length - 1)];
}

export function getChatPetGazeDirection(cursorX: number, cursorY: number, petCenterX: number, petCenterY: number): readonly [number, number] {
	const deltaX = cursorX - petCenterX;
	const deltaY = cursorY - petCenterY;
	const distance = Math.hypot(deltaX, deltaY);
	if (distance === 0) {
		return [0, 0];
	}

	return [
		Math.round(deltaX / distance),
		Math.round(deltaY / distance),
	];
}

type ChatPetFacingDirection = 'left' | 'right';

export class ChatPetFacingController {

	private _direction: ChatPetFacingDirection = 'right';
	private _tracksCursor = false;

	get direction(): ChatPetFacingDirection {
		return this._direction;
	}

	setDirection(direction: ChatPetFacingDirection): void {
		this._direction = direction;
	}

	setState(state: ChatPetState, isDragging: boolean): void {
		this._tracksCursor = state === 'idle' && !isDragging;
	}

	snapToCursor(cursorX: number, petCenterX: number): ChatPetFacingDirection {
		if (cursorX < petCenterX) {
			this.setDirection('left');
		} else if (cursorX > petCenterX) {
			this.setDirection('right');
		}
		return this._direction;
	}

	update(cursorX: number, petCenterX: number): ChatPetFacingDirection {
		if (this._tracksCursor) {
			return this.snapToCursor(cursorX, petCenterX);
		}
		return this._direction;
	}
}

export class ChatPetDirectionChangeController {

	private _lastDirection: ChatPetFacingDirection | undefined;
	private _lastDirectionChangeTime: number | undefined;
	private _directionChangeCount = 0;

	constructor(
		private readonly directionChangeCount = DIZZY_DIRECTION_CHANGE_COUNT,
		private readonly maxDirectionChangeInterval = DIZZY_DIRECTION_CHANGE_MAX_INTERVAL,
	) { }

	record(direction: ChatPetFacingDirection, timestamp: number): boolean {
		if (this._lastDirection === direction) {
			return false;
		}
		if (this._lastDirection === undefined) {
			this._lastDirection = direction;
			this._lastDirectionChangeTime = timestamp;
			return false;
		}
		if (this._lastDirectionChangeTime !== undefined && timestamp - this._lastDirectionChangeTime > this.maxDirectionChangeInterval) {
			this._directionChangeCount = 0;
		}

		this._lastDirection = direction;
		this._lastDirectionChangeTime = timestamp;
		this._directionChangeCount++;
		if (this._directionChangeCount < this.directionChangeCount) {
			return false;
		}

		this.reset();
		return true;
	}

	reset(): void {
		this._lastDirection = undefined;
		this._lastDirectionChangeTime = undefined;
		this._directionChangeCount = 0;
	}
}

export function getChatPetHorizontalPosition(left: number, minimumLeft: number, maximumLeft: number): number {
	return Math.max(minimumLeft, Math.min(Math.max(minimumLeft, maximumLeft), left));
}

export function getChatPetDefaultHorizontalPosition(minimumLeft: number, maximumLeft: number): number {
	return Math.max(minimumLeft, maximumLeft - CHAT_PET_DEFAULT_RIGHT_INSET);
}

export function getChatPetRestoredHorizontalPosition(previousLeft: number | undefined, minimumLeft: number, maximumLeft: number): number {
	return previousLeft === undefined
		? getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft)
		: getChatPetHorizontalPosition(previousLeft, minimumLeft, maximumLeft);
}

export function getChatPetScale(scale: number, delta: number): number {
	return Math.max(CHAT_PET_MIN_SCALE, Math.round((scale + delta) * 10) / 10);
}

export function getChatPetDragPosition(left: number, top: number, minimumLeft: number, maximumLeft: number, minimumTop: number, maximumTop: number): readonly [number, number] {
	return [
		getChatPetHorizontalPosition(left, minimumLeft, maximumLeft),
		Math.max(minimumTop, Math.min(Math.max(minimumTop, maximumTop), top)),
	];
}

export function getChatPetThrowVelocity(samples: readonly ChatPetPointerSample[], releaseTime: number): ChatPetThrowVelocity | undefined {
	if (samples.length < 2) {
		return undefined;
	}

	const latest = samples[samples.length - 1];
	if (releaseTime - latest.time > THROW_RELEASE_GRACE_DURATION) {
		return undefined;
	}

	let first = latest;
	for (let index = samples.length - 2; index >= 0; index--) {
		const sample = samples[index];
		if (latest.time - sample.time > THROW_VELOCITY_SAMPLE_DURATION) {
			break;
		}
		first = sample;
	}

	const elapsed = Math.max(16, latest.time - first.time);
	const velocityX = (latest.x - first.x) / elapsed * 1_000;
	const velocityY = (latest.y - first.y) / elapsed * 1_000;
	const horizontalVelocity = Math.abs(velocityX);
	if (horizontalVelocity < THROW_MIN_HORIZONTAL_VELOCITY || horizontalVelocity < Math.abs(velocityY)) {
		return undefined;
	}

	const flightVelocity = Math.min(THROW_MAX_HORIZONTAL_VELOCITY, Math.max(THROW_MIN_FLIGHT_VELOCITY, horizontalVelocity));
	return {
		x: Math.sign(velocityX) * flightVelocity,
		y: Math.max(-THROW_MAX_UPWARD_VELOCITY, Math.min(velocityY, -THROW_MIN_UPWARD_VELOCITY)),
	};
}

export function advanceChatPetThrow(motion: ChatPetThrowMotion, elapsed: number, bounds: ChatPetThrowBounds): ChatPetThrowStep {
	const duration = Math.max(0, elapsed) / 1_000;
	const projectedLeft = motion.left + motion.x * duration;
	const hasHorizontalRange = bounds.maximumLeft > bounds.minimumLeft;
	let wall: ChatPetWall | undefined;
	let motionDuration = duration;
	let left = hasHorizontalRange ? projectedLeft : bounds.minimumLeft;

	if (hasHorizontalRange && projectedLeft < bounds.minimumLeft) {
		wall = 'left';
		motionDuration *= (bounds.minimumLeft - motion.left) / (projectedLeft - motion.left);
		left = bounds.minimumLeft;
	} else if (hasHorizontalRange && projectedLeft > bounds.maximumLeft) {
		wall = 'right';
		motionDuration *= (bounds.maximumLeft - motion.left) / (projectedLeft - motion.left);
		left = bounds.maximumLeft;
	}

	let top = motion.top + motion.y * motionDuration + THROW_GRAVITY * motionDuration * motionDuration / 2;
	let velocityY = motion.y + THROW_GRAVITY * motionDuration;
	if (top < bounds.minimumTop) {
		top = bounds.minimumTop;
		velocityY = Math.abs(velocityY) * THROW_CEILING_RESTITUTION;
	}

	return {
		left,
		top,
		x: hasHorizontalRange ? motion.x : 0,
		y: velocityY,
		wall,
	};
}

export function shouldSettleChatPetThrow(startTime: number, currentTime: number, top: number, verticalVelocity: number, floorTop: number): boolean {
	return currentTime - startTime >= THROW_MAX_DURATION || (top > floorTop && verticalVelocity >= 0);
}

export function getChatPetFallTarget(petLeft: number, petTop: number, petWidth: number, petHeight: number, platformLeft: number, platformRight: number, platformTop: number, floorBottom: number): { readonly top: number; readonly landsOnPlatform: boolean } {
	const petCenter = petLeft + petWidth / 2;
	const landsOnPlatform = petCenter >= platformLeft && petCenter <= platformRight && petTop + petHeight <= platformTop;
	return {
		top: landsOnPlatform ? platformTop - petHeight : floorBottom - petHeight,
		landsOnPlatform,
	};
}

export function getChatPetThrowLanding(previousLeft: number, previousTop: number, left: number, top: number, petWidth: number, petHeight: number, platformLeft: number, platformRight: number, platformTop: number, floorTop: number): { readonly left: number; readonly top: number; readonly landsOnPlatform: boolean } | undefined {
	if (top <= previousTop) {
		return undefined;
	}

	const getLeftAtTop = (targetTop: number) => previousLeft + (left - previousLeft) * (targetTop - previousTop) / (top - previousTop);
	const platformLandingTop = platformTop - petHeight;
	if (previousTop <= platformLandingTop && top >= platformLandingTop) {
		const landingLeft = getLeftAtTop(platformLandingTop);
		const petCenter = landingLeft + petWidth / 2;
		if (petCenter >= platformLeft && petCenter <= platformRight) {
			return { left: landingLeft, top: platformLandingTop, landsOnPlatform: true };
		}
	}

	if (previousTop <= floorTop && top >= floorTop) {
		return { left: getLeftAtTop(floorTop), top: floorTop, landsOnPlatform: false };
	}
	return undefined;
}

export function getChatPetFallDuration(distance: number): number {
	return Math.max(180, Math.min(700, Math.sqrt(Math.abs(distance)) * 20));
}

export function getChatPetVerticalOffset(hostTop: number, inputTop: number): number {
	return Math.max(0, Math.min(CHAT_PET_MAX_VERTICAL_OFFSET, inputTop - hostTop));
}

export function getChatPetPlatformTop(hostTop: number, inputTop: number, substantiveSurfaceTop?: number): number {
	if (substantiveSurfaceTop !== undefined && substantiveSurfaceTop >= hostTop && substantiveSurfaceTop <= inputTop) {
		return substantiveSurfaceTop;
	}
	return hostTop + getChatPetVerticalOffset(hostTop, inputTop);
}

export function shouldPlaceChatPetSpeechBubbleLeft(state: ChatPetState | undefined, buttonRight: number, inputRight: number, scale = 1): boolean {
	return state === 'rendering' && buttonRight + CHAT_PET_SPEECH_BUBBLE_RIGHT_OVERHANG * scale > inputRight;
}

export function getChatPetWideSpriteHorizontalOffset(state: ChatPetState | undefined, facingDirection: ChatPetFacingDirection, buttonLeft: number, buttonRight: number, inputLeft: number, inputRight: number, scale = 1): number {
	const overhang = state === 'sleep' || state === 'waking'
		? CHAT_PET_SLEEP_RIGHT_OVERHANG
		: state === 'typing'
			? CHAT_PET_TYPING_RIGHT_OVERHANG
			: state === 'buttonPress'
				? CHAT_PET_BUTTON_PRESS_RIGHT_OVERHANG
				: state === 'sing'
					? CHAT_PET_SING_RIGHT_OVERHANG
					: 0;
	if (overhang === 0) {
		return 0;
	}
	return facingDirection === 'left'
		? Math.max(0, overhang - (buttonLeft - inputLeft) / scale)
		: Math.min(0, (inputRight - buttonRight) / scale - overhang);
}

export class ChatPetHopController extends Disposable {

	private readonly _stepScheduler = this._register(new RunOnceScheduler(() => this._applyStep(), HOP_APEX_DELAY));
	private readonly _restScheduler = this._register(new RunOnceScheduler(() => this._beginHop(), HOP_REST_DELAY));
	private _direction = 0;
	private _heldUntil = 0;
	private _active = false;

	constructor(private readonly callbacks: {
		readonly onDirectionChange: (direction: number) => void;
		readonly onMove: (delta: number) => void;
		readonly onStart: () => void;
		readonly onReducedMotionStart: () => void;
		readonly onRequest: () => void;
	}) {
		super();
	}

	request(direction: number, motionReduced: boolean): void {
		this._direction = direction;
		this.callbacks.onDirectionChange(direction);
		this.callbacks.onRequest();
		if (motionReduced) {
			this.cancel();
			this.callbacks.onMove(direction * HOP_DISTANCE);
			this.callbacks.onReducedMotionStart();
			return;
		}
		this._heldUntil = Date.now() + HOP_HOLD_GRACE;
		if (!this._active) {
			this._beginHop();
		}
	}

	cancel(): void {
		this._active = false;
		this._direction = 0;
		this._heldUntil = 0;
		this._stepScheduler.cancel();
		this._restScheduler.cancel();
	}

	onAnimationComplete(): void {
		if (!this._active) {
			return;
		}
		if (Date.now() < this._heldUntil) {
			this._restScheduler.schedule();
		} else {
			this._active = false;
		}
	}

	private _beginHop(): void {
		this._active = true;
		this.callbacks.onStart();
		this._stepScheduler.schedule();
	}

	private _applyStep(): void {
		if (!this._active || this._direction === 0) {
			return;
		}
		this.callbacks.onMove(this._direction * HOP_DISTANCE);
	}
}

export class ChatPetWidget extends Disposable {

	private readonly _overlay: HTMLElement;
	private readonly _button: Button;
	private readonly _visual: HTMLElement;
	private readonly _respawnEffect: ChatPetSpriteElement;
	private readonly _sprites: readonly ChatPetSpriteElement[];
	private readonly _speechBubble: ChatPetSpriteElement;
	private readonly _eyes: HTMLElement;
	private readonly _pupils: HTMLElement[] = [];
	private readonly _facingController = new ChatPetFacingController();
	private readonly _directionChangeController = new ChatPetDirectionChangeController();
	private readonly _gazeScheduler: dom.AnimationFrameScheduler;
	private readonly _dragMonitor = this._register(new GlobalPointerMoveMonitor());
	private readonly _idleExpired = observableValue(this, false);
	private readonly _confirmationAttentionExpired = observableValue(this, false);
	private readonly _transientState = observableValue<ChatPetState | undefined>(this, undefined);
	private readonly _isDragging = observableValue(this, false);
	private readonly _isDead = observableValue(this, false);
	private readonly _idleScheduler = this._register(new RunOnceScheduler(() => this._idleExpired.set(true, undefined), CHAT_PET_IDLE_SLEEP_DELAY));
	private readonly _confirmationAttentionScheduler = this._register(new RunOnceScheduler(() => this._confirmationAttentionExpired.set(true, undefined), CHAT_PET_CONFIRMATION_ATTENTION_DURATION));
	private readonly _transientScheduler = this._register(new RunOnceScheduler(() => this._transientState.set(undefined, undefined), TRANSIENT_STATE_DURATION));
	private readonly _searchScheduler: RunOnceScheduler;
	private readonly _clickSuppressionScheduler = this._register(new RunOnceScheduler(() => this._suppressNextPointerClick = false, 0));
	private readonly _spriteAnimation = this._register(new MutableDisposable());
	private readonly _speechAnimation = this._register(new MutableDisposable());
	private readonly _respawnAnimation = this._register(new MutableDisposable());
	private readonly _throwAnimation = this._register(new MutableDisposable());
	private readonly _respawnEffectScheduler = this._register(new RunOnceScheduler(() => this._showRespawnEffect(), RESPAWN_EFFECT_DURATION));
	private readonly _respawnFallScheduler = this._register(new RunOnceScheduler(() => this._beginRespawnFall(), RESPAWN_EFFECT_DURATION));
	private readonly _hopController = this._register(new ChatPetHopController({
		onDirectionChange: direction => this._button.element.dataset.hopDirection = direction < 0 ? 'left' : 'right',
		onMove: delta => this._setHorizontalPosition(this._getCurrentLeft() + delta),
		onStart: () => {
			if (this._transientState.get() === 'jump') {
				this._renderState('jump', true);
			} else {
				this._transientState.set('jump', undefined);
			}
		},
		onReducedMotionStart: () => this._transientState.set('jump', undefined),
		onRequest: () => this._transientScheduler.schedule(HOP_IDLE_DEBOUNCE),
	}));
	private readonly _contextMenuActions = this._register(new MutableDisposable<DisposableStore>());
	private _cursorPosition: readonly [number, number] | undefined;
	private _activeSprite: ChatPetSpriteElement | undefined;
	private _pendingSprite: ChatPetSpriteElement | undefined;
	private _pendingSource: ChatPetSpriteSource | undefined;
	private _pendingState: ChatPetState | undefined;
	private _renderedState: ChatPetState | undefined;
	private _motionReduced = false;
	private _enabled = false;
	private _busy = false;
	private _enablementInitialized = false;
	private _hasCustomPosition = false;
	private _suppressNextPointerClick = false;
	private _contextMenuVisible = false;
	private _lastClickInteraction: ChatPetClickInteraction | undefined;
	private _fallLandsOnPlatform = false;
	private _throwWallImpact: ChatPetWall | undefined;
	private _throwGeometryDirty = false;
	private _deathPosition: readonly [number, number] | undefined;
	private _respawnPhase: 'none' | 'despawning' | 'respawning' | 'falling' = 'none';
	private _respawnPosition: readonly [number, number] | undefined;
	private _platformTopProvider: (() => number | undefined) | undefined;
	private readonly _resizeObserver: dom.DisposableResizeObserver;
	private _variant: ChatPetVariant;
	private _scale = 1;

	constructor(
		private readonly parent: HTMLElement,
		private readonly dragBounds: HTMLElement,
		private readonly movementBounds: HTMLElement,
		model: IObservable<IChatModel | undefined>,
		hasInput: IObservable<boolean>,
		isLatestFocusedWidget: IObservable<boolean>,
		inputChanged: (listener: () => void) => IDisposable,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();

		this._variant = this.chatPetService.variant.get();
		this._searchScheduler = this._register(new RunOnceScheduler(() => this._trySearch(), SEARCH_INTERVAL));
		this.parent.classList.add('chat-pet-host');
		this._overlay = dom.$('.chat-pet-overlay');
		this.parent.prepend(this._overlay);
		this._register(toDisposable(() => this._overlay.remove()));
		this._button = this._register(new Button(this._overlay, {
			ariaLabel: this._getAriaLabel(false),
		}));
		this._button.element.classList.add('chat-pet-button');
		this._button.element.dataset.facing = this._facingController.direction;
		this._visual = dom.append(this._button.element, dom.$('.chat-pet-visual'));
		const respawnEffectCanvas = dom.append(this._overlay, dom.$('canvas.chat-pet-canvas.chat-pet-respawn-effect.hidden')) as HTMLCanvasElement;
		respawnEffectCanvas.width = CHAT_PET_SOURCE_SIZE;
		respawnEffectCanvas.height = CHAT_PET_SOURCE_SIZE;
		respawnEffectCanvas.setAttribute('aria-hidden', 'true');
		const respawnEffectImage = dom.append(this._overlay, dom.$('img.chat-pet-spritesheet')) as HTMLImageElement;
		respawnEffectImage.alt = '';
		respawnEffectImage.setAttribute('aria-hidden', 'true');
		this._respawnEffect = { container: respawnEffectCanvas, image: respawnEffectImage, canvas: respawnEffectCanvas };
		this._register(dom.addDisposableListener(respawnEffectImage, 'load', () => this._startRespawnEffectAnimation()));
		this._resizeObserver = this._register(new dom.DisposableResizeObserver('ChatPetWidget.dragBounds', () => {
			this._updateSpeechBubblePosition();
			const isAirborne = this._isAirborne();
			if (this._isDead.get()) {
				this._updateRespawnEffectPosition();
			} else if (isAirborne) {
				if (this._button.element.classList.contains('throwing')) {
					this._throwGeometryDirty = true;
				}
				return;
			} else if (this._fallLandsOnPlatform && !this._isDragging.get()) {
				if (this._hasCustomPosition) {
					this._setPlatformPosition(this._getCurrentLeft());
				} else {
					this._setDefaultPlatformPosition();
				}
			} else {
				this._updateVerticalPosition();
				if (this._hasCustomPosition && !this._isDragging.get()) {
					this._setHorizontalPosition(this._getCurrentLeft());
				} else if (!this._isDragging.get()) {
					this._setDefaultHorizontalPosition();
				}
			}
		}, dom.getWindow(this._button.element)));
		this._register(this._resizeObserver.observe(this.dragBounds));
		this._register(this._resizeObserver.observe(this.movementBounds));
		this._register(this._resizeObserver.observe(this.parent));
		this._updateVerticalPosition();
		this._setDefaultHorizontalPosition();
		this._updateSpeechBubblePosition();
		this._sprites = [0, 1].map(() => {
			const container = dom.append(this._visual, dom.$('.chat-pet-sprite.hidden'));
			const canvas = dom.append(container, dom.$('canvas.chat-pet-canvas')) as HTMLCanvasElement;
			canvas.width = CHAT_PET_SOURCE_SIZE;
			canvas.height = CHAT_PET_SOURCE_SIZE;
			canvas.setAttribute('aria-hidden', 'true');
			const image = dom.append(container, dom.$('img.chat-pet-spritesheet')) as HTMLImageElement;
			image.alt = '';
			image.setAttribute('aria-hidden', 'true');
			const sprite = { container, image, canvas };
			this._register(dom.addDisposableListener(image, 'load', () => this._onImageLoad(sprite)));
			return sprite;
		});
		this._eyes = dom.append(this._visual, dom.$('.chat-pet-eyes'));
		this._eyes.setAttribute('aria-hidden', 'true');
		for (const side of ['left', 'right']) {
			const eye = dom.append(this._eyes, dom.$(`.chat-pet-eye.${side}`));
			this._pupils.push(dom.append(eye, dom.$('.chat-pet-pupil')));
		}
		const speechBubbleContainer = dom.append(this._visual, dom.$('.chat-pet-speech-bubble.hidden'));
		const speechBubbleCanvas = dom.append(speechBubbleContainer, dom.$('canvas.chat-pet-canvas.chat-pet-speech-canvas')) as HTMLCanvasElement;
		speechBubbleCanvas.width = CHAT_PET_SOURCE_SIZE;
		speechBubbleCanvas.height = CHAT_PET_SOURCE_SIZE;
		speechBubbleCanvas.setAttribute('aria-hidden', 'true');
		const speechBubbleImage = dom.append(speechBubbleContainer, dom.$('img.chat-pet-spritesheet')) as HTMLImageElement;
		speechBubbleImage.alt = '';
		speechBubbleImage.setAttribute('aria-hidden', 'true');
		this._speechBubble = { container: speechBubbleContainer, image: speechBubbleImage, canvas: speechBubbleCanvas };
		this._register(dom.addDisposableListener(speechBubbleImage, 'load', () => this._updateSpeechBubble(this._renderedState, true)));
		this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
		this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event: PointerEvent) => {
			this._cursorPosition = [event.clientX, event.clientY];
			if (this._enabled && doesChatPetStateTrackCursor(this._renderedState)) {
				this._gazeScheduler.schedule();
			}
		}));
		const onAnimationComplete = (event: AnimationEvent) => {
			if (event.animationName === 'chat-pet-enter') {
				this._button.element.classList.remove('entering');
			} else if (event.animationName === 'chat-pet-exit' && !this._enabled) {
				this._finishDisable();
			} else if (event.animationName === 'chat-pet-yapping-fall' && !this._isDragging.get() && event.target === this._activeSprite?.container && this._button.element.dataset.state === 'yapping') {
				this._transientState.set('yappingMouthOpen', undefined);
			} else if (event.animationName === 'chat-pet-search-down' && this._button.element.dataset.state === 'searchingDown') {
				this._transientState.set(undefined, undefined);
			}
		};
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, onAnimationComplete));
		this._register(dom.addDisposableListener(this._button.element, 'animationcancel', onAnimationComplete));
		const onTransitionComplete = (event: TransitionEvent) => {
			if (event.propertyName === 'top' && this._button.element.classList.contains('falling')) {
				this._finishFall();
			}
		};
		this._register(dom.addDisposableListener(this._button.element, 'transitionend', onTransitionComplete));
		this._register(dom.addDisposableListener(this._button.element, 'transitioncancel', onTransitionComplete));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.POINTER_DOWN, event => this._startDrag(event)));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.KEY_DOWN, event => this._onKeyDown(event)));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.CONTEXT_MENU, event => {
			if (!this._enabled) {
				return;
			}
			dom.EventHelper.stop(event, true);
			this._showContextMenu(event);
		}));
		this._register(inputChanged(() => {
			if (this._enabled && !this.chatPetService.onTheRun.get()) {
				this._wake();
			}
		}));

		this._register(this._button.onDidClick(e => {
			dom.EventHelper.stop(e, true);
			if (this._contextMenuVisible) {
				return;
			}

			if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
				this._suppressNextPointerClick = false;
				this._clickSuppressionScheduler.cancel();
				return;
			}
			if (this.chatPetService.onTheRun.get()) {
				this._transientState.set(undefined, undefined);
				this.chatPetService.setOnTheRun(false);
				return;
			}
			const wasSleeping = this._idleExpired.get() || this._renderedState === 'sleep';
			if (wasSleeping) {
				this._wake();
			}
			if (wasSleeping || this._transientState.get() === 'waking') {
				status(localize('chatPet.wokeUp', "The VS Code pet woke up"));
				return;
			}
			const interaction = getChatPetClickInteraction(Math.random(), this._lastClickInteraction);
			this._lastClickInteraction = interaction;
			this._showTransientState(interaction);
			switch (interaction) {
				case 'buttonPress':
					status(localize('chatPet.pressedButton', "The VS Code pet pressed its button"));
					break;
				case 'complete':
					status(localize('chatPet.spun', "The VS Code pet did a rare spin"));
					break;
				case 'love':
					status(localize('chatPet.loved', "The VS Code pet feels loved"));
					break;
				case 'cool':
					status(localize('chatPet.cool', "The VS Code pet put on sunglasses"));
					break;
				case 'yapping':
					status(localize('chatPet.yapping', "The VS Code pet is yapping"));
					break;
				case 'sing':
					status(localize('chatPet.singing', "The VS Code pet is singing"));
					break;
				case 'speechless':
					status(localize('chatPet.speechless', "The VS Code pet is speechless"));
					break;
				case 'worry':
					status(localize('chatPet.worried', "The VS Code pet is worried"));
					break;
			}
		}));

		const motionReduced = observableFromEvent(this, this.accessibilityService.onDidChangeReducedMotion, () => this.accessibilityService.isMotionReduced());
		this._register(autorun(reader => {
			const wasMotionReduced = this._motionReduced;
			this._motionReduced = motionReduced.read(reader);
			if (!wasMotionReduced && this._motionReduced && this._button.element.classList.contains('throwing')) {
				this._finishThrow();
			}
			const serviceEnabled = this.chatPetService.enabled.read(reader);
			const scale = this.chatPetService.scale.read(reader);
			if (scale !== this._scale) {
				this._setScale(scale);
			}
			const enabled = isChatPetVisible(serviceEnabled, isLatestFocusedWidget.read(reader));
			const variant = this.chatPetService.variant.read(reader);
			const variantChanged = variant !== this._variant;
			this._variant = variant;
			const onTheRun = this.chatPetService.onTheRun.read(reader);
			const isDead = this._isDead.read(reader);
			this._button.element.classList.toggle('on-the-run', onTheRun);
			this._button.setAriaLabel(this._getAriaLabel(onTheRun));
			const chatModel = model.read(reader);
			const request = chatModel?.lastRequestObs.read(reader);
			const needsInput = !!request?.response?.isPendingConfirmation.read(reader);
			let confirmationAttentionExpired = this._confirmationAttentionExpired.read(reader);
			if (!needsInput) {
				this._confirmationAttentionScheduler.cancel();
				if (confirmationAttentionExpired) {
					confirmationAttentionExpired = false;
					this._confirmationAttentionExpired.set(false, undefined);
				}
			} else if (!confirmationAttentionExpired && !this._confirmationAttentionScheduler.isScheduled()) {
				this._confirmationAttentionScheduler.schedule();
			}
			const hasActiveRequest = chatModel?.hasActiveRequest.read(reader) ?? false;
			const inputHasContent = hasInput.read(reader);
			this._busy = hasActiveRequest || needsInput;
			let idleExpired = this._idleExpired.read(reader);
			let transientState = this._transientState.read(reader);
			const isDragging = this._isDragging.read(reader);

			if (!this._enablementInitialized || enabled !== this._enabled) {
				const wasInitialized = this._enablementInitialized;
				this._enablementInitialized = true;
				this._enabled = enabled;
				if (enabled) {
					if (isDead) {
						this._showRespawnSequence();
					} else {
						this._startEnableAnimation();
					}
				} else if (wasInitialized) {
					this._startDisableAnimation();
				} else {
					this._finishDisable();
				}
			}

			if (!enabled) {
				this._hopController.cancel();
				this._idleScheduler.cancel();
				this._searchScheduler.cancel();
				this._transientScheduler.cancel();
				if (transientState !== undefined) {
					this._transientState.set(undefined, undefined);
				}
				if (this._motionReduced) {
					this._finishDisable();
				}
				return;
			}

			if (isDead) {
				this._hopController.cancel();
				this._idleScheduler.cancel();
				this._searchScheduler.cancel();
				this._transientScheduler.cancel();
				this._showRespawnSequence();
				return;
			}

			if (onTheRun) {
				this._hopController.cancel();
				this._idleScheduler.cancel();
				if (!this._searchScheduler.isScheduled()) {
					this._searchScheduler.schedule();
				}
				const state = transientState === 'searching' || transientState === 'searchingDown' ? transientState : 'onTheRun';
				this._renderState(state, variantChanged);
				return;
			}
			this._searchScheduler.cancel();

			if (this._busy) {
				this._idleScheduler.cancel();
				if (idleExpired) {
					idleExpired = false;
					this._idleExpired.set(false, undefined);
					transientState = this._beginWakeAnimation() ?? transientState;
				}
			} else if (!idleExpired && !this._idleScheduler.isScheduled()) {
				this._idleScheduler.schedule();
			}

			const baseState = getChatPetBaseState(hasActiveRequest, needsInput, confirmationAttentionExpired, inputHasContent, idleExpired);
			if (isChatPetYapState(transientState) && baseState !== 'idle') {
				transientState = undefined;
				this._transientState.set(undefined, undefined);
			}
			const renderedState = getChatPetRenderedState(baseState, transientState, isDragging);
			if (renderedState !== 'jump' || this._motionReduced) {
				this._hopController.cancel();
			}
			this._renderState(renderedState, variantChanged, isDragging);
		}));

		this._register(autorun(reader => {
			const chatModel = model.read(reader);
			const response = chatModel?.lastRequestObs.read(reader)?.response;
			if (!response) {
				return;
			}
			reader.store.add(response.onDidChange(e => {
				if (e.reason === 'completedRequest' && !response.isCanceled) {
					this._showTransientState('buttonPress');
				}
			}));
		}));
	}

	setPlatformTopProvider(provider: () => number | undefined): void {
		this._platformTopProvider = provider;
		if (this._isAirborne()) {
			if (this._button.element.classList.contains('throwing')) {
				this._throwGeometryDirty = true;
			}
			return;
		}
		this._updateVerticalPosition();
		if (this._fallLandsOnPlatform && !this._isDragging.get()) {
			if (this._hasCustomPosition) {
				this._setPlatformPosition(this._getCurrentLeft());
			} else {
				this._setDefaultPlatformPosition();
			}
		}
	}

	private _startDrag(event: PointerEvent): void {
		if (!this._enabled || this._isDead.get() || this._isDragging.get() || this._isAirborne() || this.chatPetService.onTheRun.get() || event.button !== 0) {
			return;
		}
		this._wake();
		dom.EventHelper.stop(event);
		this._button.element.focus();
		const targetWindow = dom.getWindow(this._button.element);
		const startX = event.clientX;
		const startY = event.clientY;
		const pointerSamples: ChatPetPointerSample[] = [{ x: startX, y: startY, time: targetWindow.performance.now() }];
		const buttonBounds = this._button.element.getBoundingClientRect();
		const overlayBounds = this._overlay.getBoundingClientRect();
		const startLeft = buttonBounds.left - overlayBounds.left;
		const startTop = buttonBounds.top - overlayBounds.top;
		let didDrag = false;

		this._dragMonitor.startMonitoring(this._button.element, event.pointerId, event.buttons, moveEvent => {
			const deltaX = moveEvent.clientX - startX;
			const deltaY = moveEvent.clientY - startY;
			const sampleTime = targetWindow.performance.now();
			pointerSamples.push({ x: moveEvent.clientX, y: moveEvent.clientY, time: sampleTime });
			while (pointerSamples.length > 2 && sampleTime - pointerSamples[0].time > THROW_VELOCITY_SAMPLE_DURATION) {
				pointerSamples.shift();
			}
			if (!didDrag && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) {
				return;
			}

			if (!didDrag) {
				didDrag = true;
				this._button.element.classList.remove('entering');
				this._button.element.classList.add('dragging');
				this._spriteAnimation.clear();
				this._setDragPosition(startLeft, startTop);
				this._isDragging.set(true, undefined);
			}
			dom.EventHelper.stop(moveEvent, true);
			this._setDragPosition(startLeft + deltaX, startTop + deltaY);
		}, () => {
			this._button.element.classList.remove('dragging', 'resisting', 'soft-resisting');
			if (didDrag) {
				this._suppressNextPointerClick = true;
				this._clickSuppressionScheduler.schedule();
				const throwVelocity = getChatPetThrowVelocity(pointerSamples, targetWindow.performance.now());
				if (!this._motionReduced && throwVelocity) {
					this._beginThrow(throwVelocity);
				} else {
					this._beginFall();
				}
			}
		});
	}

	private _setDragPosition(left: number, top: number): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const movementBounds = this.movementBounds.getBoundingClientRect();
		const minimumLeft = movementBounds.left - overlayBounds.left;
		const maximumLeft = movementBounds.right - overlayBounds.left - this._button.element.offsetWidth;
		const minimumTop = movementBounds.top - overlayBounds.top;
		const maximumTop = movementBounds.bottom - overlayBounds.top - this._button.element.offsetHeight;
		const [clampedLeft, clampedTop] = getChatPetDragPosition(left, top, minimumLeft, maximumLeft, minimumTop, maximumTop);
		this._button.element.style.left = `${clampedLeft}px`;
		this._button.element.style.top = `${clampedTop}px`;
		this._button.element.style.right = 'auto';
		this._button.element.style.bottom = 'auto';
		this._hasCustomPosition = true;
		this._updateSpeechBubblePosition();
		if (this._button.element.classList.contains('dragging')) {
			this._updateDragWiggle();
		}
	}

	private _getFallTarget(): { readonly top: number; readonly landsOnPlatform: boolean } {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const platformBounds = this._getPlatformBounds();
		const movementBounds = this.movementBounds.getBoundingClientRect();
		return getChatPetFallTarget(
			Number.parseFloat(this._button.element.style.left),
			Number.parseFloat(this._button.element.style.top),
			this._getDisplaySize(),
			this._getDisplaySize(),
			platformBounds.left - overlayBounds.left,
			platformBounds.right - overlayBounds.left,
			platformBounds.top - overlayBounds.top,
			movementBounds.bottom - overlayBounds.top,
		);
	}

	private _updateDragWiggle(): void {
		const landsOnPlatform = this._getFallTarget().landsOnPlatform;
		this._button.element.classList.toggle('soft-resisting', landsOnPlatform);
		this._button.element.classList.toggle('resisting', !landsOnPlatform);
	}

	private _getThrowGeometry(): ChatPetThrowGeometry {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const movementBounds = this.movementBounds.getBoundingClientRect();
		const platformBounds = this._getPlatformBounds();
		const displaySize = this._getDisplaySize();
		return {
			bounds: {
				minimumLeft: movementBounds.left - overlayBounds.left,
				maximumLeft: Math.max(movementBounds.left - overlayBounds.left, movementBounds.right - overlayBounds.left - displaySize),
				minimumTop: movementBounds.top - overlayBounds.top,
			},
			displaySize,
			overlayLeft: overlayBounds.left,
			overlayTop: overlayBounds.top,
			platformLeft: platformBounds.left - overlayBounds.left,
			platformRight: platformBounds.right - overlayBounds.left,
			platformTop: platformBounds.top - overlayBounds.top,
			floorTop: movementBounds.bottom - overlayBounds.top - displaySize,
		};
	}

	private _beginThrow(velocity: ChatPetThrowVelocity): void {
		const targetWindow = dom.getWindow(this._button.element);
		let geometry = this._getThrowGeometry();
		const buttonBounds = this._button.element.getBoundingClientRect();
		let motion: ChatPetThrowMotion = {
			left: buttonBounds.left - geometry.overlayLeft,
			top: buttonBounds.top - geometry.overlayTop,
			x: velocity.x,
			y: velocity.y,
		};
		let rotation = 0;
		let wallImpact: { readonly wall: ChatPetWall; readonly endsAt: number } | undefined;
		const startTime = targetWindow.performance.now();
		let lastFrameTime = startTime;

		if (velocity.x !== 0) {
			this._setFacingDirection(velocity.x < 0 ? 'left' : 'right');
		}
		this._transientScheduler.cancel();
		this._throwWallImpact = undefined;
		this._throwGeometryDirty = false;
		this._fallLandsOnPlatform = false;
		this._setThrowPosition(motion.left, motion.top);
		this._transientState.set('falling', undefined);
		this._isDragging.set(false, undefined);
		this._renderState('falling', true);
		this._button.element.classList.add('throwing');

		const animationDisposables = new DisposableStore();
		const scheduledFrame = animationDisposables.add(new MutableDisposable<IDisposable>());
		const scheduleFrame = () => {
			scheduledFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, updateFrame);
		};
		const updateFrame = () => {
			if (this._throwAnimation.value !== animationDisposables) {
				return;
			}

			const now = targetWindow.performance.now();
			if (this._throwGeometryDirty) {
				geometry = this._getThrowGeometry();
				this._throwGeometryDirty = false;
				motion = {
					...motion,
					left: getChatPetHorizontalPosition(motion.left, geometry.bounds.minimumLeft, geometry.bounds.maximumLeft),
				};
				this._setThrowPosition(motion.left, motion.top);
			}
			if (shouldSettleChatPetThrow(startTime, now, motion.top, motion.y, geometry.floorTop)) {
				this._finishThrow();
				return;
			}
			if (wallImpact) {
				if (now < wallImpact.endsAt) {
					scheduleFrame();
					return;
				}

				motion = {
					...motion,
					x: -motion.x * THROW_WALL_RESTITUTION,
					y: -THROW_WALL_REBOUND_VELOCITY,
				};
				rotation = wallImpact.wall === 'left' ? -90 : 90;
				wallImpact = undefined;
				lastFrameTime = now;
				this._transientState.set('falling', undefined);
				scheduleFrame();
				return;
			}

			const elapsed = Math.min(THROW_MAX_FRAME_DURATION, Math.max(0, now - lastFrameTime));
			lastFrameTime = now;
			const previousLeft = motion.left;
			const previousTop = motion.top;
			const step = advanceChatPetThrow(motion, elapsed, geometry.bounds);
			motion = step;
			rotation += (motion.left - previousLeft) * THROW_ROTATION_PER_PIXEL;
			this._setThrowPosition(motion.left, motion.top);

			const landing = getChatPetThrowLanding(previousLeft, previousTop, motion.left, motion.top, geometry.displaySize, geometry.displaySize, geometry.platformLeft, geometry.platformRight, geometry.platformTop, geometry.floorTop);
			if (motion.y >= 0 && landing) {
				motion = {
					...motion,
					left: landing.left,
					top: landing.top,
				};
				this._setThrowPosition(motion.left, motion.top);
				this._finishThrow(true, landing);
				return;
			}

			if (step.wall) {
				this._throwWallImpact = step.wall;
				wallImpact = { wall: step.wall, endsAt: now + THROW_WALL_IMPACT_DURATION };
				this._setFacingDirection(step.wall);
				rotation = step.wall === 'left' ? -90 : 90;
				this._button.element.style.transform = `rotate(${rotation}deg)`;
				this._transientState.set('wallImpact', undefined);
				scheduleFrame();
				return;
			}

			this._button.element.style.transform = `rotate(${rotation}deg)`;
			scheduleFrame();
		};

		this._throwAnimation.value = animationDisposables;
		scheduleFrame();
	}

	private _setThrowPosition(left: number, top: number): void {
		this._button.element.style.left = `${left}px`;
		this._button.element.style.top = `${top}px`;
		this._button.element.style.right = 'auto';
		this._button.element.style.bottom = 'auto';
		this._hasCustomPosition = true;
	}

	private _getThrowSettleTarget(): { readonly top: number; readonly landsOnPlatform: true } {
		const geometry = this._getThrowGeometry();
		return {
			top: geometry.platformTop - geometry.displaySize,
			landsOnPlatform: true,
		};
	}

	private _finishThrow(announce = true, target?: { readonly top: number; readonly landsOnPlatform: boolean }): void {
		if (!this._button.element.classList.contains('throwing')) {
			return;
		}

		const resolvedTarget = target ?? this._getThrowSettleTarget();
		const wallImpact = this._throwWallImpact;
		this._throwWallImpact = undefined;
		this._throwGeometryDirty = false;
		this._throwAnimation.clear();
		this._button.element.style.transform = '';
		this._button.element.style.top = `${resolvedTarget.top}px`;
		this._button.element.classList.remove('throwing');
		this._fallLandsOnPlatform = resolvedTarget.landsOnPlatform;
		this._completeFall(announce, wallImpact);
	}

	private _isAirborne(): boolean {
		return this._button.element.classList.contains('falling') || this._button.element.classList.contains('throwing');
	}

	private _beginFall(): void {
		const top = Number.parseFloat(this._button.element.style.top);
		const target = this._getFallTarget();
		this._transientScheduler.cancel();
		this._throwAnimation.clear();
		this._throwWallImpact = undefined;
		this._throwGeometryDirty = false;
		this._button.element.style.transform = '';
		this._button.element.classList.remove('throwing');
		this._button.element.classList.remove('resisting', 'soft-resisting');
		this._fallLandsOnPlatform = target.landsOnPlatform;
		this._transientState.set('falling', undefined);
		this._isDragging.set(false, undefined);
		this._renderState('falling', true);
		this._button.element.style.transitionDuration = `${getChatPetFallDuration(target.top - top)}ms`;
		this._button.element.getBoundingClientRect();
		this._button.element.classList.add('falling');
		this._button.element.style.top = `${target.top}px`;
		if (this._motionReduced || Math.abs(target.top - top) <= POSITION_EPSILON) {
			this._finishFall();
		}
	}

	private _finishFall(announce = true): void {
		if (!this._button.element.classList.contains('falling')) {
			return;
		}
		this._button.element.classList.remove('falling');
		this._button.element.style.transitionDuration = '';
		this._completeFall(announce);
	}

	private _completeFall(announce: boolean, wallImpact?: ChatPetWall): void {
		if (this._fallLandsOnPlatform) {
			const respawned = this._respawnPhase === 'falling';
			this._respawnPhase = 'none';
			this._respawnPosition = undefined;
			const left = this._getCurrentLeft();
			this._setPlatformPosition(left);
			if (announce) {
				this._showTransientState('splat');
				if (respawned) {
					status(localize('chatPet.respawned', "The VS Code pet respawned"));
				} else if (wallImpact === 'left') {
					status(localize('chatPet.bouncedOffLeftWall', "The VS Code pet bounced off the left wall and landed on the chat input"));
				} else if (wallImpact === 'right') {
					status(localize('chatPet.bouncedOffRightWall', "The VS Code pet bounced off the right wall and landed on the chat input"));
				} else {
					status(localize('chatPet.landed', "The VS Code pet landed on the chat input"));
				}
			}
			return;
		}

		this._deathPosition = [
			Number.parseFloat(this._button.element.style.left),
			Number.parseFloat(this._button.element.style.top),
		];
		this._respawnPhase = 'none';
		this._respawnPosition = undefined;
		this._button.element.classList.add('hidden');
		this._button.element.tabIndex = -1;
		this._isDead.set(true, undefined);
		if (announce) {
			if (wallImpact === 'left') {
				status(localize('chatPet.bouncedOffLeftWallAndFell', "The VS Code pet bounced off the left wall, fell off, and will respawn automatically"));
			} else if (wallImpact === 'right') {
				status(localize('chatPet.bouncedOffRightWallAndFell', "The VS Code pet bounced off the right wall, fell off, and will respawn automatically"));
			} else {
				status(localize('chatPet.fellOff', "The VS Code pet fell off and will respawn automatically"));
			}
		}
	}

	private _showContextMenu(event: MouseEvent): void {
		this._contextMenuVisible = true;
		const onTheRun = this.chatPetService.onTheRun.get();
		const actions = new DisposableStore();
		this._contextMenuActions.value = actions;
		const stable = actions.add(new Action('chat.pet.variant.stable', localize('chatPet.variant.stable.action', "Stable Colors"), undefined, true, () => this.chatPetService.setVariant('stable')));
		stable.checked = this.chatPetService.variant.get() === 'stable';
		const insiders = actions.add(new Action('chat.pet.variant.insiders', localize('chatPet.variant.insiders.action', "Insiders Colors"), undefined, true, () => this.chatPetService.setVariant('insiders')));
		insiders.checked = this.chatPetService.variant.get() === 'insiders';
		const grow = actions.add(new Action('chat.pet.grow', localize('chatPet.grow.action', "Grow"), undefined, true, () => {
			const scale = getChatPetScale(this._scale, CHAT_PET_SCALE_STEP);
			this.chatPetService.setScale(scale);
			status(localize('chatPet.grew', "VS Code pet size: {0} percent", Math.round(scale * 100)));
		}));
		const shrink = actions.add(new Action('chat.pet.shrink', localize('chatPet.shrink.action', "Shrink"), undefined, this._scale > CHAT_PET_MIN_SCALE, () => {
			const scale = getChatPetScale(this._scale, -CHAT_PET_SCALE_STEP);
			this.chatPetService.setScale(scale);
			status(localize('chatPet.shrank', "VS Code pet size: {0} percent", Math.round(scale * 100)));
		}));
		const onTheRunAction = actions.add(new Action(
			'chat.pet.onTheRun',
			onTheRun ? localize('chatPet.comeBack.action', "Come Back") : localize('chatPet.goOnTheRun.action', "Go on the Run"),
			undefined,
			true,
			() => {
				this._transientState.set(undefined, undefined);
				this.chatPetService.setOnTheRun(!onTheRun);
			}
		));
		const interactionSeparator = new Separator();
		const appearanceSeparator = new Separator();
		this.contextMenuService.showContextMenu({
			getAnchor: () => new StandardMouseEvent(dom.getWindow(this._button.element), event),
			getActions: (): IAction[] => [
				onTheRunAction,
				interactionSeparator,
				grow,
				shrink,
				appearanceSeparator,
				stable,
				insiders,
			],
			onHide: () => {
				this._contextMenuVisible = false;
				if (this._contextMenuActions.value === actions) {
					this._contextMenuActions.clear();
				}
			},
		});
	}

	private _onKeyDown(event: KeyboardEvent): void {
		const hasPointerInteraction = this._isDragging.get() || this._dragMonitor.isMonitoring();
		if (!isChatPetKeyboardInteractionEnabled(this._enabled, this._isDead.get(), hasPointerInteraction, this._isAirborne(), this.chatPetService.onTheRun.get())) {
			return;
		}
		const keyboardEvent = new StandardKeyboardEvent(event);
		let direction = 0;
		let throwRequested = false;
		if (keyboardEvent.equals(KeyMod.Shift | KeyCode.LeftArrow)) {
			direction = -1;
			throwRequested = true;
		} else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.RightArrow)) {
			direction = 1;
			throwRequested = true;
		} else if (keyboardEvent.equals(KeyCode.LeftArrow)) {
			direction = -1;
		} else if (keyboardEvent.equals(KeyCode.RightArrow)) {
			direction = 1;
		} else {
			return;
		}

		this._wake();
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		const facingDirection = direction < 0 ? 'left' : 'right';
		if (this._transientState.get() === 'dizzy' || this._recordDirectionChange(facingDirection)) {
			return;
		}
		this._setFacingDirection(facingDirection);
		if (throwRequested && !this._motionReduced) {
			this._beginThrow({
				x: direction * THROW_KEYBOARD_HORIZONTAL_VELOCITY,
				y: -THROW_MIN_UPWARD_VELOCITY,
			});
			status(direction < 0
				? localize('chatPet.thrownLeft', "The VS Code pet was thrown toward the left wall")
				: localize('chatPet.thrownRight', "The VS Code pet was thrown toward the right wall"));
			return;
		}
		this._hopController.request(direction, this._motionReduced);
		status(direction < 0
			? localize('chatPet.movedLeft', "VS Code pet moved left")
			: localize('chatPet.movedRight', "VS Code pet moved right"));
	}

	private _getAriaLabel(onTheRun: boolean): string {
		return onTheRun
			? localize('chatPet.restore', "Bring back the VS Code pet")
			: localize('chatPet.interact', "Interact with the VS Code pet. Drag it around the chat, or flick it toward either side to throw it. Use the left and right arrow keys to make it hop, or hold Shift to throw it toward a wall. Use the context menu to put it on the run.");
	}

	private _getCurrentLeft(): number {
		return this._button.element.offsetLeft;
	}

	private _getDisplaySize(): number {
		return CHAT_PET_SOURCE_SIZE / 2 * this._scale;
	}

	private _setScale(scale: number): void {
		this._scale = scale;
		const displaySize = this._getDisplaySize();
		this._button.element.style.width = `${displaySize}px`;
		this._button.element.style.height = `${displaySize}px`;
		this._visual.style.transform = `scale(${scale})`;
		if (this._button.element.classList.contains('throwing')) {
			this._throwGeometryDirty = true;
		}
		if (this._isDead.get() || this._isDragging.get() || this._isAirborne()) {
			return;
		}
		if (this._fallLandsOnPlatform) {
			if (this._hasCustomPosition) {
				this._setPlatformPosition(this._getCurrentLeft());
			} else {
				this._setDefaultPlatformPosition();
			}
		} else {
			this._updateVerticalPosition();
			if (this._hasCustomPosition) {
				this._setHorizontalPosition(this._getCurrentLeft());
			} else {
				this._setDefaultHorizontalPosition();
			}
		}
	}

	private _setHorizontalPosition(left: number): boolean {
		const parentBounds = this._overlay.getBoundingClientRect();
		const bounds = this.dragBounds.getBoundingClientRect();
		const minimumLeft = bounds.left - parentBounds.left;
		const maximumLeft = bounds.right - parentBounds.left - this._getDisplaySize();
		const clampedLeft = getChatPetHorizontalPosition(left, minimumLeft, maximumLeft);
		this._button.element.style.left = `${clampedLeft}px`;
		this._button.element.style.right = 'auto';
		this._hasCustomPosition = true;
		this._updateSpeechBubblePosition();
		return clampedLeft !== left;
	}

	private _setDefaultHorizontalPosition(): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const inputBounds = this.dragBounds.getBoundingClientRect();
		const minimumLeft = inputBounds.left - overlayBounds.left;
		const maximumLeft = inputBounds.right - overlayBounds.left - this._getDisplaySize();
		this._button.element.style.left = `${getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft)}px`;
		this._button.element.style.right = 'auto';
		this._hasCustomPosition = false;
		this._updateSpeechBubblePosition();
	}

	private _getPlatformBounds(): { readonly left: number; readonly right: number; readonly top: number } {
		const hostBounds = this._overlay.getBoundingClientRect();
		const inputBounds = this.dragBounds.getBoundingClientRect();
		return {
			left: inputBounds.left,
			right: inputBounds.right,
			top: getChatPetPlatformTop(hostBounds.top, inputBounds.top, this._platformTopProvider?.()),
		};
	}

	private _updateVerticalPosition(): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const platformTop = this._getPlatformBounds().top;
		this._button.element.style.bottom = `calc(100% - ${platformTop - overlayBounds.top}px)`;
	}

	private _setPlatformPosition(left: number): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const platformBounds = this._getPlatformBounds();
		this._button.element.style.top = `${platformBounds.top - overlayBounds.top - this._getDisplaySize()}px`;
		this._button.element.style.bottom = 'auto';
		this._setHorizontalPosition(left);
	}

	private _setDefaultPlatformPosition(): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const platformBounds = this._getPlatformBounds();
		this._button.element.style.top = `${platformBounds.top - overlayBounds.top - this._getDisplaySize()}px`;
		this._button.element.style.bottom = 'auto';
		this._setDefaultHorizontalPosition();
	}

	private _showRespawnSequence(): void {
		this._button.element.classList.add('hidden');
		this._button.element.tabIndex = -1;
		const startsDespawning = this._respawnPhase === 'none';
		if (startsDespawning) {
			this._respawnPhase = 'despawning';
		}
		if (this._respawnPhase !== 'despawning' && this._respawnPhase !== 'respawning') {
			return;
		}
		this._respawnEffect.container.classList.remove('hidden');
		this._updateRespawnEffectPosition();
		this._startRespawnEffectAnimation();
		if (startsDespawning) {
			this._respawnEffectScheduler.schedule(this._motionReduced ? RESPAWN_EFFECT_REDUCED_MOTION_DURATION : RESPAWN_EFFECT_DURATION);
		}
	}

	private _updateRespawnEffectPosition(): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const movementBounds = this.movementBounds.getBoundingClientRect();
		const displaySize = this._getDisplaySize();
		let left: number;
		let top: number;
		if (this._respawnPhase === 'despawning') {
			if (!this._deathPosition) {
				return;
			}
			const minimumLeft = movementBounds.left - overlayBounds.left;
			const maximumLeft = movementBounds.right - overlayBounds.left - displaySize;
			const minimumTop = movementBounds.top - overlayBounds.top;
			const maximumTop = movementBounds.bottom - overlayBounds.top - displaySize;
			[left, top] = getChatPetDragPosition(this._deathPosition[0], this._deathPosition[1], minimumLeft, maximumLeft, minimumTop, maximumTop);
			this._deathPosition = [left, top];
		} else if (this._respawnPhase === 'respawning') {
			const inputBounds = this.dragBounds.getBoundingClientRect();
			const minimumLeft = inputBounds.left - overlayBounds.left;
			const maximumLeft = inputBounds.right - overlayBounds.left - displaySize;
			left = getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft);
			top = movementBounds.top - overlayBounds.top;
			this._respawnPosition = [left, top];
		} else {
			return;
		}
		this._respawnEffect.container.style.left = `${left}px`;
		this._respawnEffect.container.style.top = `${top}px`;
	}

	private _showRespawnEffect(): void {
		if (!this._enabled || !this._isDead.get() || this._respawnPhase !== 'despawning') {
			return;
		}
		this._respawnPhase = 'respawning';
		this._respawnAnimation.clear();
		this._updateRespawnEffectPosition();
		this._startRespawnEffectAnimation();
		this._respawnFallScheduler.schedule(this._motionReduced ? RESPAWN_EFFECT_REDUCED_MOTION_DURATION : RESPAWN_EFFECT_DURATION);
		status(localize('chatPet.respawning', "The VS Code pet is respawning"));
	}

	private _startRespawnEffectAnimation(): void {
		if (this._respawnPhase !== 'despawning' && this._respawnPhase !== 'respawning') {
			return;
		}
		const sources = getRespawnSpriteSources(this._variant);
		const source = this._motionReduced ? sources.reducedMotion : sources.animated;
		if (!isChatPetImageSource(this._respawnEffect.image, source.url)) {
			this._respawnAnimation.clear();
			this._respawnEffect.image.removeAttribute('src');
			this._respawnEffect.image.src = source.url;
			return;
		}
		if (this._respawnEffect.image.complete && this._respawnEffect.image.naturalWidth > 0) {
			this._respawnAnimation.clear();
			this._startSpriteAnimation(source, this._respawnEffect, this._respawnAnimation, undefined, this._respawnPhase === 'despawning');
		}
	}

	private _beginRespawnFall(): void {
		if (!this._enabled || !this._isDead.get() || this._respawnPhase !== 'respawning') {
			return;
		}
		this._respawnPhase = 'falling';
		this._respawnAnimation.clear();
		this._respawnEffect.container.classList.add('hidden');
		this._deathPosition = undefined;
		this._fallLandsOnPlatform = true;
		this._transientState.set('falling', undefined);
		this._button.element.classList.remove('falling', 'throwing', 'dragging', 'resisting', 'soft-resisting');
		this._button.element.style.transform = '';
		this._button.element.classList.remove('hidden');
		this._button.element.tabIndex = 0;
		if (!this._respawnPosition) {
			this._updateRespawnEffectPosition();
		}
		const [spawnLeft, spawnTop] = this._respawnPosition ?? [this._getCurrentLeft(), 0];
		this._button.element.style.left = `${spawnLeft}px`;
		this._button.element.style.right = 'auto';
		this._hasCustomPosition = false;
		const overlayBounds = this._overlay.getBoundingClientRect();
		const platformBounds = this._getPlatformBounds();
		const startTop = spawnTop;
		const targetTop = platformBounds.top - overlayBounds.top - this._getDisplaySize();
		this._button.element.style.top = `${startTop}px`;
		this._button.element.style.bottom = 'auto';
		this._button.element.style.transitionDuration = `${getChatPetFallDuration(targetTop - startTop)}ms`;
		this._renderState('falling', true);
		this._isDead.set(false, undefined);
		this._button.element.getBoundingClientRect();
		this._button.element.classList.add('falling');
		this._button.element.style.top = `${targetTop}px`;
		if (this._motionReduced || startTop === targetTop) {
			this._finishFall();
		}
	}

	private _updateSpeechBubblePosition(): void {
		const buttonBounds = this._button.element.getBoundingClientRect();
		const inputBounds = this.dragBounds.getBoundingClientRect();
		this._button.element.classList.toggle('speech-bubble-left', shouldPlaceChatPetSpeechBubbleLeft(this._renderedState, buttonBounds.right, inputBounds.right, this._scale));
		const wideSpriteOffset = getChatPetWideSpriteHorizontalOffset(this._renderedState, this._facingController.direction, buttonBounds.left, buttonBounds.right, inputBounds.left, inputBounds.right, this._scale);
		if (this._activeSprite) {
			this._activeSprite.container.style.transform = wideSpriteOffset === 0 ? '' : `translateX(${wideSpriteOffset}px)`;
		}
	}

	private _updateGaze(): void {
		if (!this._cursorPosition) {
			return;
		}

		const bounds = this._button.element.getBoundingClientRect();
		const facingDirection = this._facingController.update(this._cursorPosition[0], bounds.left + bounds.width / 2);
		if (this._button.element.dataset.facing !== facingDirection) {
			this._button.element.dataset.facing = facingDirection;
			this._recordDirectionChange(facingDirection);
		}
		const [x, y] = getChatPetGazeDirection(
			this._cursorPosition[0],
			this._cursorPosition[1],
			bounds.left + bounds.width / 2,
			bounds.top + bounds.height / 2,
		);
		for (const pupil of this._pupils) {
			pupil.style.transform = `translate(${x * 2}px, ${y * 2}px)`;
		}
	}

	private _snapFacingToCursor(): void {
		if (!this._cursorPosition) {
			return;
		}

		const bounds = this._button.element.getBoundingClientRect();
		this._setFacingDirection(this._facingController.snapToCursor(this._cursorPosition[0], bounds.left + bounds.width / 2));
	}

	private _setFacingDirection(direction: ChatPetFacingDirection): void {
		this._facingController.setDirection(direction);
		this._button.element.dataset.facing = direction;
	}

	private _recordDirectionChange(direction: ChatPetFacingDirection): boolean {
		if (!this._enabled || this._isDead.get() || this.chatPetService.onTheRun.get() || this._transientState.get() === 'dizzy') {
			return false;
		}
		if (!this._directionChangeController.record(direction, dom.getWindow(this._button.element).performance.now())) {
			return false;
		}

		this._setFacingDirection(direction);
		this._showTransientState('dizzy', false);
		status(localize('chatPet.dizzy', "The VS Code pet got dizzy"));
		return true;
	}

	private _startEnableAnimation(): void {
		this._button.element.classList.remove('hidden', 'exiting', 'entering');
		this._button.element.tabIndex = 0;
		this._restoreHorizontalPosition();
		this._button.element.getBoundingClientRect();
		this._gazeScheduler.schedule();
		if (!this._motionReduced) {
			this._button.element.classList.add('entering');
		}
	}

	private _restoreHorizontalPosition(): void {
		const overlayBounds = this._overlay.getBoundingClientRect();
		const inputBounds = this.dragBounds.getBoundingClientRect();
		const minimumLeft = inputBounds.left - overlayBounds.left;
		const maximumLeft = inputBounds.right - overlayBounds.left - this._getDisplaySize();
		const previousLeft = this._hasCustomPosition ? this._getCurrentLeft() : undefined;
		this._button.element.style.left = `${getChatPetRestoredHorizontalPosition(previousLeft, minimumLeft, maximumLeft)}px`;
		this._button.element.style.right = 'auto';
		this._updateSpeechBubblePosition();
	}

	private _startDisableAnimation(): void {
		if (this._button.element.classList.contains('throwing')) {
			this._finishThrow(false);
		}
		this._button.element.tabIndex = -1;
		this._button.element.classList.remove('entering');
		if (this._motionReduced || this._button.element.classList.contains('hidden')) {
			this._finishDisable();
			return;
		}
		this._button.element.classList.add('exiting');
	}

	private _finishDisable(): void {
		if (this._button.element.classList.contains('throwing')) {
			this._finishThrow(false);
		}
		if (this._button.element.classList.contains('falling')) {
			this._finishFall(false);
		}
		this._hopController.cancel();
		if (this._isDragging.get()) {
			this._isDragging.set(false, undefined);
		}
		this._throwAnimation.clear();
		this._throwGeometryDirty = false;
		this._button.element.style.transform = '';
		this._button.element.classList.remove('entering', 'exiting', 'falling', 'throwing', 'dragging', 'resisting', 'soft-resisting');
		this._button.element.style.transitionDuration = '';
		this._button.element.classList.add('hidden');
		this._respawnEffectScheduler.cancel();
		this._respawnFallScheduler.cancel();
		this._respawnAnimation.clear();
		this._respawnEffect.container.classList.add('hidden');
		this._respawnPhase = 'none';
		this._respawnPosition = undefined;
		this._spriteAnimation.clear();
		this._speechAnimation.clear();
		this._speechBubble.container.classList.add('hidden');
		this._speechBubble.image.removeAttribute('src');
		this._pendingSprite = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._activeSprite = undefined;
		this._renderedState = undefined;
		this._directionChangeController.reset();
		for (const sprite of this._sprites) {
			sprite.container.classList.add('hidden');
			sprite.image.removeAttribute('src');
		}
	}

	private _showTransientState(state: ChatPetState, snapFacingToCursor = true): void {
		if (!this.chatPetService.enabled.get()) {
			return;
		}

		if (snapFacingToCursor) {
			this._snapFacingToCursor();
		}
		this._wake();
		const renderedState = state === 'yapping' && this._motionReduced ? 'yappingMouthOpen' : state;
		this._transientState.set(renderedState, undefined);
		if (renderedState === 'yappingMouthOpen' || renderedState === 'yapping') {
			this._transientScheduler.cancel();
		} else {
			this._transientScheduler.schedule(getTransientStateDuration(renderedState));
		}
		if (!this._isDragging.get() && this._transientState.get() === renderedState) {
			this._renderState(renderedState, true);
		}
	}

	private _trySearch(): void {
		if (!this._enabled || !this.chatPetService.onTheRun.get()) {
			return;
		}
		if (this._motionReduced) {
			this._searchScheduler.schedule();
			return;
		}
		this._transientState.set('searching', undefined);
		this._renderState('searching', true);
		this._searchScheduler.schedule();
	}

	private _wake(): void {
		const wasSleeping = this._idleExpired.get() || this._renderedState === 'sleep';
		this._idleExpired.set(false, undefined);
		if (this._busy) {
			this._idleScheduler.cancel();
		} else {
			this._idleScheduler.schedule();
		}
		if (wasSleeping) {
			this._beginWakeAnimation();
		}
	}

	private _beginWakeAnimation(): ChatPetState | undefined {
		if (this._motionReduced) {
			return undefined;
		}

		this._transientState.set('waking', undefined);
		this._transientScheduler.schedule(WAKE_STATE_DURATION);
		return 'waking';
	}

	private _renderState(state: ChatPetState, restart = false, useStaticSprite = false): void {
		if (state !== 'idle' || useStaticSprite) {
			this._facingController.setState(state, useStaticSprite);
		}
		const sources = getSpriteSources(this._variant)[state];
		const source = this._motionReduced || useStaticSprite ? sources.reducedMotion : sources.animated;
		if (!restart && this._activeSprite && isChatPetImageSource(this._activeSprite.image, source.url)) {
			this._pendingSprite = undefined;
			this._pendingSource = undefined;
			this._pendingState = undefined;
			this._button.element.dataset.state = state;
			this._renderedState = state;
			this._setRenderedFacingState(state, useStaticSprite);
			this._updateEyes(state);
			this._updateSpeechBubble(state, restart);
			return;
		}

		const sprite = this._sprites.find(candidate => candidate !== this._activeSprite);
		if (!sprite) {
			return;
		}

		this._pendingSprite = sprite;
		this._pendingSource = source;
		this._pendingState = state;
		sprite.image.removeAttribute('src');
		sprite.image.src = source.url;
	}

	private _onImageLoad(sprite: ChatPetSpriteElement): void {
		if (sprite !== this._pendingSprite || this._pendingSource === undefined || !isChatPetImageSource(sprite.image, this._pendingSource.url) || this._pendingState === undefined) {
			return;
		}

		this._spriteAnimation.clear();
		this._activeSprite?.container.classList.add('hidden');
		sprite.container.classList.remove('hidden');
		this._activeSprite = sprite;
		const state = this._pendingState;
		this._startSpriteAnimation(
			this._pendingSource,
			sprite,
			this._spriteAnimation,
			() => this._onSpriteAnimationComplete(sprite, state),
			false,
			frameIndex => {
				if (sprite === this._activeSprite) {
					this._updateEyes(state, frameIndex);
				}
			}
		);
		this._button.element.dataset.state = state;
		this._renderedState = state;
		this._setRenderedFacingState(state, this._isDragging.get());
		this._updateEyes(state);
		this._updateSpeechBubble(state, true);
		this._pendingSprite = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._restartEyeAnimation();
	}

	private _setRenderedFacingState(state: ChatPetState, isDragging: boolean): void {
		this._facingController.setState(state, isDragging);
		if (!isDragging && doesChatPetStateTrackCursor(state)) {
			this._gazeScheduler.schedule();
		}
	}

	private _updateEyes(state: ChatPetState, frameIndex?: number): void {
		const blinking = doesChatPetStateBlink(state, frameIndex);
		this._eyes.classList.toggle('tracking', doesChatPetStateTrackCursor(state));
		this._eyes.classList.toggle('blinking', blinking);
		if (blinking) {
			for (const pupil of this._pupils) {
				pupil.style.transform = '';
			}
		}
	}

	private _onSpriteAnimationComplete(sprite: ChatPetSpriteElement, state: ChatPetState): void {
		if (sprite !== this._activeSprite) {
			return;
		}
		if (state === 'jump') {
			this._hopController.onAnimationComplete();
			return;
		}
		if (state !== 'searching' || !this.chatPetService.onTheRun.get()) {
			return;
		}
		this._transientState.set('searchingDown', undefined);
		this._button.element.dataset.state = 'searchingDown';
		this._renderedState = 'searchingDown';
	}

	private _startSpriteAnimation(source: ChatPetSpriteSource, sprite: ChatPetSpriteElement, animationDisposable: MutableDisposable<IDisposable>, onComplete?: () => void, reverse = false, onFrame?: (frameIndex: number) => void): void {
		const { frameDurations } = source;
		const { image, canvas } = sprite;
		const displaySize = sprite === this._speechBubble ? 72 : sprite === this._respawnEffect ? this._getDisplaySize() : 48;
		const frameHeight = source.frameHeight ?? CHAT_PET_SOURCE_SIZE;
		const displayScale = displaySize / CHAT_PET_SOURCE_SIZE;
		const displayWidth = source.frameWidth * displayScale;
		const displayHeight = frameHeight * displayScale;
		sprite.container.style.width = `${displayWidth}px`;
		sprite.container.style.height = `${displayHeight}px`;
		canvas.width = source.frameWidth;
		canvas.height = frameHeight;
		canvas.style.width = `${displayWidth}px`;
		canvas.style.height = `${displayHeight}px`;
		const context = canvas.getContext('2d');
		if (!context) {
			return;
		}
		context.imageSmoothingEnabled = false;
		const drawFrame = (frameIndex: number) => {
			context.clearRect(0, 0, source.frameWidth, frameHeight);
			const sourceX = frameIndex * source.frameWidth;
			if (source.fixedOrientationDecorations !== undefined && this._facingController.direction === 'left') {
				context.clearRect(0, 0, source.frameWidth, frameHeight);
				context.save();
				context.translate(source.frameWidth, 0);
				context.scale(-1, 1);
				context.drawImage(
					image,
					sourceX,
					0,
					source.frameWidth,
					frameHeight,
					0,
					0,
					source.frameWidth,
					frameHeight
				);
				context.restore();
				for (let decorationIndex = 0; decorationIndex < source.fixedOrientationDecorations.length; decorationIndex++) {
					const decoration = source.fixedOrientationDecorations[decorationIndex];
					const currentBounds = decoration.frameBounds[frameIndex];
					const canonicalBounds = decoration.frameBounds[decoration.sourceFrame];
					const [currentLeft, currentTop, currentRight, currentBottom] = currentBounds;
					const [canonicalLeft, canonicalTop, canonicalRight, canonicalBottom] = canonicalBounds;
					const canonicalWidth = canonicalRight - canonicalLeft;
					const canonicalHeight = canonicalBottom - canonicalTop;
					context.clearRect(source.frameWidth - currentRight, currentTop, currentRight - currentLeft, currentBottom - currentTop);
					context.drawImage(
						image,
						decoration.sourceFrame * source.frameWidth + canonicalLeft,
						canonicalTop,
						canonicalWidth,
						canonicalHeight,
						source.frameWidth - currentLeft - canonicalWidth,
						currentTop,
						canonicalWidth,
						canonicalHeight
					);
				}
				onFrame?.(frameIndex);
				return;
			}
			context.drawImage(
				image,
				sourceX,
				0,
				source.frameWidth,
				frameHeight,
				0,
				0,
				source.frameWidth,
				frameHeight
			);
			onFrame?.(frameIndex);
		};
		const initialFrameIndex = reverse && frameDurations.length > 0 ? frameDurations.length - 1 : 0;
		drawFrame(initialFrameIndex);
		if (frameDurations.length < 2) {
			return;
		}

		const targetWindow = dom.getWindow(canvas);
		const startTime = targetWindow.performance.now();
		let currentFrame = 0;
		let frameTimer: number | undefined;
		const animationDisposables = new DisposableStore();
		const clearFrameTimer = () => {
			if (frameTimer !== undefined) {
				targetWindow.clearTimeout(frameTimer);
				frameTimer = undefined;
			}
		};
		const scheduleFrame = (delay: number) => {
			clearFrameTimer();
			if (!targetWindow.document.hidden) {
				frameTimer = targetWindow.setTimeout(updateFrame, Math.max(1, Math.ceil(delay)));
			}
		};
		const updateFrame = () => {
			frameTimer = undefined;
			const frame = getChatPetAnimationFrame(frameDurations, targetWindow.performance.now() - startTime, source.iterations, reverse);
			if (frame.complete) {
				drawFrame(frame.frameIndex);
				animationDisposables.dispose();
				onComplete?.();
				return;
			}
			if (frame.frameIndex !== currentFrame) {
				currentFrame = frame.frameIndex;
				drawFrame(frame.frameIndex);
			}
			scheduleFrame(frame.nextFrameDelay);
		};
		animationDisposables.add(dom.addDisposableListener(targetWindow.document, 'visibilitychange', () => {
			clearFrameTimer();
			if (!targetWindow.document.hidden) {
				updateFrame();
			}
		}));
		animationDisposables.add(toDisposable(clearFrameTimer));
		scheduleFrame(frameDurations[initialFrameIndex]);
		animationDisposable.value = animationDisposables;
	}

	private _updateSpeechBubble(state: ChatPetState | undefined, restart = false): void {
		this._updateSpeechBubblePosition();
		const visible = doesChatPetStateSpeak(state);
		this._speechBubble.container.classList.toggle('hidden', !visible);
		if (!visible) {
			this._speechAnimation.clear();
			return;
		}

		const sources = getSpeechSpriteSources(this._variant);
		const source = this._motionReduced ? sources.reducedMotion : sources.animated;
		if (!isChatPetImageSource(this._speechBubble.image, source.url)) {
			this._speechAnimation.clear();
			this._speechBubble.image.removeAttribute('src');
			this._speechBubble.image.src = source.url;
			return;
		}
		if (restart && this._speechBubble.image.complete && this._speechBubble.image.naturalWidth > 0) {
			this._speechAnimation.clear();
			this._startSpriteAnimation(source, this._speechBubble, this._speechAnimation);
		}
	}

	private _restartEyeAnimation(): void {
		this._eyes.classList.remove('animated');
		this._eyes.getBoundingClientRect();
		if (!this._motionReduced) {
			this._eyes.classList.add('animated');
		}
	}
}
