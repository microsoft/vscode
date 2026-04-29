/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CharacterAvatar, CharacterPose } from './characterAvatar.js';

/** How long the celebrate pose plays after a request completes. */
const CELEBRATE_DURATION_MS = 1500;

/** Minimum and maximum walking speed (px/sec). */
const WALK_SPEED_MIN = 22;
const WALK_SPEED_MAX = 38;

/** Margin from the edges of the stage where the character starts to turn. */
const WALK_MARGIN = 4;

/**
 * Drives the character's movement and pose based on chat state. Owns a single
 * RAF loop. Internal sprite animation lives in pixi (see {@link CharacterAvatar.tick});
 * this class only handles stage-level positioning and pose selection.
 */
export class CharacterBehavior extends Disposable {

	private readonly avatar: CharacterAvatar;
	private readonly stage: HTMLElement;

	private bounds = { width: 0, height: 0 };
	/** Character's center-x in stage pixels. */
	private x = 0;
	/** Character's baseline y in stage pixels (we anchor the feet near the floor). */
	private y = 0;
	/** Smoothed facing in [-1, 1]; sign(velocity) is the target. */
	private facing = 1;
	/** Walk velocity in px/sec; sign indicates direction. */
	private vx = 0;

	private rafDisposable: IDisposable | undefined;
	private lastFrame = performance.now();

	private currentPose: CharacterPose = CharacterPose.Idle;
	/** Timestamp the celebrate flash should release at. */
	private celebrateUntil = 0;

	private lastSeenInProgress = false;

	constructor(
		stage: HTMLElement,
		avatar: CharacterAvatar,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
		this.stage = stage;
		this.avatar = avatar;

		this.updateBounds();
		this.x = this.bounds.width / 2;
		this.y = this.bounds.height - 24;
		// Pick a random initial walk direction.
		this.vx = (Math.random() < 0.5 ? -1 : 1) * randomBetween(WALK_SPEED_MIN, WALK_SPEED_MAX);

		const targetWindow = getWindow(stage);
		const resizeObserver = new ResizeObserver(() => this.updateBounds());
		resizeObserver.observe(stage);
		this._register({ dispose: () => resizeObserver.disconnect() });

		// Derived state from the active chat model.
		const activeSessionResourceObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.resource;
		});

		const activeChatResourceObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.activeChat.read(reader)?.resource;
		});

		const chatStateObs = derived<{ inProgress: boolean; needsInput: boolean }>(reader => {
			const chatResource = activeChatResourceObs.read(reader)
				?? activeSessionResourceObs.read(reader);
			if (!chatResource) {
				return { inProgress: false, needsInput: false };
			}
			const model = this.chatService.getSession(chatResource);
			if (!model) {
				return { inProgress: false, needsInput: false };
			}
			const inProgress = model.requestInProgress.read(reader);
			const needsInput = model.requestNeedsInput.read(reader) !== undefined;
			return { inProgress, needsInput };
		});

		const newChatSessionContextObs = observableContextKey<boolean>(IsNewChatSessionContext.key, contextKeyService);

		this._register(autorun(reader => {
			const state = chatStateObs.read(reader);
			const isNewSession = newChatSessionContextObs.read(reader) ?? true;

			// Detect "request just completed" -> trigger a celebrate.
			if (this.lastSeenInProgress && !state.inProgress && !state.needsInput) {
				this.celebrateUntil = performance.now() + CELEBRATE_DURATION_MS;
				this.currentPose = CharacterPose.Celebrate;
				this.avatar.applyPose(CharacterPose.Celebrate);
			}
			this.lastSeenInProgress = state.inProgress;

			// Compute the desired steady-state pose.
			let target: CharacterPose;
			if (state.needsInput) {
				target = CharacterPose.Jump;
			} else if (state.inProgress) {
				target = CharacterPose.Type;
			} else if (isNewSession) {
				target = CharacterPose.Walk;
			} else {
				target = CharacterPose.Idle;
			}

			// Don't override the celebrate flash mid-flight.
			if (performance.now() < this.celebrateUntil && this.currentPose === CharacterPose.Celebrate) {
				return;
			}
			this.setPose(target);
		}));

		const tick = () => {
			const now = performance.now();
			const dt = Math.min(now - this.lastFrame, 100) / 1000;
			this.lastFrame = now;
			this.update(now, dt);
			this.rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
		};
		this.rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
		this._register({ dispose: () => this.rafDisposable?.dispose() });
	}

	/** External force-refresh (used after toggling visibility). */
	resetPosition(): void {
		this.updateBounds();
		this.x = this.bounds.width / 2;
		this.y = this.bounds.height - 24;
		this.avatar.setPosition(this.x - this.avatarHalfWidth(), this.y - this.avatarHeight(), this.facing);
	}

	private setPose(pose: CharacterPose): void {
		if (this.currentPose === pose) {
			return;
		}
		this.currentPose = pose;
		this.avatar.applyPose(pose);
	}

	private updateBounds(): void {
		this.bounds.width = this.stage.clientWidth;
		this.bounds.height = this.stage.clientHeight;
	}

	private avatarWidth(): number {
		// Avatar element is square and sized via CSS - query computed style once
		// per frame is fine, but cheaper: read offsetWidth (no forced layout
		// because the avatar's geometry doesn't change between frames).
		return this.avatar.element.offsetWidth || 56;
	}

	private avatarHalfWidth(): number {
		return this.avatarWidth() / 2;
	}

	private avatarHeight(): number {
		return this.avatar.element.offsetHeight || 56;
	}

	private update(now: number, dt: number): void {
		switch (this.currentPose) {
			case CharacterPose.Walk:
				this.updateWalk(dt);
				break;
			default:
				// Stationary poses: keep position fixed; pixi handles internal animation.
				break;
		}

		this.avatar.setPosition(this.x - this.avatarHalfWidth(), this.y - this.avatarHeight(), this.facing);
	}

	private updateWalk(dt: number): void {
		const halfW = this.avatarHalfWidth();
		this.x += this.vx * dt;
		// Bounce off the stage edges.
		if (this.x - halfW < WALK_MARGIN) {
			this.x = halfW + WALK_MARGIN;
			this.vx = Math.abs(this.vx);
		} else if (this.x + halfW > this.bounds.width - WALK_MARGIN) {
			this.x = this.bounds.width - halfW - WALK_MARGIN;
			this.vx = -Math.abs(this.vx);
		}
		// Occasionally vary the speed for a less mechanical pace.
		if (Math.random() < 0.005) {
			const speed = randomBetween(WALK_SPEED_MIN, WALK_SPEED_MAX);
			this.vx = Math.sign(this.vx) * speed;
		}
		// Ease facing toward sign(vx).
		const targetFacing = this.vx >= 0 ? 1 : -1;
		const turnRate = 8;
		const k = 1 - Math.exp(-turnRate * dt);
		this.facing += (targetFacing - this.facing) * k;
	}
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}
