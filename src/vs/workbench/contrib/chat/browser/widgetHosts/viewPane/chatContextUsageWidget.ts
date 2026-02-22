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
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatContextUsageDetails, IChatContextUsageData } from './chatContextUsageDetails.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';

const $ = dom.$;

/**
 * A reusable circular progress indicator that displays a ring.
 * The ring fills clockwise from the top based on the percentage value.
 */
export class CircularProgressIndicator {

	readonly domNode: SVGSVGElement;

	private readonly progressCircle: SVGCircleElement;
	private readonly circumference: number;

	private static readonly CENTER_X = 18;
	private static readonly CENTER_Y = 18;
	private static readonly RADIUS = 14;

	constructor() {
		const r = CircularProgressIndicator.RADIUS;
		this.circumference = 2 * Math.PI * r;

		this.domNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.domNode.setAttribute('viewBox', '0 0 36 36');
		this.domNode.classList.add('circular-progress');

		// Background circle
		const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		bgCircle.setAttribute('cx', String(CircularProgressIndicator.CENTER_X));
		bgCircle.setAttribute('cy', String(CircularProgressIndicator.CENTER_Y));
		bgCircle.setAttribute('r', String(r));
		bgCircle.classList.add('progress-bg');
		this.domNode.appendChild(bgCircle);

		// Progress arc (stroke-based ring)
		this.progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		this.progressCircle.setAttribute('cx', String(CircularProgressIndicator.CENTER_X));
		this.progressCircle.setAttribute('cy', String(CircularProgressIndicator.CENTER_Y));
		this.progressCircle.setAttribute('r', String(r));
		this.progressCircle.classList.add('progress-arc');
		this.progressCircle.setAttribute('stroke-dasharray', String(this.circumference));
		this.progressCircle.setAttribute('stroke-dashoffset', String(this.circumference));
		this.domNode.appendChild(this.progressCircle);
	}

	/**
	 * Updates the ring to display the given percentage (0-100).
	 * @param percentage The percentage of the ring to fill (clamped to 0-100)
	 */
	setProgress(percentage: number): void {
		const clamped = Math.max(0, Math.min(100, percentage));
		const offset = this.circumference - (clamped / 100) * this.circumference;
		this.progressCircle.setAttribute('stroke-dashoffset', String(offset));
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

	private static readonly _OPENED_STORAGE_KEY = 'chat.contextUsage.hasBeenOpened';
	private static readonly _HOVER_ID = 'chat.contextUsage';

	private readonly _contextUsageOpenedKey: IContextKey<boolean>;

	private _enabled: boolean;

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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

		// Track context usage opened state
		this._contextUsageOpenedKey = ChatContextKeys.contextUsageHasBeenOpened.bindTo(this.contextKeyService);

		// Restore persisted state
		if (this.storageService.getBoolean(ChatContextUsageWidget._OPENED_STORAGE_KEY, StorageScope.WORKSPACE, false)) {
			this._contextUsageOpenedKey.set(true);
		}

		// Track enabled state from configuration
		this._enabled = this.configurationService.getValue<boolean>(ChatConfiguration.ChatContextUsageEnabled) !== false;
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatContextUsageEnabled)) {
				this._enabled = this.configurationService.getValue<boolean>(ChatConfiguration.ChatContextUsageEnabled) !== false;
				if (!this._enabled) {
					this.hide();
				} else if (this.currentData) {
					this.show();
				}
			}
		}));

		// Set up hover - will be configured when data is available
		this.setupHover();
	}

	/**
	 * Shows the sticky context usage details hover and records that the user
	 * has opened it. Returns `true` if the details were shown.
	 */
	showDetails(): boolean {
		const details = this._createDetails();
		if (!details) {
			return false;
		}
		this.hoverService.showInstantHover(
			{ ...this._hoverOptions, content: details.domNode, target: this.domNode, persistence: { hideOnHover: false, sticky: true } },
			true
		);
		this._markOpened();
		return true;
	}

	private readonly _hoverOptions: Omit<IDelayedHoverOptions, 'content'> = {
		id: ChatContextUsageWidget._HOVER_ID,
		appearance: { showPointer: true, compact: true },
		persistence: { hideOnHover: false },
		trapFocus: true
	};

	private _createDetails(): ChatContextUsageDetails | undefined {
		if (!this._isVisible.get() || !this.currentData) {
			return undefined;
		}
		if (!this._contextUsageDetails.value) {
			this._contextUsageDetails.value = this.instantiationService.createInstance(ChatContextUsageDetails);
		}
		this._contextUsageDetails.value.update(this.currentData);
		return this._contextUsageDetails.value;
	}

	private _markOpened(): void {
		this._contextUsageOpenedKey.set(true);
		this.storageService.store(ChatContextUsageWidget._OPENED_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private setupHover(): void {
		this._hoverDisposable.clear();
		const store = new DisposableStore();
		this._hoverDisposable.value = store;

		store.add(this.hoverService.setupDelayedHover(this.domNode, () => ({
			...this._hoverOptions,
			content: this._createDetails()?.domNode ?? ''
		})));

		// Show sticky + focused hover on click
		store.add(addDisposableListener(this.domNode, EventType.CLICK, e => {
			e.stopPropagation();
			this.showDetails();
		}));

		// Show sticky + focused hover on keyboard activation (Space/Enter)
		store.add(addDisposableListener(this.domNode, EventType.KEY_DOWN, e => {
			const evt = new StandardKeyboardEvent(e);
			if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
				e.preventDefault();
				this.showDetails();
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

		if (!lastRequest) {
			// New/empty chat session clear everything
			this.currentData = undefined;
			this.hide();
			return;
		}

		if (!lastRequest.response || !lastRequest.modelId) {
			// Pending request keep old data visible if available
			if (!this.currentData) {
				this.hide();
			}
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
		const maxOutputTokens = modelMetadata?.maxOutputTokens;

		if (!usage || !maxInputTokens || maxInputTokens <= 0 || !maxOutputTokens || maxOutputTokens <= 0) {
			if (!this.currentData) {
				this.hide();
			}
			return;
		}

		const promptTokens = usage.promptTokens;
		const promptTokenDetails = usage.promptTokenDetails;
		const totalContextWindow = maxInputTokens + maxOutputTokens;
		const usedTokens = promptTokens + maxOutputTokens;
		const percentage = Math.min(100, (usedTokens / totalContextWindow) * 100);

		this.render(percentage, usedTokens, totalContextWindow, promptTokenDetails);
		this.show();
	}

	private render(percentage: number, usedTokens: number, totalContextWindow: number, promptTokenDetails?: readonly { category: string; label: string; percentageOfPrompt: number }[]): void {
		// Store current data for use in details popup
		this.currentData = { usedTokens, totalContextWindow, percentage, promptTokenDetails };

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
		if (!this._enabled) {
			return;
		}
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
