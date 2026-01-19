/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatContextUsageWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../../../nls.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';

const $ = dom.$;

export class ChatContextUsageWidget extends Disposable {

	public readonly domNode: HTMLElement;
	private readonly ringProgress: SVGCircleElement;

	private readonly _modelListener = this._register(new MutableDisposable());
	private _currentModel: IChatModel | undefined;

	private readonly _updateScheduler: RunOnceScheduler;

	// Stats
	private _totalTokenCount = 0;
	private _promptsTokenCount = 0;
	private _filesTokenCount = 0;
	private _toolsTokenCount = 0;
	private _contextTokenCount = 0;

	private _maxTokenCount = 4096; // Default fallback
	private _usagePercent = 0;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.domNode = $('.chat-context-usage-widget');
		this.domNode.style.display = 'none';

		// Create SVG Ring
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'chat-context-usage-ring');
		svg.setAttribute('width', '16');
		svg.setAttribute('height', '16');
		svg.setAttribute('viewBox', '0 0 16 16');

		const background = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		background.setAttribute('class', 'chat-context-usage-ring-background');
		background.setAttribute('cx', '8');
		background.setAttribute('cy', '8');
		background.setAttribute('r', '7');
		svg.appendChild(background);

		this.ringProgress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		this.ringProgress.setAttribute('class', 'chat-context-usage-ring-progress');
		this.ringProgress.setAttribute('cx', '8');
		this.ringProgress.setAttribute('cy', '8');
		this.ringProgress.setAttribute('r', '7');
		svg.appendChild(this.ringProgress);

		this.domNode.appendChild(svg);

		this._updateScheduler = this._register(new RunOnceScheduler(() => this._refreshUsage(), 2000));

		this._register(this.hoverService.setupDelayedHover(this.domNode, () => ({
			content: this._getHoverDomNode(),
			appearance: {
				showPointer: true,
				skipFadeInAnimation: true
			}
		})));

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, () => {
			this.hoverService.showInstantHover({
				content: this._getHoverDomNode(),
				target: this.domNode,
				appearance: {
					showPointer: true,
					skipFadeInAnimation: true
				},
				persistence: {
					sticky: true
				}
			}, true);
		}));
	}

	setModel(model: IChatModel | undefined) {
		if (this._currentModel === model) {
			return;
		}

		this._currentModel = model;
		this._modelListener.clear();

		if (model) {
			this._modelListener.value = model.onDidChange(() => {
				this._updateScheduler.schedule();
			});
			this._updateScheduler.schedule(0);
			this.domNode.style.display = '';
		} else {
			this.domNode.style.display = 'none';
		}
	}

	private async _refreshUsage() {
		if (!this._currentModel) {
			return;
		}

		this._promptsTokenCount = 0;
		this._filesTokenCount = 0;
		this._toolsTokenCount = 0;
		this._contextTokenCount = 0;

		const requests = this._currentModel.getRequests();

		let modelId: string | undefined;

		const inputState = this._currentModel.inputModel.state.get();
		if (inputState?.selectedModel) {
			modelId = inputState.selectedModel.identifier;
			if (inputState.selectedModel.metadata.maxInputTokens) {
				this._maxTokenCount = inputState.selectedModel.metadata.maxInputTokens;
			}
		}

		const countTokens = async (text: string): Promise<number> => {
			if (modelId) {
				return this.languageModelsService.computeTokenLength(modelId, text, CancellationToken.None);
			}
			return text.length / 4;
		};

		for (const request of requests) {
			// Prompts: User message
			const messageText = typeof request.message === 'string' ? request.message : request.message.text;
			this._promptsTokenCount += await countTokens(messageText);

			// Variables (Files, Context)
			if (request.variableData && request.variableData.variables) {
				for (const variable of request.variableData.variables) {
					// Estimate usage for variables as getting full content might be expensive/complex async
					// Using a safe estimate for now per item type
					const defaultEstimate = 500;

					if (variable.kind === 'file') {
						this._filesTokenCount += defaultEstimate;
					} else {
						this._contextTokenCount += defaultEstimate;
					}
				}
			}

			// Tools & Response
			if (request.response) {
				const responseString = request.response.response.toString();
				this._promptsTokenCount += await countTokens(responseString);

				// Loop through response parts for tool invocations
				for (const part of request.response.response.value) {
					if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
						// Estimate tool invocation cost
						this._toolsTokenCount += 200;
					}
				}
			}
		}

		this._totalTokenCount = Math.round(this._promptsTokenCount + this._filesTokenCount + this._toolsTokenCount + this._contextTokenCount);
		this._usagePercent = Math.min(100, (this._totalTokenCount / this._maxTokenCount) * 100);

		this._updateRing();
	}

	private _updateRing() {
		const r = 7;
		const c = 2 * Math.PI * r;
		const offset = c - (this._usagePercent / 100) * c;
		this.ringProgress.style.strokeDashoffset = String(offset);

		this.domNode.classList.remove('warning', 'error');
		if (this._usagePercent > 90) {
			this.domNode.classList.add('error');
		} else if (this._usagePercent > 75) {
			this.domNode.classList.add('warning');
		}
	}

	private _getHoverDomNode(): HTMLElement {
		const container = $('.chat-context-usage-hover');

		const percentStr = `${this._usagePercent.toFixed(0)}%`;
		const formatTokens = (value: number) => {
			if (value >= 1000) {
				const thousands = value / 1000;
				return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
			}
			return `${value}`;
		};
		const usageStr = `${formatTokens(this._totalTokenCount)} / ${formatTokens(this._maxTokenCount)}`;

		// Header
		// const header = dom.append(container, $('.header'));
		// dom.append(header, $('span', undefined, localize('contextUsage', "Context Usage")));

		// Quota Indicator (Progress Bar)
		const quotaIndicator = dom.append(container, $('.quota-indicator'));
		const quotaBar = dom.append(quotaIndicator, $('.quota-bar'));
		const quotaBit = dom.append(quotaBar, $('.quota-bit'));
		quotaBit.style.width = `${this._usagePercent}%`;

		const quotaLabel = dom.append(quotaIndicator, $('.quota-label'));
		dom.append(quotaLabel, $('span.quota-title', undefined, localize('totalUsageLabel', "Total usage")));
		dom.append(quotaLabel, $('span.quota-value', undefined, `${usageStr} • ${percentStr}`));


		if (this._usagePercent > 90) {
			quotaIndicator.classList.add('error');
		} else if (this._usagePercent > 75) {
			quotaIndicator.classList.add('warning');
		}

		dom.append(container, $('.chat-context-usage-hover-separator'));

		// List
		const list = dom.append(container, $('.chat-context-usage-hover-list'));

		const addItem = (label: string, value: number) => {
			const item = dom.append(list, $('.chat-context-usage-hover-item'));
			dom.append(item, $('span.label', undefined, label));

			// Calculate percentage for breakdown
			const percent = this._maxTokenCount > 0 ? (value / this._maxTokenCount) * 100 : 0;
			const displayValue = `${percent.toFixed(0)}%`;
			dom.append(item, $('span.value', undefined, displayValue));
		};

		addItem(localize('prompts', "Prompts"), Math.round(this._promptsTokenCount));
		addItem(localize('files', "Files"), Math.round(this._filesTokenCount));
		addItem(localize('tools', "Tools"), Math.round(this._toolsTokenCount));
		addItem(localize('context', "Context"), Math.round(this._contextTokenCount));

		if (this._usagePercent > 80) {
			const remaining = Math.max(0, this._maxTokenCount - this._totalTokenCount);
			const warning = dom.append(container, $('div', { style: 'margin-top: 8px; color: var(--vscode-editorWarning-foreground);' }));
			warning.textContent = localize('contextLimitWarning', "Approaching limit. {0} tokens remaining.", remaining);
		}

		return container;
	}
}
