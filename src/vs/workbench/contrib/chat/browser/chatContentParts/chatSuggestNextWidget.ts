/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button, ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IChatMode } from '../../common/chatModes.js';
import { IHandOff } from '../../common/promptSyntax/service/newPromptsParser.js';

export interface INextPromptSelection {
	readonly handoff: IHandOff;
}

export class ChatSuggestNextWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _onDidSelectPrompt = this._register(new Emitter<INextPromptSelection>());
	public readonly onDidSelectPrompt: Event<INextPromptSelection> = this._onDidSelectPrompt.event;

	private readonly _isExpanded = observableValue<boolean>(this, true);
	private headerButton!: ButtonWithIcon;
	private actionButton: Button | undefined;
	private actionContainer!: HTMLElement;
	private contentContainer!: HTMLElement;
	private promptListContainer!: HTMLElement;
	private _currentMode: IChatMode | undefined;
	private _firstHandoff: IHandOff | undefined;

	constructor() {
		super();
		this.domNode = this.createSuggestNextWidget();
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	public getCurrentMode(): IChatMode | undefined {
		return this._currentMode;
	}

	/**
	 * Updates the ARIA label for the widget to announce expanded/collapsed state
	 */
	private updateAriaLabel(element: HTMLElement, modeLabel: string, expanded: boolean): void {
		const label = localize('chat.suggestNext.title', "Continue with {0}?", modeLabel);
		element.ariaLabel = expanded
			? localize('suggestNextExpanded', "{0}, expanded", label)
			: localize('suggestNextCollapsed', "{0}, collapsed", label);
	}

	private createSuggestNextWidget(): HTMLElement {
		const container = dom.$('.chat-suggest-next-widget');
		container.style.display = 'none';
		container.setAttribute('tabindex', '0');

		const header = dom.$('.suggest-next-header');

		// Create title container for collapsible header button
		const titleContainer = dom.$('.suggest-next-header-title');
		this.headerButton = this._register(new ButtonWithIcon(titleContainer, {
			secondary: true,
			title: '',
			supportIcons: true
		}));
		header.appendChild(titleContainer);

		// Create subtitle
		const subtitleContainer = dom.$('.suggest-next-subtitle');
		subtitleContainer.textContent = localize('chat.suggestNext.subtitle', "Keep iterating or proceed:");
		header.appendChild(subtitleContainer);		// Create action button container (shown when collapsed)
		this.actionContainer = dom.$('.suggest-next-header-actions');
		header.appendChild(this.actionContainer);

		container.appendChild(header);

		// Create collapsible content wrapper
		this.contentContainer = dom.$('.suggest-next-content');
		this.promptListContainer = dom.$('.suggest-next-list');
		this.promptListContainer.setAttribute('role', 'list');
		this.contentContainer.appendChild(this.promptListContainer);
		container.appendChild(this.contentContainer);

		// Set up collapse/expand behavior with observable
		this._register(autorun(reader => {
			const expanded = this._isExpanded.read(reader);

			// Update icon
			this.headerButton.icon = expanded ? Codicon.chevronDown : Codicon.chevronRight;

			// Toggle content visibility
			this.contentContainer.classList.toggle('hidden', !expanded);
			container.classList.toggle('chat-suggest-next-collapsed', !expanded);

			// Show/hide action button based on collapsed state
			if (!expanded && this._firstHandoff) {
				if (!this.actionButton) {
					this.actionButton = this._register(new Button(this.actionContainer, {
						secondary: false,
						title: this._firstHandoff.label
					}));
					this.actionButton.label = this._firstHandoff.label;
					this._register(this.actionButton.onDidClick(() => {
						if (this._firstHandoff) {
							this._onDidSelectPrompt.fire({ handoff: this._firstHandoff });
						}
					}));
				}
				this.actionContainer.style.display = 'flex';
			} else {
				this.actionContainer.style.display = 'none';
			}

			// Update ARIA label
			if (this._currentMode) {
				this.updateAriaLabel(container, this._currentMode.label, expanded);
			}

			// Fire height change immediately after DOM updates
			this._onDidChangeHeight.fire();
		}));

		// Header button click handler
		this._register(this.headerButton.onDidClick(() => {
			this._isExpanded.set(!this._isExpanded.get(), undefined, undefined);
		}));

		return container;
	}

	public render(mode: IChatMode): void {
		const handoffs = mode.handOffs?.get();

		if (!handoffs || handoffs.length === 0) {
			this.hide();
			return;
		}

		this._currentMode = mode;

		// Update header button label
		this.headerButton.label = localize('chat.suggestNext.title', "Continue with {0}?", mode.label);

		// Track first handoff for collapsed state action button
		if (handoffs.length > 0) {
			this._firstHandoff = handoffs[0];
			// Update action button if it exists
			if (this.actionButton) {
				this.actionButton.label = this._firstHandoff.label;
				this.actionButton.setTitle(this._firstHandoff.label);
			}
		}

		// Clear and rebuild prompt list
		this.promptListContainer.textContent = '';

		for (const handoff of handoffs) {
			const promptItem = this.createPromptItem(handoff);
			this.promptListContainer.appendChild(promptItem);
		}

		this.domNode.style.display = 'block';
		this._onDidChangeHeight.fire();
	}

	private createPromptItem(handoff: IHandOff): HTMLElement {
		const item = dom.$('.suggest-next-item');
		item.setAttribute('role', 'listitem');
		item.setAttribute('tabindex', '0');
		item.setAttribute('aria-label', localize('chat.suggestNext.item', '{0}', handoff.label));

		const descriptionElement = dom.$('.suggest-next-prompt-description');
		descriptionElement.textContent = handoff.label;
		item.appendChild(descriptionElement);

		// Click handler
		this._register(dom.addDisposableListener(item, 'click', () => {
			this._onDidSelectPrompt.fire({ handoff });
		}));

		// Keyboard handler
		this._register(dom.addDisposableListener(item, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._onDidSelectPrompt.fire({ handoff });
			}
		}));

		return item;
	}

	public hide(): void {
		if (this.domNode.style.display !== 'none') {
			this._currentMode = undefined;
			this._firstHandoff = undefined;
			// Reset to expanded state for next show
			this._isExpanded.set(true, undefined, undefined);
			this.domNode.style.display = 'none';
			this._onDidChangeHeight.fire();
		}
	}
}
