/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatContextUsageWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { EventType, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { IDelayedHoverOptions } from '../../../../../../base/browser/ui/hover/hover.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatContextUsageDetails, IChatContextUsageData } from './chatContextUsageDetails.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';

const $ = dom.$;

/**
 * A reusable circular progress indicator that displays a pie chart.
 * The pie fills clockwise from the top based on the percentage value.
 */
export class CircularProgressIndicator {

	readonly domNode: SVGSVGElement;

	private readonly progressPie: SVGPathElement;

	private static readonly CENTER_X = 18;
	private static readonly CENTER_Y = 18;
	private static readonly RADIUS = 16;

	constructor() {
		this.domNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.domNode.setAttribute('viewBox', '0 0 36 36');
		this.domNode.classList.add('circular-progress');

		// Background circle (outline only)
		const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		bgCircle.setAttribute('cx', String(CircularProgressIndicator.CENTER_X));
		bgCircle.setAttribute('cy', String(CircularProgressIndicator.CENTER_Y));
		bgCircle.setAttribute('r', String(CircularProgressIndicator.RADIUS));
		bgCircle.classList.add('progress-bg');
		this.domNode.appendChild(bgCircle);

		// Progress pie (filled arc)
		this.progressPie = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		this.progressPie.classList.add('progress-pie');
		this.domNode.appendChild(this.progressPie);
	}

	/**
	 * Updates the pie chart to display the given percentage (0-100).
	 * @param percentage The percentage of the pie to fill (clamped to 0-100)
	 */
	setProgress(percentage: number): void {
		const cx = CircularProgressIndicator.CENTER_X;
		const cy = CircularProgressIndicator.CENTER_Y;
		const r = CircularProgressIndicator.RADIUS;

		if (percentage >= 100) {
			// Full circle - use a circle element's path equivalent
			this.progressPie.setAttribute('d', `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`);
		} else if (percentage <= 0) {
			// Empty - no path
			this.progressPie.setAttribute('d', '');
		} else {
			// Calculate the arc endpoint
			const angle = (percentage / 100) * 360;
			const radians = (angle - 90) * (Math.PI / 180); // Start from top (-90 degrees)
			const x = cx + r * Math.cos(radians);
			const y = cy + r * Math.sin(radians);
			const largeArcFlag = angle > 180 ? 1 : 0;

			// Create pie slice path: move to center, line to top, arc to endpoint, close
			const d = [
				`M ${cx} ${cy}`,           // Move to center
				`L ${cx} ${cy - r}`,       // Line to top
				`A ${r} ${r} 0 ${largeArcFlag} 1 ${x} ${y}`, // Arc to endpoint
				'Z'                         // Close path back to center
			].join(' ');

			this.progressPie.setAttribute('d', d);
		}
	}
}

/**
 * Widget that displays the context/token usage for the current chat session.
 * Shows a circular progress icon that expands on hover/focus to show token counts,
 * and on click shows the detailed context usage widget.
 */
export class ChatContextUsageWidget extends Disposable {

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	readonly domNode: HTMLElement;

	private readonly progressIndicator: CircularProgressIndicator;

	private readonly _isVisible = observableValue<boolean>(this, false);
	get isVisible(): IObservable<boolean> { return this._isVisible; }

	private readonly _lastRequestDisposable = this._register(new MutableDisposable());
	private readonly _hoverDisposable = this._register(new MutableDisposable<DisposableStore>());
	private readonly _contextUsageDetails = this._register(new MutableDisposable<ChatContextUsageDetails>());

	private currentData: IChatContextUsageData | undefined;

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();

		this.domNode = $('.chat-context-usage-widget');
		this.domNode.style.display = 'none';
		this.domNode.setAttribute('tabindex', '0');
		this.domNode.setAttribute('role', 'button');
		this.domNode.setAttribute('aria-label', localize('contextUsageLabel', "Context window usage"));

		// Icon container (always visible, contains the pie chart)
		const iconContainer = this.domNode.appendChild($('.icon-container'));
		this.progressIndicator = new CircularProgressIndicator();
		iconContainer.appendChild(this.progressIndicator.domNode);

		// Set up hover - will be configured when data is available
		this.setupHover();
	}

	private setupHover(): void {
		this._hoverDisposable.clear();
		const store = new DisposableStore();
		this._hoverDisposable.value = store;

		const createDetails = (): ChatContextUsageDetails | undefined => {
			if (!this._isVisible.get() || !this.currentData) {
				return undefined;
			}
			this._contextUsageDetails.value = this.instantiationService.createInstance(ChatContextUsageDetails);
			this._contextUsageDetails.value.update(this.currentData);
			return this._contextUsageDetails.value;
		};

		const hoverOptions: Omit<IDelayedHoverOptions, 'content'> = {
			appearance: { showPointer: true, compact: true },
			persistence: { hideOnHover: false },
			trapFocus: true
		};

		store.add(this.hoverService.setupDelayedHover(this.domNode, () => ({
			...hoverOptions,
			content: createDetails()?.domNode ?? ''
		})));

		const showStickyHover = () => {
			const details = createDetails();
			if (details) {
				this.hoverService.showInstantHover(
					{ ...hoverOptions, content: details.domNode, target: this.domNode, persistence: { hideOnHover: false, sticky: true } },
					true
				);
			}
		};

		// Show sticky + focused hover on click
		store.add(addDisposableListener(this.domNode, EventType.CLICK, e => {
			e.stopPropagation();
			showStickyHover();
		}));

		// Show sticky + focused hover on keyboard activation (Space/Enter)
		store.add(addDisposableListener(this.domNode, EventType.KEY_DOWN, e => {
			const evt = new StandardKeyboardEvent(e);
			if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
				e.preventDefault();
				showStickyHover();
			}
		}));
	}

	/**
	 * Updates the widget with the latest request/response data.
	 * The model is retrieved from the request's modelId.
	 * @param lastRequest The last request in the session
	 */
	update(lastRequest: IChatRequestModel | undefined): void {
		this._lastRequestDisposable.clear();

		if (!lastRequest?.response || !lastRequest.modelId) {
			this.hide();
			return;
		}

		const response = lastRequest.response;
		const modelId = lastRequest.modelId;

		// Update immediately if usage data is already available
		this.updateFromResponse(response, modelId);

		// Subscribe to response changes to update whenever usage data changes
		this._lastRequestDisposable.value = response.onDidChange(() => {
			this.updateFromResponse(response, modelId);
		});
	}

	private updateFromResponse(response: IChatResponseModel, modelId: string): void {
		const usage = response.usage;
		const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
		const maxInputTokens = modelMetadata?.maxInputTokens;

		if (!usage || !maxInputTokens || maxInputTokens <= 0) {
			this.hide();
			return;
		}

		const promptTokens = usage.promptTokens;
		const promptTokenDetails = usage.promptTokenDetails;
		const percentage = Math.min(100, (promptTokens / maxInputTokens) * 100);

		this.render(percentage, promptTokens, maxInputTokens, promptTokenDetails);
		this.show();
	}

	private render(percentage: number, promptTokens: number, maxTokens: number, promptTokenDetails?: readonly { category: string; label: string; percentageOfPrompt: number }[]): void {
		// Store current data for use in details popup
		this.currentData = { promptTokens, maxInputTokens: maxTokens, percentage, promptTokenDetails };

		// Update pie chart progress
		this.progressIndicator.setProgress(percentage);

		// Update color based on usage level
		this.domNode.classList.remove('warning', 'error');
		if (percentage >= 90) {
			this.domNode.classList.add('error');
		} else if (percentage >= 75) {
			this.domNode.classList.add('warning');
		}
	}

	private show(): void {
		if (this.domNode.style.display === 'none') {
			this.domNode.style.display = '';
			this._isVisible.set(true, undefined);
			this._onDidChangeVisibility.fire();
		}
	}

	private hide(): void {
		if (this.domNode.style.display !== 'none') {
			this.domNode.style.display = 'none';
			this._isVisible.set(false, undefined);
			this._onDidChangeVisibility.fire();
		}
	}
}
