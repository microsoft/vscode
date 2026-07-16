/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { IMouseWheelEvent, StandardWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatWidgetContrib, ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { MIN_PROMPTS, PROMPT_TIMELINE_CONTRIB_ID, PROMPT_TIMELINE_ENABLED_SETTING } from '../common/promptTimeline.js';
import { PromptTimelineModel, PromptEntry } from './promptTimelineModel.js';
import { IPromptTimelineRail } from './promptTimelineRail.js';
import { MIN_HOST_WIDTH, PromptTimelineRulerRail } from './promptTimelineRulerRail.js';

/** Normalized wheel distance (device-independent units, ~1 per notch) accumulated within {@link WHEEL_WINDOW_MS} to count as a hard/fast scroll. */
const HARD_WHEEL_DISTANCE = 20;
/** Rolling window for the wheel-velocity accumulator; a pause longer than this resets it. */
const WHEEL_WINDOW_MS = 120;

/**
 * Per-widget contribution that overlays a prompt timeline rail on the chat
 * transcript and exposes a navigation API for keyboard-driven commands. The rail
 * exists only while `sessions.promptTimeline.enabled` is set, and is torn down
 * and re-created when the enablement changes.
 */
export class PromptTimelineWidgetContrib extends Disposable implements IChatWidgetContrib {

	static readonly ID = PROMPT_TIMELINE_CONTRIB_ID;
	readonly id = PromptTimelineWidgetContrib.ID;

	private _model: PromptTimelineModel | undefined;
	private _rail: IPromptTimelineRail | undefined;

	/** Holds the model, rail and all their wiring while the feature is enabled. */
	private readonly _enablement = this._register(new DisposableStore());
	private _enabled = false;
	/** Latest tick count is at or above {@link MIN_PROMPTS}; combined with the host width to decide whether the rail replaces the native scrollbar. */
	private _hasEnoughPrompts = false;

	constructor(
		private readonly widget: IChatWidget,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// The rail only makes sense for the main chat transcript location.
		if (widget.location !== ChatAgentLocation.Chat) {
			return;
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PROMPT_TIMELINE_ENABLED_SETTING)) {
				this._updateRail();
			}
		}));
		this._updateRail();
	}

	/** Creates or disposes the rail to match the enablement setting. */
	private _updateRail(): void {
		const enabled = this.configurationService.getValue<boolean>(PROMPT_TIMELINE_ENABLED_SETTING) !== false;
		if (enabled === this._enabled) {
			return;
		}
		this._enabled = enabled;
		this._enablement.clear();
		this._model = undefined;
		this._rail = undefined;
		this._hasEnoughPrompts = false;
		if (enabled) {
			this._createRail();
		}
	}

	private _createRail(): void {
		// CONTRIBS always constructs contribs with the concrete widget.
		const model = this._enablement.add(this.instantiationService.createInstance(PromptTimelineModel, this.widget as ChatWidget));
		const rail: IPromptTimelineRail = this._enablement.add(new PromptTimelineRulerRail());
		this._model = model;
		this._rail = rail;

		this._mountRail(rail);

		rail.setFilesProvider(tick => model.getRequestFiles(tick));
		this._enablement.add(rail.onDidSelect(requestId => model.reveal(requestId)));
		// Dragging the rail lane scrubs the transcript (the rail is the scrollbar now, so it drives scroll).
		this._enablement.add(rail.onDidScrub(scrollTop => { (this.widget as ChatWidget).scrollTop = scrollTop; }));
		this._enablement.add(rail.onDidReview(tick => { void model.reviewChanges(tick); }));
		this._enablement.add(rail.onDidReviewFile(e => { void model.reviewChanges(e.tick, e.file); }));

		// A deliberate hard/fast scroll reveals the fan; capture phase so it is seen before the
		// transcript's ScrollableElement consumes the wheel mid-content (see `_registerHardWheelDetector`).
		this._enablement.add(this._registerHardWheelDetector(rail));

		this._enablement.add(autorun(reader => {
			const ticks = model.ticks.read(reader);
			// Toggle visibility before rendering so the rail's fit measurement in
			// setTicks runs against the displayed (non-zero height) element.
			this._hasEnoughPrompts = ticks.length >= MIN_PROMPTS;
			rail.domNode.classList.toggle('hidden', !this._hasEnoughPrompts);
			this._updateNativeScrollbarHidden();
			rail.setTicks(ticks);
		}));

		this._enablement.add(autorun(reader => {
			rail.setActive(model.activeRequestId.read(reader));
		}));

		// Supply proportional scroll positions for the marks and viewport thumb.
		this._enablement.add(autorun(reader => {
			model.onDidChangeScrollLayout.read(reader);
			rail.setScrollLayout(model.getScrollLayout());
		}));
	}

	private _mountRail(rail: IPromptTimelineRail): void {
		const railNode = rail.domNode;
		const host = this.widget.domNode;
		// Anchor the absolutely-positioned overlay to the chat widget via a class
		// we own, removed on teardown so we never leave the foreign container mutated.
		host.classList.add('prompt-timeline-host');
		this._enablement.add(toDisposable(() => host.classList.remove('prompt-timeline-host', 'prompt-timeline-active')));
		host.appendChild(railNode);
		this._enablement.add(toDisposable(() => railNode.remove()));

		// Keep the rail above the input part so it only spans the transcript.
		const inputPart = this.widget.inputPart;
		this._enablement.add(autorun(reader => {
			railNode.style.setProperty('--prompt-timeline-bottom', `${inputPart.height.read(reader)}px`);
		}));

		// Report the host width so the rail can hide on very narrow transcripts, and keep the native
		// scrollbar whenever the rail is too narrow to replace it.
		const ResizeObserverCtor = getWindow(host).ResizeObserver;
		if (ResizeObserverCtor) {
			const observer = new ResizeObserverCtor(() => {
				rail.setHostWidth(host.clientWidth);
				this._updateNativeScrollbarHidden();
			});
			observer.observe(host);
			this._enablement.add(toDisposable(() => observer.disconnect()));
		}
		rail.setHostWidth(host.clientWidth);
		this._updateNativeScrollbarHidden();
	}

	/**
	 * Detects a deliberate hard/fast scroll from wheel velocity and tells the rail (it only blooms if a
	 * real scroll movement follows, so flicking against a scroll limit never opens it). Deltas are
	 * normalized via {@link StandardWheelEvent} so line-mode devices are not stuck below the threshold,
	 * and the listener is on the capture phase so it is seen before the transcript's ScrollableElement
	 * consumes the wheel mid-content.
	 */
	private _registerHardWheelDetector(rail: IPromptTimelineRail): IDisposable {
		let wheelAcc = 0;
		let wheelWindowStart = 0;
		return addDisposableListener(this.widget.domNode, EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
			const now = Date.now();
			if (now - wheelWindowStart > WHEEL_WINDOW_MS) {
				wheelAcc = 0;
				wheelWindowStart = now;
			}
			wheelAcc += Math.abs(new StandardWheelEvent(e).deltaY);
			if (wheelAcc >= HARD_WHEEL_DISTANCE) {
				wheelAcc = 0;
				rail.notifyHardWheel();
			}
		}, { capture: true, passive: true });
	}

	/** Hide the transcript's native scrollbar only while the rail is actually acting as it: enough prompts AND wide enough (below {@link MIN_HOST_WIDTH} the rail hides, so the native slider must stay). */
	private _updateNativeScrollbarHidden(): void {
		const active = this._hasEnoughPrompts && this.widget.domNode.clientWidth >= MIN_HOST_WIDTH;
		this.widget.domNode.classList.toggle('prompt-timeline-active', active);
	}

	// -- Navigation API (used by promptTimelineActions) --

	/** All user prompts for the picker (every prompt, not just the bucketed ticks). */
	getAllPrompts(): readonly PromptEntry[] {
		return this._model?.getAllPrompts() ?? [];
	}

	reveal(requestId: string): void {
		this._model?.reveal(requestId);
		this._rail?.focusTick(requestId);
	}
}
