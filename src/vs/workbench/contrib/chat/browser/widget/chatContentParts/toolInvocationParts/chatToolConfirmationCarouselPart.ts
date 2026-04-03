/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { localize } from '../../../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ChatToolInvocationPart } from './chatToolInvocationPart.js';
import '../media/chatToolConfirmationCarousel.css';

export type ToolInvocationPartFactory = (tool: IChatToolInvocation) => ChatToolInvocationPart;

interface ICarouselToolItem {
	readonly tool: IChatToolInvocation;
	readonly toolCallId: string;
	readonly tabElement: HTMLElement;
	readonly disposables: DisposableStore;
	toolPart?: ChatToolInvocationPart;
}

export class ChatToolConfirmationCarouselPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidEmpty = this._register(new Emitter<void>());
	readonly onDidEmpty = this._onDidEmpty.event;

	private readonly items: ICarouselToolItem[] = [];
	private readonly toolCallIds = new Set<string>();
	private activeIndex = 0;

	private readonly headerElement: HTMLElement;
	private readonly tabsContainer: HTMLElement;
	private readonly contentContainer: HTMLElement;

	constructor(
		private readonly toolPartFactory: ToolInvocationPartFactory,
		initialTools: IChatToolInvocation[],
		private readonly toolsService: ILanguageModelToolsService,
	) {
		super();

		const elements = dom.h('.chat-tool-confirmation-carousel@root', [
			dom.h('.chat-tool-carousel-header@header', [
				dom.h('.chat-tool-carousel-tabs@tabs'),
				dom.h('.chat-tool-carousel-bulk-actions@bulkActions'),
			]),
			dom.h('.chat-tool-carousel-content@content'),
		]);

		this.domNode = elements.root;
		this.headerElement = elements.header;
		this.tabsContainer = elements.tabs;
		this.contentContainer = elements.content;

		// Header: bulk Allow All / Skip All
		const allowAllBtn = this._register(new Button(elements.bulkActions, { ...defaultButtonStyles, small: true }));
		allowAllBtn.label = localize('allowAll', "Allow All");
		this._register(allowAllBtn.onDidClick(() => this.allowAll()));

		const skipAllBtn = this._register(new Button(elements.bulkActions, { ...defaultButtonStyles, small: true, secondary: true }));
		skipAllBtn.label = localize('skipAll', "Skip All");
		this._register(skipAllBtn.onDidClick(() => this.skipAll()));

		// Add initial tools
		for (const tool of initialTools) {
			this.addToolInvocation(tool);
		}
	}

	get pendingCount(): number {
		return this.items.length;
	}

	hasToolInvocation(toolCallId: string): boolean {
		return this.toolCallIds.has(toolCallId);
	}

	addToolInvocation(tool: IChatToolInvocation): void {
		if (this.toolCallIds.has(tool.toolCallId)) {
			return;
		}

		this.toolCallIds.add(tool.toolCallId);

		const disposables = new DisposableStore();

		// Create the tab — single descriptive label, no icon
		const tabElement = dom.$('.chat-tool-carousel-tab');
		const labelEl = dom.$('.chat-tool-carousel-tab-label');
		labelEl.textContent = this.getTabLabel(tool);
		tabElement.appendChild(labelEl);

		disposables.add(dom.addDisposableListener(tabElement, 'click', () => {
			const idx = this.items.findIndex(i => i.toolCallId === tool.toolCallId);
			if (idx >= 0) {
				this.setActiveIndex(idx);
			}
		}));

		this.tabsContainer.appendChild(tabElement);

		const item: ICarouselToolItem = {
			tool,
			toolCallId: tool.toolCallId,
			tabElement,
			disposables,
		};
		this.items.push(item);

		// Watch tool state — remove from carousel when no longer waiting
		disposables.add(autorun(reader => {
			const currentState = tool.state.read(reader);
			if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
				this.removeItem(tool.toolCallId);
			}
		}));

		this.updateVisibility();

		// If this is the first item, render its content
		if (this.items.length === 1) {
			this.setActiveIndex(0);
		}
	}

	private removeItem(toolCallId: string): void {
		const index = this.items.findIndex(i => i.toolCallId === toolCallId);
		if (index < 0) {
			return;
		}

		const [removed] = this.items.splice(index, 1);
		this.toolCallIds.delete(toolCallId);
		removed.tabElement.remove();
		if (removed.toolPart) {
			removed.toolPart.dispose();
		}
		removed.disposables.dispose();

		if (this.items.length === 0) {
			dom.hide(this.domNode);
			this._onDidEmpty.fire();
			return;
		}

		// Adjust active index
		if (this.activeIndex >= this.items.length) {
			this.activeIndex = this.items.length - 1;
		}

		this.updateVisibility();
		this.updateTabs();
		this.renderActiveContent();
	}

	private setActiveIndex(index: number): void {
		this.activeIndex = index;
		this.updateTabs();
		this.renderActiveContent();
	}

	/**
	 * Show/hide multi-item elements (bulk actions, nav, tabs overflow)
	 * based on whether there's more than one item.
	 */
	private updateVisibility(): void {
		const multi = this.items.length > 1;
		dom.setVisibility(multi, this.headerElement);
		this.domNode.classList.toggle('single-item', !multi);
		this.updateTabs();
	}

	private updateTabs(): void {
		for (let i = 0; i < this.items.length; i++) {
			this.items[i].tabElement.classList.toggle('active', i === this.activeIndex);
		}
	}

	private renderActiveContent(): void {
		dom.clearNode(this.contentContainer);

		const item = this.items[this.activeIndex];
		if (!item) {
			return;
		}

		// Dispose previous part if it was created for a different render
		if (item.toolPart) {
			item.toolPart.dispose();
			item.toolPart = undefined;
		}

		// Use the factory to create the real ChatToolInvocationPart
		const part = this.toolPartFactory(item.tool);
		item.toolPart = part;
		item.disposables.add(part);
		this.contentContainer.appendChild(part.domNode);
	}

	/**
	 * Build a short tab label: tool display name, with a brief differentiator
	 * when multiple tabs share the same tool.
	 */
	private getTabLabel(tool: IChatToolInvocation): string {
		const toolData = this.toolsService.getTool(tool.toolId);
		const name = toolData?.displayName ?? tool.toolId;

		// For terminal tools, append the command to distinguish tabs
		if (tool.toolSpecificData?.kind === 'terminal') {
			const terminalData = migrateLegacyTerminalToolSpecificData(tool.toolSpecificData);
			const cmd = terminalData.confirmation?.commandLine ?? (terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
			return `${name}: ${cmd}`;
		}

		// For other tools, append originMessage context if available
		if (tool.originMessage) {
			const text = typeof tool.originMessage === 'string' ? tool.originMessage : tool.originMessage.value;
			return `${name}: ${text}`;
		}

		return name;
	}

	allowAll(): void {
		for (const item of [...this.items]) {
			IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.UserAction });
		}
	}

	skipAll(): void {
		for (const item of [...this.items]) {
			IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.Skipped });
		}
	}
}
