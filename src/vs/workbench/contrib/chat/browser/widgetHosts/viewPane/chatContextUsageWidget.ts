/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatContextUsageWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { EventType, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';

const $ = dom.$;

/**
 * Widget that displays the context/token usage for the current chat session.
 * Shows the prompt tokens used in the last message as a percentage of the model's context window.
 */
export class ChatContextUsageWidget extends Disposable {

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	readonly domNode: HTMLElement;

	private progressRing: SVGCircleElement;

	private readonly _isVisible = observableValue<boolean>(this, false);
	get isVisible(): IObservable<boolean> { return this._isVisible; }

	private readonly _lastRequestDisposable = this._register(new MutableDisposable());
	private readonly _managedHover: IManagedHover;

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();

		this.domNode = $('.chat-context-usage-widget.action-label');
		this.domNode.style.display = 'none';
		this.domNode.setAttribute('tabindex', '0');
		this.domNode.setAttribute('role', 'button');

		// Create the circular progress indicator
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 36 36');
		svg.classList.add('circular-progress');

		// Background circle
		const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		bgCircle.setAttribute('cx', '18');
		bgCircle.setAttribute('cy', '18');
		bgCircle.setAttribute('r', '16');
		bgCircle.classList.add('progress-bg');
		svg.appendChild(bgCircle);

		// Progress circle
		this.progressRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		this.progressRing.setAttribute('cx', '18');
		this.progressRing.setAttribute('cy', '18');
		this.progressRing.setAttribute('r', '16');
		this.progressRing.classList.add('progress-ring');
		svg.appendChild(this.progressRing);

		this.domNode.appendChild(svg);

		// Set up the managed hover once - we'll update its content when needed
		this._managedHover = this._register(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			this.domNode,
			''
		));

		// Show hover on click as well
		this._register(addDisposableListener(this.domNode, EventType.CLICK, () => {
			this._managedHover.show(true);
		}));

		// Show hover on Enter/Space for keyboard accessibility
		this._register(addDisposableListener(this.domNode, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._managedHover.show(true);
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

		// Subscribe to response changes to update when the response completes
		this._lastRequestDisposable.value = autorun(reader => {
			const isComplete = !response.isInProgress.read(reader);
			if (isComplete) {
				this.updateFromResponse(response, modelId);
			}
		});

		// Also do an initial update if already complete
		if (response.isComplete) {
			this.updateFromResponse(response, modelId);
		}
	}

	private updateFromResponse(response: IChatResponseModel, modelId: string): void {
		const usage = response.result?.usage;
		const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
		const maxInputTokens = modelMetadata?.maxInputTokens;

		if (!usage || !maxInputTokens || maxInputTokens <= 0) {
			this.hide();
			return;
		}

		const promptTokens = usage.promptTokens;
		const percentage = Math.min(100, (promptTokens / maxInputTokens) * 100);

		this.render(percentage, promptTokens, maxInputTokens);
		this.show();
	}

	private render(percentage: number, promptTokens: number, maxTokens: number): void {
		// Update circular progress
		const circumference = 2 * Math.PI * 16; // r = 16
		const offset = circumference - (percentage / 100) * circumference;
		this.progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
		this.progressRing.style.strokeDashoffset = `${offset}`;

		// Update color based on usage level
		this.domNode.classList.remove('warning', 'error');
		if (percentage >= 90) {
			this.domNode.classList.add('error');
		} else if (percentage >= 75) {
			this.domNode.classList.add('warning');
		}

		// Update hover with detailed information
		const tooltipText = localize(
			'contextUsageTooltip',
			"{0}% context used ({1} / {2} tokens)",
			percentage.toFixed(1),
			this.formatTokenCount(promptTokens),
			this.formatTokenCount(maxTokens)
		);
		this._managedHover.update(tooltipText);
	}

	private formatTokenCount(count: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
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
