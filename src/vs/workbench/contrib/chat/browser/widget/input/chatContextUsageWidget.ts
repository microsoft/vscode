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
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';

const $ = dom.$;

export class ChatContextUsageWidget extends Disposable {

	public readonly domNode: HTMLElement;
	private readonly ringProgress: SVGCircleElement;

	private readonly _modelListener = this._register(new MutableDisposable());
	private _currentModel: IChatModel | undefined;

	private readonly _updateScheduler: RunOnceScheduler;
	private readonly _hoverDisplayScheduler: RunOnceScheduler;

	// Stats
	private _totalTokenCount = 0;
	private _systemTokenCount = 0;
	private _promptsTokenCount = 0;
	private _filesTokenCount = 0;
	private _imagesTokenCount = 0;
	private _selectionTokenCount = 0;
	private _toolsTokenCount = 0;
	private _workspaceTokenCount = 0;

	private _maxTokenCount = 4096; // Default fallback
	private _usagePercent = 0;

	private _hoverQuotaBit: HTMLElement | undefined;
	private _hoverQuotaValue: HTMLElement | undefined;
	private _hoverItemValues: Map<string, HTMLElement> = new Map();

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
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

		this._updateScheduler = this._register(new RunOnceScheduler(() => this._refreshUsage(), 1000));
		this._hoverDisplayScheduler = this._register(new RunOnceScheduler(() => {
			this._updateScheduler.schedule(0);
			this.hoverService.showInstantHover({
				content: this._getHoverDomNode(),
				target: this.domNode,
				appearance: {
					showPointer: true,
					skipFadeInAnimation: true
				}
			});
		}, 600));

		this._register(dom.addDisposableListener(this.domNode, 'mouseenter', () => {
			this._hoverDisplayScheduler.schedule();
		}));

		this._register(dom.addDisposableListener(this.domNode, 'mouseleave', () => {
			this._hoverDisplayScheduler.cancel();
		}));

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, () => {
			this._hoverDisplayScheduler.cancel();
			this._updateScheduler.schedule(0);
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

		if (model && !model.contributedChatSession) {
			this._modelListener.value = model.onDidChange(() => {
				this._updateScheduler.schedule();
			});
			this._updateScheduler.schedule(0);
		} else {
			this.domNode.style.display = 'none';
		}
	}

