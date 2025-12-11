/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IChatMode } from '../../common/chatModes.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IHandOff } from '../../common/promptSyntax/promptFileParser.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../agentSessions/agentSessions.js';

export interface INextPromptSelection {
	readonly handoff: IHandOff;
	readonly agentId?: string;
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
	private buttonDisposables = new Map<HTMLElement, DisposableStore>();

	constructor(
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService
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
			const disposables = this.buttonDisposables.get(child);
			if (disposables) {
				disposables.dispose();
				this.buttonDisposables.delete(child);
			}
			this.promptsContainer.removeChild(child);
		}

		for (const handoff of handoffs) {
			const promptButton = this.createPromptButton(handoff);
			this.promptsContainer.appendChild(promptButton);
		}

		this.domNode.style.display = 'flex';
		this._onDidChangeHeight.fire();
	}

	private createPromptButton(handoff: IHandOff): HTMLElement {
		const disposables = new DisposableStore();

		const button = dom.$('.chat-welcome-view-suggested-prompt');
		button.setAttribute('tabindex', '0');
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', localize('chat.suggestNext.item', '{0}', handoff.label));

		const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
		titleElement.textContent = handoff.label;

		// Optional showContinueOn behaves like send: only present if specified
		const showContinueOn = handoff.showContinueOn ?? true;

		// Get chat session contributions to show in chevron dropdown
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		const availableContributions = contributions.filter(c => c.canDelegate);

		if (showContinueOn && availableContributions.length > 0) {
			button.classList.add('chat-suggest-next-has-dropdown');
			// Create a dropdown container that wraps separator and chevron for a larger hit area
			const dropdownContainer = dom.append(button, dom.$('.chat-suggest-next-dropdown'));
			dropdownContainer.setAttribute('tabindex', '0');
			dropdownContainer.setAttribute('role', 'button');
			dropdownContainer.setAttribute('aria-label', localize('chat.suggestNext.moreOptions', 'More options for {0}', handoff.label));
			dropdownContainer.setAttribute('aria-haspopup', 'true');

			const separator = dom.append(dropdownContainer, dom.$('.chat-suggest-next-separator'));
			separator.setAttribute('aria-hidden', 'true');
			const chevron = dom.append(dropdownContainer, dom.$('.codicon.codicon-chevron-down.dropdown-chevron'));
			chevron.setAttribute('aria-hidden', 'true');

			const showContextMenu = (e: MouseEvent | KeyboardEvent, anchor?: HTMLElement) => {
				e.preventDefault();
				e.stopPropagation();

				const actions = availableContributions.map(contrib => {
					const provider = contrib.type === AgentSessionProviders.Background ? AgentSessionProviders.Background : AgentSessionProviders.Cloud;
					const icon = getAgentSessionProviderIcon(provider);
					const name = getAgentSessionProviderName(provider);
					return new Action(
						contrib.type,
						localize('continueIn', "Continue in {0}", name),
						ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : undefined,
						true,
						() => {
							this._onDidSelectPrompt.fire({ handoff, agentId: contrib.name });
						}
					);
				});

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor || dropdownContainer,
					getActions: () => actions,
					autoSelectFirstItem: true,
				});
			};

			disposables.add(dom.addDisposableListener(dropdownContainer, 'click', (e: MouseEvent) => {
				showContextMenu(e, dropdownContainer);
			}));

			disposables.add(dom.addDisposableListener(dropdownContainer, 'keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					showContextMenu(e, dropdownContainer);
				}
			}));
			disposables.add(dom.addDisposableListener(button, 'click', (e: MouseEvent) => {
				if (dom.isHTMLElement(e.target) && e.target.closest('.chat-suggest-next-dropdown')) {
					return;
				}
				this._onDidSelectPrompt.fire({ handoff });
			}));
		} else {
			disposables.add(dom.addDisposableListener(button, 'click', () => {
				this._onDidSelectPrompt.fire({ handoff });
			}));
		}

		disposables.add(dom.addDisposableListener(button, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._onDidSelectPrompt.fire({ handoff });
			}
		}));

		// Store disposables for this button so they can be disposed when the button is removed
		this.buttonDisposables.set(button, disposables);

		return button;
	}

	public hide(): void {
		if (this.domNode.style.display !== 'none') {
			this._currentMode = undefined;
			this.domNode.style.display = 'none';
			this._onDidChangeHeight.fire();
		}
	}

	public override dispose(): void {
		// Dispose all button disposables
		for (const disposables of this.buttonDisposables.values()) {
			disposables.dispose();
		}
		this.buttonDisposables.clear();
		super.dispose();
	}
}
