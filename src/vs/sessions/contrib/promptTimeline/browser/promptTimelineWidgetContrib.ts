/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatWidgetContrib, ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { MIN_PROMPTS, PROMPT_TIMELINE_CONTRIB_ID, PROMPT_TIMELINE_ENABLED_SETTING } from '../common/promptTimeline.js';
import { PromptTimelineModel, PromptEntry } from './promptTimelineModel.js';
import { IPromptTimelineRail } from './promptTimelineRail.js';
import { PromptTimelineRulerRail } from './promptTimelineRulerRail.js';

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
		this._enablement.add(rail.onDidReview(tick => { void model.reviewChanges(tick); }));
		this._enablement.add(rail.onDidReviewFile(e => { void model.reviewChanges(e.tick, e.file); }));

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
		this._enablement.add(toDisposable(() => host.classList.remove('prompt-timeline-host')));
		host.appendChild(railNode);
		this._enablement.add(toDisposable(() => railNode.remove()));

		// Keep the rail above the input part so it only spans the transcript.
		const inputPart = this.widget.inputPart;
		this._enablement.add(autorun(reader => {
			railNode.style.setProperty('--prompt-timeline-bottom', `${inputPart.height.read(reader)}px`);
		}));

		// Report the host width so the rail can hide on very narrow transcripts.
		const ResizeObserverCtor = getWindow(host).ResizeObserver;
		if (ResizeObserverCtor) {
			const observer = new ResizeObserverCtor(() => rail.setHostWidth(host.clientWidth));
			observer.observe(host);
			this._enablement.add(toDisposable(() => observer.disconnect()));
		}
		rail.setHostWidth(host.clientWidth);
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
