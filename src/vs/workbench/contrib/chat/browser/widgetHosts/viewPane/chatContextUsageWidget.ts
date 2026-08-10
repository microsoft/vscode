/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatContextUsageWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { EventType, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { IDelayedHoverOptions } from '../../../../../../base/browser/ui/hover/hover.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, observableValueOpts } from '../../../../../../base/common/observable.js';
import { equals } from '../../../../../../base/common/arrays.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatContextUsageDetails, IChatContextUsageData } from './chatContextUsageDetails.js';
import type { IChatWidget } from '../../chat.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';

const $ = dom.$;

/**
 * Resolves the input-token denominator used by the context-usage gauge.
 *
 * Resolution order, mirroring the request path's `applyContextSizeOverride`:
 *   1. An explicit `contextSize` in the resolved model configuration.
 *   2. The schema's default `contextSize` tier (e.g. 200K). Used when the
 *      resolved configuration is missing `contextSize` (e.g. the schema default
 *      has not loaded yet) so the gauge denominator agrees with the size the
 *      request actually uses instead of jumping to the model's full native
 *      window. See issue #320393.
 *   3. The model's full native window (`maxInputTokens`). Models without a
 *      context-size picker have no such schema property and land here, where
 *      default and max are the same value.
 *
 * @internal - exported for testing
 */
export function resolveContextWindowInputTokens(
	modelConfiguration: IStringDictionary<unknown> | undefined,
	configurationSchema: ILanguageModelConfigurationSchema | undefined,
	maxInputTokens: number | undefined,
): number | undefined {
	const configuredContextSize = typeof modelConfiguration?.contextSize === 'number' ? modelConfiguration.contextSize : undefined;
	const schemaDefaultContextSize = configurationSchema?.properties?.contextSize?.default;
	return configuredContextSize
		?? (typeof schemaDefaultContextSize === 'number' ? schemaDefaultContextSize : undefined)
		?? maxInputTokens;
}

/**
 * Equality comparer for {@link IChatContextUsageData} used to suppress redundant updates.
 *
 * @internal - exported for testing
 */
export function isSameContextUsageData(a: IChatContextUsageData | undefined, b: IChatContextUsageData | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.usedTokens === b.usedTokens
		&& a.completionTokens === b.completionTokens
		&& a.totalContextWindow === b.totalContextWindow
		&& a.percentage === b.percentage
		&& a.outputBufferPercentage === b.outputBufferPercentage
		&& a.sessionCost === b.sessionCost
		&& equals(a.promptTokenDetails, b.promptTokenDetails, (x, y) =>
			x.category === y.category && x.label === y.label && x.percentageOfPrompt === y.percentageOfPrompt);
}

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
	private readonly percentageLabel: HTMLElement;

	private readonly _isVisible = observableValue<boolean>(this, false);
	get isVisible(): IObservable<boolean> { return this._isVisible; }

	private readonly _lastRequestDisposable = this._register(new MutableDisposable());
	private readonly _modelConfigurationListener = this._register(new MutableDisposable());
	private _currentResponse: IChatResponseModel | undefined;
	private _currentModelId: string | undefined;
	/**
	 * The model the user currently has selected in the picker. When set it
	 * overrides the last request's model for computing the context-window
	 * denominator, so switching models updates the widget before the next
	 * request is sent. The usage numerator still comes from the last response.
	 */
	private _selectedModelId: string | undefined;
	private readonly _hoverDisposable = this._register(new MutableDisposable<DisposableStore>());
	private readonly _contextUsageDetails = this._register(new MutableDisposable<ChatContextUsageDetails>());
	private _chatWidget: IChatWidget | undefined;

	private readonly _currentData = observableValueOpts<IChatContextUsageData | undefined>({ owner: this, equalsFn: isSameContextUsageData }, undefined);

	private static readonly _OPENED_STORAGE_KEY = 'chat.contextUsage.hasBeenOpened';
	private static readonly _HOVER_ID = 'chat.contextUsage';

	private readonly _contextUsageOpenedKey: IContextKey<boolean>;

	private _enabled: boolean;

	/**
	 * Per-editor resolver for a model's configuration (e.g. user-selected
	 * context size). When unset the widget falls back to the profile-global
	 * value from {@link ILanguageModelsService.getModelConfiguration}, which can
	 * lag the editor's actual selection (see issue #320393).
	 */
	private _modelConfigurationResolver: ((modelId: string) => IStringDictionary<unknown> | undefined) | undefined;

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

		// Percentage label (visible on hover/focus)
		this.percentageLabel = this.domNode.appendChild($('.percentage-label'));

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
				} else if (this._currentData.get()) {
					this.show();
				}
			}
		}));

		// Set up hover - will be configured when data is available
		this.setupHover();
	}

	setChatWidget(widget: IChatWidget): void {
		this._chatWidget = widget;
		this._contextUsageDetails.value?.setChatWidget(widget);
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
		if (!this._isVisible.get() || !this._currentData.get()) {
			return undefined;
		}
		if (!this._contextUsageDetails.value) {
			// Details subscribes to `_currentData` and re-renders reactively.
			this._contextUsageDetails.value = this.instantiationService.createInstance(ChatContextUsageDetails, this._chatWidget, this._currentData);
		}
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
		this._currentResponse = undefined;
		this._currentModelId = undefined;

		if (!lastRequest) {
			// New/empty chat session clear everything
			this._currentData.set(undefined, undefined);
			this.hide();
			return;
		}

		if (!lastRequest.response || !lastRequest.modelId) {
			// Pending request keep old data visible if available
			if (!this._currentData.get()) {
				this.hide();
			}
			return;
		}

		const response = lastRequest.response;
		const modelId = lastRequest.modelId;
		this._currentResponse = response;
		this._currentModelId = modelId;

		// Update immediately if usage data is already available
		this.updateFromResponse(response, modelId);

		// Subscribe to response changes to update whenever usage data changes
		this._lastRequestDisposable.value = response.onDidChange(() => {
			this.updateFromResponse(response, modelId);
		});
	}

	updateSessionCost(sessionCost: number): void {
		const data = this._currentData.get();
		if (data && data.sessionCost !== sessionCost) {
			this.render({ ...data, sessionCost });
		}
	}

	/**
	 * Provides a per-editor resolver for the selected model's configuration
	 * (notably the user-selected context size). The widget re-renders whenever
	 * the supplied event fires for the currently displayed model. Without this,
	 * the widget falls back to the profile-global value, which can drift from
	 * the editor's actual selection (see issue #320393).
	 */
	setModelConfigurationResolver(
		resolver: (modelId: string) => IStringDictionary<unknown> | undefined,
		onDidChange: Event<string>,
	): void {
		this._modelConfigurationResolver = resolver;
		this._modelConfigurationListener.value = onDidChange(modelId => {
			const affectsDisplayedModel = this._currentModelId === modelId || this._selectedModelId === modelId;
			if (this._currentResponse && this._currentModelId && affectsDisplayedModel) {
				this.updateFromResponse(this._currentResponse, this._currentModelId);
			}
		});
	}

	/**
	 * Sets the model the user currently has selected in the picker. The
	 * context-window denominator then reflects this model immediately, even
	 * before a request is sent with it. The usage numerator still comes from the
	 * last completed response.
	 */
	setSelectedModel(modelId: string | undefined): void {
		if (this._selectedModelId === modelId) {
			return;
		}
		this._selectedModelId = modelId;
		if (this._currentResponse && this._currentModelId) {
			this.updateFromResponse(this._currentResponse, this._currentModelId);
		}
	}

	/**
	 * Resolves a model's context-window dimensions, or `undefined` when it has no usable window. A meta-model such as
	 * "auto" advertises a zero-sized window, so it resolves to `undefined` and the caller falls back to the model that
	 * actually served the request (see issue #321781).
	 */
	private resolveContextWindow(modelId: string | undefined): { maxOutputTokens: number | undefined; totalContextWindow: number } | undefined {
		if (!modelId) {
			return undefined;
		}
		const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
		// Computing the total context window needs the model's metadata, notably its output-token budget
		// (`maxOutputTokens`), which — unlike the input window — has no configuration fallback. Right after a reload the
		// model provider may not have registered the selected model yet while a persisted `contextSize` is already
		// resolvable, so the window would be computed input-only (e.g. 272K instead of 272K + 128K for GPT-5). Bail out
		// until metadata is available rather than render a misleading partial value; the widget re-renders on model
		// registration (`onDidChangeLanguageModels`) and on model selection.
		if (!modelMetadata) {
			return undefined;
		}
		const modelConfiguration = this._modelConfigurationResolver?.(modelId) ?? this.languageModelsService.getModelConfiguration(modelId);
		// Prefer the schema default context-size tier when config is missing (keeps denominator aligned with the request path).
		const maxInputTokens = resolveContextWindowInputTokens(modelConfiguration, modelMetadata.configurationSchema, modelMetadata.maxInputTokens);
		const maxOutputTokens = modelMetadata.maxOutputTokens;
		const totalContextWindow = (maxInputTokens ?? 0) + (maxOutputTokens ?? 0);
		if (totalContextWindow <= 0) {
			return undefined;
		}
		return { maxOutputTokens, totalContextWindow };
	}

	private updateFromResponse(response: IChatResponseModel, modelId: string): void {
		const usage = response.usage;

		// When a meta-model (e.g. "auto") routes to a concrete model, the
		// usage reports the actual model that served the request.
		const effectiveModelId = usage?.actualModelId ?? modelId;

		// The denominator (context window) follows the currently selected model so switching models updates the widget
		// immediately; the numerator (usage) still comes from the last response. A meta-model such as "auto" has no
		// context window of its own, so fall back to the model that actually served the request (see issue #321781).
		const contextWindow = this.resolveContextWindow(this._selectedModelId) ?? this.resolveContextWindow(effectiveModelId);
		if (!usage || !contextWindow) {
			if (!this._currentData.get()) {
				this.hide();
			}
			return;
		}

		const { maxOutputTokens, totalContextWindow } = contextWindow;

		const promptTokens = usage.promptTokens;
		const completionTokens = usage.completionTokens;
		const promptTokenDetails = usage.promptTokenDetails;
		const usedTokens = promptTokens + completionTokens;
		const percentage = (usedTokens / totalContextWindow) * 100;

		// The reserve band is a property of the model the user currently has
		// selected (how much of its window is set aside for output), not of the
		// past response, so it is derived from the selected model's max output
		// tokens rather than `usage`. Remaining reserve = that reserve minus what
		// completions have already consumed; once completions exceed it, it drops
		// to 0.
		const outputBufferPercentage = maxOutputTokens !== undefined
			? (Math.max(0, maxOutputTokens - completionTokens) / totalContextWindow) * 100
			: undefined;

		this.render({
			usedTokens, completionTokens, totalContextWindow,
			percentage, outputBufferPercentage,
			promptTokenDetails, sessionCost: response.session.sessionCost,
		});
		this.show();
	}

	private render(data: IChatContextUsageData): void {
		this._currentData.set(data, undefined);

		// Pie chart shows actual usage percentage only
		this.progressIndicator.setProgress(data.percentage);

		// Update percentage label and aria-label (clamp display to 100)
		const roundedPercentage = Math.min(100, Math.round(data.percentage));
		this.percentageLabel.textContent = `${roundedPercentage}%`;
		this.domNode.setAttribute('aria-label', localize('contextUsagePercentageLabel', "Context window usage: {0}%", roundedPercentage));

		// Color based on actual usage percentage
		this.domNode.classList.remove('warning', 'error');
		if (data.percentage >= 90) {
			this.domNode.classList.add('error');
		} else if (data.percentage >= 75) {
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
