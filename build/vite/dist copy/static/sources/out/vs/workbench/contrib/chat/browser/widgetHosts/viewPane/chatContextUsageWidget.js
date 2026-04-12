/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatContextUsageWidget_1;
import './media/chatContextUsageWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { EventType, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatContextUsageDetails } from './chatContextUsageDetails.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
const $ = dom.$;
/**
 * A reusable circular progress indicator that displays a ring.
 * The ring fills clockwise from the top based on the percentage value.
 */
export class CircularProgressIndicator {
    static { this.CENTER_X = 18; }
    static { this.CENTER_Y = 18; }
    static { this.RADIUS = 14; }
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
    setProgress(percentage) {
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
let ChatContextUsageWidget = class ChatContextUsageWidget extends Disposable {
    static { ChatContextUsageWidget_1 = this; }
    get isVisible() { return this._isVisible; }
    static { this._OPENED_STORAGE_KEY = 'chat.contextUsage.hasBeenOpened'; }
    static { this._HOVER_ID = 'chat.contextUsage'; }
    constructor(hoverService, instantiationService, languageModelsService, contextKeyService, storageService, configurationService) {
        super();
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        this.languageModelsService = languageModelsService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this.configurationService = configurationService;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._isVisible = observableValue(this, false);
        this._lastRequestDisposable = this._register(new MutableDisposable());
        this._hoverDisposable = this._register(new MutableDisposable());
        this._contextUsageDetails = this._register(new MutableDisposable());
        this._hoverOptions = {
            id: ChatContextUsageWidget_1._HOVER_ID,
            appearance: { showPointer: true, compact: true },
            persistence: { hideOnHover: false },
            trapFocus: true
        };
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
        if (this.storageService.getBoolean(ChatContextUsageWidget_1._OPENED_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */, false)) {
            this._contextUsageOpenedKey.set(true);
        }
        // Track enabled state from configuration
        this._enabled = this.configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled) !== false;
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.ChatContextUsageEnabled)) {
                this._enabled = this.configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled) !== false;
                if (!this._enabled) {
                    this.hide();
                }
                else if (this.currentData) {
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
    showDetails() {
        const details = this._createDetails();
        if (!details) {
            return false;
        }
        this.hoverService.showInstantHover({ ...this._hoverOptions, content: details.domNode, target: this.domNode, persistence: { hideOnHover: false, sticky: true } }, true);
        this._markOpened();
        return true;
    }
    _createDetails() {
        if (!this._isVisible.get() || !this.currentData) {
            return undefined;
        }
        if (!this._contextUsageDetails.value) {
            this._contextUsageDetails.value = this.instantiationService.createInstance(ChatContextUsageDetails);
        }
        this._contextUsageDetails.value.update(this.currentData);
        return this._contextUsageDetails.value;
    }
    _markOpened() {
        this._contextUsageOpenedKey.set(true);
        this.storageService.store(ChatContextUsageWidget_1._OPENED_STORAGE_KEY, true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    setupHover() {
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
            if (evt.equals(10 /* KeyCode.Space */) || evt.equals(3 /* KeyCode.Enter */)) {
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
    update(lastRequest) {
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
    updateFromResponse(response, modelId) {
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
        const completionTokens = usage.completionTokens;
        const promptTokenDetails = usage.promptTokenDetails;
        const outputBuffer = usage.outputBuffer;
        const totalContextWindow = maxInputTokens + maxOutputTokens;
        const usedTokens = promptTokens + completionTokens;
        const percentage = (usedTokens / totalContextWindow) * 100;
        // Remaining reserve = whatever the model reserved minus what completions
        // have already consumed. Once completions exceed the reserve, it drops to 0.
        const outputBufferPercentage = outputBuffer !== undefined
            ? (Math.max(0, outputBuffer - completionTokens) / totalContextWindow) * 100
            : undefined;
        this.render(percentage, completionTokens, usedTokens, totalContextWindow, outputBufferPercentage, promptTokenDetails);
        this.show();
    }
    render(percentage, completionTokens, usedTokens, totalContextWindow, outputBufferPercentage, promptTokenDetails) {
        // Store current data for use in details popup
        this.currentData = { usedTokens, completionTokens, totalContextWindow, percentage, outputBufferPercentage, promptTokenDetails };
        // Pie chart shows actual usage percentage only
        this.progressIndicator.setProgress(percentage);
        // Update percentage label and aria-label (clamp display to 100)
        const roundedPercentage = Math.min(100, Math.round(percentage));
        this.percentageLabel.textContent = `${roundedPercentage}%`;
        this.domNode.setAttribute('aria-label', localize('contextUsagePercentageLabel', "Context window usage: {0}%", roundedPercentage));
        // Color based on actual usage percentage
        this.domNode.classList.remove('warning', 'error');
        if (percentage >= 90) {
            this.domNode.classList.add('error');
        }
        else if (percentage >= 75) {
            this.domNode.classList.add('warning');
        }
    }
    show() {
        if (!this._enabled) {
            return;
        }
        if (this.domNode.style.display === 'none') {
            this.domNode.style.display = '';
            this._isVisible.set(true, undefined);
            this._onDidChangeVisibility.fire();
        }
    }
    hide() {
        if (this.domNode.style.display !== 'none') {
            this.domNode.style.display = 'none';
            this._isVisible.set(false, undefined);
            this._onDidChangeVisibility.fire();
        }
    }
};
ChatContextUsageWidget = ChatContextUsageWidget_1 = __decorate([
    __param(0, IHoverService),
    __param(1, IInstantiationService),
    __param(2, ILanguageModelsService),
    __param(3, IContextKeyService),
    __param(4, IStorageService),
    __param(5, IConfigurationService)
], ChatContextUsageWidget);
export { ChatContextUsageWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHRVc2FnZVdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Q29udGV4dFVzYWdlV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXpGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVHLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sc0RBQXNELENBQUM7QUFDcEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRWpFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1D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