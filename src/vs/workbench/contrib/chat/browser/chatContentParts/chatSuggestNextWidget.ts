/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IChatMode } from '../../common/chatModes.js';
import { IHandOff, IHandOffAdditionalChoice } from '../../common/promptSyntax/promptFileParser.js';

export interface INextPromptSelection {
	readonly handoff: IHandOff;
	readonly option?: IHandOffAdditionalChoice;
}

export class ChatSuggestNextWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _onDidSelectPrompt = this._register(new Emitter<INextPromptSelection>());
	public readonly onDidSelectPrompt: Event<INextPromptSelection> = this._onDidSelectPrompt.event;

	private promptsContainer!: HTMLElement;
	private titleElement!: HTMLElement;
	private _currentMode: IChatMode | undefined;

	constructor(
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();
		this.domNode = this.createSuggestNextWidget();
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	public getCurrentMode(): IChatMode | undefined {
		return this._currentMode;
	}

	private createSuggestNextWidget(): HTMLElement {
		// Reuse welcome view classes for consistent styling
		const container = dom.$('.chat-suggest-next-widget.chat-welcome-view-suggested-prompts');
		container.style.display = 'none';

		// Title element using welcome view class
		this.titleElement = dom.append(container, dom.$('.chat-welcome-view-suggested-prompts-title'));

		// Container for prompt buttons
		this.promptsContainer = container;

		return container;
	}

	public render(mode: IChatMode): void {
		const handoffs = mode.handOffs?.get();

		if (!handoffs || handoffs.length === 0) {
			this.hide();
			return;
		}

		this._currentMode = mode;

		// Update title with mode name: "Proceed from {Mode}"
		const modeName = mode.name.get() || mode.label.get() || localize('chat.currentMode', 'current mode');
		this.titleElement.textContent = localize('chat.proceedFrom', 'Proceed from {0}', modeName);

		// Clear existing prompt buttons (keep title which is first child)
		const childrenToRemove: HTMLElement[] = [];
		for (let i = 1; i < this.promptsContainer.children.length; i++) {
			childrenToRemove.push(this.promptsContainer.children[i] as HTMLElement);
		}
		for (const child of childrenToRemove) {
			this.promptsContainer.removeChild(child);
		}

		// Create prompt buttons using welcome view classes
		for (const handoff of handoffs) {
			const promptButton = this.createPromptButton(handoff);
			this.promptsContainer.appendChild(promptButton);
		}

		this.domNode.style.display = 'flex';
		this._onDidChangeHeight.fire();
	}

	private createPromptButton(handoff: IHandOff): HTMLElement {
		const disposables = new DisposableStore();
		this._register(disposables);

		const button = dom.$('.chat-welcome-view-suggested-prompt');
		button.setAttribute('tabindex', '0');
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', localize('chat.suggestNext.item', '{0}', handoff.label));

		const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
		titleElement.textContent = handoff.label;

		const hasAdditionalChoices = handoff.additionalChoices && handoff.additionalChoices.length > 0;

		if (hasAdditionalChoices) {
			const chevron = dom.append(button, dom.$('.codicon.codicon-chevron-down.dropdown-chevron'));
			chevron.setAttribute('tabindex', '0');
			chevron.setAttribute('role', 'button');
			chevron.setAttribute('aria-label', localize('chat.suggestNext.moreOptions', 'More options for {0}', handoff.label));
			chevron.setAttribute('aria-haspopup', 'true');

			const showContextMenu = (e: MouseEvent | KeyboardEvent, anchor?: HTMLElement) => {
				e.preventDefault();
				e.stopPropagation();

				const actions = handoff.additionalChoices!.map(option =>
					new Action(option.label, option.label, undefined, true, () => {
						this._onDidSelectPrompt.fire({ handoff, option });
					})
				);

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor || button,
					getActions: () => actions,
					autoSelectFirstItem: true,
				});
			};

			disposables.add(dom.addDisposableListener(chevron, 'click', (e: MouseEvent) => {
				showContextMenu(e, chevron);
			}));

			disposables.add(dom.addDisposableListener(chevron, 'keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					showContextMenu(e, chevron);
				}
			}));
		}

		// Handle button clicks - ignore clicks on chevron if present
		disposables.add(dom.addDisposableListener(button, 'click', (e: MouseEvent) => {
			if (hasAdditionalChoices && (e.target as HTMLElement).classList.contains('dropdown-chevron')) {
				return;
			}
			this._onDidSelectPrompt.fire({ handoff });
		}));

		disposables.add(dom.addDisposableListener(button, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._onDidSelectPrompt.fire({ handoff });
			}
		}));

		return button;
	}

	public hide(): void {
		if (this.domNode.style.display !== 'none') {
			this._currentMode = undefined;
			this.domNode.style.display = 'none';
			this._onDidChangeHeight.fire();
		}
	}
}