	private async _refreshUsage() {
		if (!this._currentModel) {
			return;
		}

		const requests = this._currentModel.getRequests();

		if (requests.length === 0) {
			this.domNode.style.display = 'none';
			return;
		}

		this.domNode.style.display = '';

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
				try {
					return await this.languageModelsService.computeTokenLength(modelId, text, CancellationToken.None);
				} catch (error) {
					return text.length / 4;
				}
			}
			return text.length / 4;
		};

		const requestCounts = await Promise.all(requests.map(async (request) => {
			let p = 0;
			let f = 0;
			let i = 0;
			let s = 0;
			let t = 0;
			let w = 0;

			// Prompts: User message
			const messageText = typeof request.message === 'string' ? request.message : request.message.text;
			p += await countTokens(messageText);

			// Variables (Files, Context)
			if (request.variableData && request.variableData.variables) {
				for (const variable of request.variableData.variables) {
					// Estimate usage
					const defaultEstimate = 500;
					if (variable.kind === 'file') {
						f += defaultEstimate;
					} else if (variable.kind === 'image') {
						i += defaultEstimate;
					} else if (variable.kind === 'implicit' && variable.isSelection) {
						s += defaultEstimate;
					} else {
						w += defaultEstimate;
					}
				}
			}

			// Tools & Response
			if (request.response) {
				const responseString = request.response.response.toString();
				p += await countTokens(responseString);

				for (const part of request.response.response.value) {
					if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
						t += 200;
					}
				}
			}

			return { p, f, i, s, t, w };
		}));


		const lastRequest = requests[requests.length - 1];
		if (lastRequest.modeInfo?.modeInstructions) {
			this._systemTokenCount = await countTokens(lastRequest.modeInfo.modeInstructions.content);
		} else {
			this._systemTokenCount = 0;
		}

		this._promptsTokenCount = 0;
		this._filesTokenCount = 0;
		this._imagesTokenCount = 0;
		this._selectionTokenCount = 0;
		this._toolsTokenCount = 0;
		this._workspaceTokenCount = 0;

		for (const count of requestCounts) {
			this._promptsTokenCount += count.p;
			this._filesTokenCount += count.f;
			this._imagesTokenCount += count.i;
			this._selectionTokenCount += count.s;
			this._toolsTokenCount += count.t;
			this._workspaceTokenCount += count.w;
		}

		this._totalTokenCount = Math.round(this._systemTokenCount + this._promptsTokenCount + this._filesTokenCount + this._imagesTokenCount + this._selectionTokenCount + this._toolsTokenCount + this._workspaceTokenCount);
		this._usagePercent = Math.min(100, (this._totalTokenCount / this._maxTokenCount) * 100);

		this._updateRing();
		this._updateHover();
	}

	private _formatTokens(value: number): string {
		if (value >= 1000) {
			const thousands = value / 1000;
			return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
		}
		return `${value}`;
	}

	private _updateRing() {
		const r = 7;
		const c = 2 * Math.PI * r;
		const offset = c - (this._usagePercent / 100) * c;
		this.ringProgress.style.strokeDashoffset = String(offset);

		this.domNode.classList.remove('warning', 'error');
		if (this._usagePercent > 95) {
			this.domNode.classList.add('error');
		} else if (this._usagePercent > 75) {
			this.domNode.classList.add('warning');
		}
	}

	private _updateHover() {
		if (this._hoverQuotaValue) {
			const percentStr = `${this._usagePercent.toFixed(0)}%`;
			const usageStr = `${this._formatTokens(this._totalTokenCount)} / ${this._formatTokens(this._maxTokenCount)}`;
			this._hoverQuotaValue.textContent = `${usageStr} • ${percentStr}`;
		}

		if (this._hoverQuotaBit) {
			this._hoverQuotaBit.style.width = `${this._usagePercent}%`;
		}

		const updateItem = (key: string, value: number) => {
			const item = this._hoverItemValues.get(key);
			if (item) {
				const percent = this._maxTokenCount > 0 ? (value / this._maxTokenCount) * 100 : 0;
				const displayValue = `${percent.toFixed(0)}%`;
				item.textContent = displayValue;
			}
		};

		updateItem('system', this._systemTokenCount);
		updateItem('messages', this._promptsTokenCount);
		updateItem('attachedFiles', this._filesTokenCount);
		updateItem('images', this._imagesTokenCount);
		updateItem('selection', this._selectionTokenCount);
		updateItem('systemTools', this._toolsTokenCount);
		updateItem('workspace', this._workspaceTokenCount);
	}

	private _getHoverDomNode(): HTMLElement {
		const container = $('.chat-context-usage-hover');

		const percentStr = `${this._usagePercent.toFixed(0)}%`;
		const usageStr = `${this._formatTokens(this._totalTokenCount)} / ${this._formatTokens(this._maxTokenCount)}`;

		// Quota Indicator (Progress Bar)
		const quotaIndicator = dom.append(container, $('.quota-indicator'));

		const quotaLabel = dom.append(quotaIndicator, $('.quota-label'));
		dom.append(quotaLabel, $('span.quota-title', undefined, localize('totalUsageLabel', "Total usage")));
		this._hoverQuotaValue = dom.append(quotaLabel, $('span.quota-value', undefined, `${usageStr} • ${percentStr}`));

		const quotaBar = dom.append(quotaIndicator, $('.quota-bar'));
		this._hoverQuotaBit = dom.append(quotaBar, $('.quota-bit'));
		this._hoverQuotaBit.style.width = `${this._usagePercent}%`;

		if (this._usagePercent > 75) {
			if (this._usagePercent > 95) {
				quotaIndicator.classList.add('error');
			} else {
				quotaIndicator.classList.add('warning');
			}

			const quotaSubLabel = dom.append(quotaIndicator, $('div.quota-sub-label'));
			quotaSubLabel.textContent = this._usagePercent >= 100
				? localize('contextWindowFull', "Context window full")
				: localize('approachingLimit', "Approaching limit");
		}

		// List
		const list = dom.append(container, $('.chat-context-usage-hover-list'));
		this._hoverItemValues.clear();

		const addItem = (key: string, label: string, value: number) => {
			const item = dom.append(list, $('.chat-context-usage-hover-item'));
			dom.append(item, $('span.label', undefined, label));

			// Calculate percentage for breakdown
			const percent = this._maxTokenCount > 0 ? (value / this._maxTokenCount) * 100 : 0;
			const displayValue = `${percent.toFixed(0)}%`;
			const valueSpan = dom.append(item, $('span.value', undefined, displayValue));
			this._hoverItemValues.set(key, valueSpan);
		};

		const addTitle = (label: string) => {
			dom.append(list, $('.chat-context-usage-hover-title', undefined, label));
		};

		const addSeparator = () => {
			dom.append(list, $('.chat-context-usage-hover-separator'));
		};

		// Group 1: System
		addTitle(localize('systemGroup', "System"));
		addItem('system', localize('system', "System prompt"), Math.round(this._systemTokenCount));
		addItem('systemTools', localize('systemTools', "System tools"), Math.round(this._toolsTokenCount));

		addSeparator();

		// Group 2: Messages
		addTitle(localize('messagesGroup', "Conversation"));
		addItem('messages', localize('messages', "Messages"), Math.round(this._promptsTokenCount));

		addSeparator();

		// Group 3: Data / Context
		addTitle(localize('dataGroup', "Context"));
		addItem('attachedFiles', localize('attachedFiles', "Attached files"), Math.round(this._filesTokenCount));
		addItem('images', localize('images', "Images"), Math.round(this._imagesTokenCount));
		addItem('selection', localize('selection', "Selection"), Math.round(this._selectionTokenCount));
		addItem('workspace', localize('workspace', "Workspace"), Math.round(this._workspaceTokenCount));

		if (this._usagePercent > 75) {
			const warning = dom.append(container, $('.chat-context-usage-warning'));

			const link = dom.append(warning, $('a', { href: '#', class: 'chat-context-usage-action-link' }, localize('startNewSession', "Start a new session")));

			this._register(dom.addDisposableListener(link, 'click', (e) => {
				e.preventDefault();
				this.hoverService.hideHover();
				this.commandService.executeCommand('workbench.action.chat.newChat');
			}));

			const suffix = localize('toIncreaseLimit', " to reset context window.");
			dom.append(warning, document.createTextNode(suffix));

			if (this._usagePercent > 95) {
				warning.classList.add('error');
			}
		}

		return container;
	}
}
