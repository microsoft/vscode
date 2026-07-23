/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { IMouseWheelEvent, StandardWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatWidgetContrib, ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { MIN_PROMPTS, PROMPT_TIMELINE_CONTRIB_ID, PROMPT_TIMELINE_RAIL_SETTING, PROMPT_TIMELINE_STICKY_HEADER_SETTING } from '../common/promptTimeline.js';
import { PromptTimelineModel } from './promptTimelineModel.js';
import { IPromptTimelineRail } from './promptTimelineRail.js';
import { PromptTimelineRulerRail } from './promptTimelineRulerRail.js';
import { PromptTimelineStickyHeader } from './promptTimelineStickyHeader.js';

/** Normalized wheel distance (device-independent units, ~1 per notch) accumulated within {@link WHEEL_WINDOW_MS} to count as a hard/fast scroll. */
const HARD_WHEEL_DISTANCE = 20;
/** Rolling window for the wheel-velocity accumulator; a pause longer than this resets it. */
const WHEEL_WINDOW_MS = 120;

/**
 * Per-widget contribution that overlays the prompt timeline on the chat transcript. It shows the rail
 * and/or the sticky header depending on `sessions.promptTimeline.rail` and
 * `sessions.promptTimeline.stickyHeader`, and is torn down and re-created when either setting changes.
 */
export class PromptTimelineWidgetContrib extends Disposable implements IChatWidgetContrib {

	static readonly ID = PROMPT_TIMELINE_CONTRIB_ID;
	readonly id = PromptTimelineWidgetContrib.ID;

	private _rail: IPromptTimelineRail | undefined;

	/** Holds the model and every surface's wiring while at least one surface is enabled. */
	private readonly _enablement = this._register(new DisposableStore());

	constructor(
		private readonly widget: IChatWidget,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		// The timeline only makes sense for the main chat transcript location.
		if (widget.location !== ChatAgentLocation.Chat) {
			return;
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PROMPT_TIMELINE_RAIL_SETTING)
				|| e.affectsConfiguration(PROMPT_TIMELINE_STICKY_HEADER_SETTING)) {
				this._update();
			}
		}));
		this._update();
	}

	/** (Re)builds the timeline to match the current settings, or tears it down if no surface is enabled. */
	private _update(): void {
		this._enablement.clear();
		this._rail = undefined;
		const railEnabled = this.configurationService.getValue<boolean>(PROMPT_TIMELINE_RAIL_SETTING) === true;
		const stickyEnabled = this.configurationService.getValue<boolean>(PROMPT_TIMELINE_STICKY_HEADER_SETTING) === true;
		if (railEnabled || stickyEnabled) {
			this._createFeature(railEnabled, stickyEnabled);
		}
	}

	/**
	 * Builds the model shared by both surfaces, mounts the host anchor, then creates whichever surfaces
	 * are enabled: the rail beside the transcript and/or the sticky header at the top. Each is
	 * independently toggleable, so header-only and rail-only configurations both work.
	 */
	private _createFeature(railEnabled: boolean, stickyEnabled: boolean): void {
		// CONTRIBS always constructs contribs with the concrete widget.
		const model = this._enablement.add(this.instantiationService.createInstance(PromptTimelineModel, this.widget as ChatWidget));

		// The host class provides the positioning context and layout variables both surfaces anchor to.
		const host = this.widget.domNode;
		host.classList.add('prompt-timeline-host');
		this._enablement.add(toDisposable(() => host.classList.remove('prompt-timeline-host', 'prompt-timeline-with-rail')));

		// Keep the rail informed of the host width so it can hide its marks when the transcript is too
		// narrow to fit them beside the native scrollbar.
		const ResizeObserverCtor = getWindow(host).ResizeObserver;
		if (ResizeObserverCtor) {
			const observer = new ResizeObserverCtor(() => {
				this._rail?.setHostWidth(host.clientWidth);
			});
			observer.observe(host);
			this._enablement.add(toDisposable(() => observer.disconnect()));
		}

		if (railEnabled) {
			this._createRail(model, host);
		}
		if (stickyEnabled) {
			this._createStickyHeader(model);
		}
	}

	private _createRail(model: PromptTimelineModel, host: HTMLElement): void {
		const rail: IPromptTimelineRail = this._enablement.add(new PromptTimelineRulerRail());
		this._rail = rail;
		host.classList.add('prompt-timeline-with-rail');
		host.appendChild(rail.domNode);
		this._enablement.add(toDisposable(() => rail.domNode.remove()));

		rail.setFilesProvider(tick => model.getRequestFiles(tick));
		this._enablement.add(rail.onDidSelect(requestId => model.reveal(requestId)));
		this._enablement.add(rail.onDidReview(tick => { void model.reviewChanges(tick); }));
		this._enablement.add(rail.onDidReviewFile(e => { void model.reviewChanges(e.tick, e.file); }));

		// A deliberate hard/fast scroll reveals the fan; capture phase so it is seen before the
		// transcript's ScrollableElement consumes the wheel mid-content (see `_registerHardWheelDetector`).
		this._enablement.add(this._registerHardWheelDetector(rail));

		// Keep the rail above the input part so it only spans the transcript.
		const inputPart = this.widget.inputPart;
		this._enablement.add(autorun(reader => {
			rail.domNode.style.setProperty('--prompt-timeline-bottom', `${inputPart.height.read(reader)}px`);
		}));

		this._enablement.add(autorun(reader => {
			const ticks = model.ticks.read(reader);
			// Toggle visibility before rendering so the rail's fit measurement in
			// setTicks runs against the displayed (non-zero height) element.
			rail.domNode.classList.toggle('hidden', ticks.length < MIN_PROMPTS);
			rail.setTicks(ticks);
		}));

		this._enablement.add(autorun(reader => {
			rail.setActive(model.activeRequestId.read(reader));
		}));

		// Supply proportional scroll positions for the marks.
		this._enablement.add(autorun(reader => {
			model.onDidChangeScrollLayout.read(reader);
			rail.setScrollLayout(model.getScrollLayout());
		}));

		rail.setHostWidth(host.clientWidth);
	}

	/**
	 * Mounts the flat sticky header that pins the current prompt to the top of the transcript. It shows
	 * only once that prompt's row has scrolled above the viewport (via {@link PromptTimelineModel.activePinned}).
	 * Its previous/next toolbar actions step through prompts; activating the label opens Go to Symbol
	 * (`@`), whose built-in chat support lists this transcript's prompts so any of them can be jumped to.
	 */
	private _createStickyHeader(model: PromptTimelineModel): void {
		const sticky = this._enablement.add(this.instantiationService.createInstance(PromptTimelineStickyHeader, this.widget.domNode));
		this._enablement.add(sticky.onDidActivate(() => {
			// Launch the standard Go to Symbol command. Its built-in chat handling lists the focused
			// chat's prompts (the sticky header lives inside the chat, so it holds focus on click), and
			// it opens with `ItemActivation.NONE` so nothing is previewed/revealed until the user picks.
			void this.commandService.executeCommand('workbench.action.gotoSymbol');
		}));
		this._enablement.add(sticky.onDidNavigate(delta => model.navigate(delta)));
		this._enablement.add(autorun(reader => {
			// Drive the header from the unbucketed active prompt so the label and N/M position match
			// the real prompt list (the rail's ticks are bucketed/capped and would misreport long chats).
			const active = model.activePrompt.read(reader);
			const pinned = model.activePinned.read(reader);
			if (active) {
				sticky.update(active.text, active.index, active.total);
			}
			// The header reveals once its prompt is pinned above the viewport; it is independent of the
			// rail, so a narrow transcript (where the rail hides) still gets the header.
			sticky.setVisible(pinned && !!active && active.total >= MIN_PROMPTS);
		}));
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
}
