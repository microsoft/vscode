/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatMode } from '../../../common/chatModes.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IHandOff } from '../../../common/promptSyntax/promptFileParser.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../agentSessions/agentSessions.js';

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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService
	) {
		super();
		this.domNode = this.createSuggestNextWidget();
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	/**
	 * Resolves model reference strings that use template syntax `${settingKey}`.
	 * Returns undefined if the setting is empty or the template is unknown.
	 */
	public resolveModelReference(model: string): string | undefined {
		const templateMatch = model.match(/^\$\{(.+)\}$/);
		if (templateMatch) {
			const settingKey = templateMatch[1];
			if (settingKey === ChatConfiguration.FastImplementModel) {
				const settingValue = this.configurationService.getValue<string>(ChatConfiguration.FastImplementModel);
				if (!settingValue || settingValue.trim() === '') {
					return undefined;
				}
				return settingValue;
			}
			return undefined;
		}
		return model;
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

	public render(mode: IChatMode, isModelAvailable?: (model: string) => boolean): void {
		const handoffs = mode.handOffs?.get();

		if (!handoffs || handoffs.length === 0) {
			this.hide();
			return;
		}
		// Filter handoffs based on model availability
		const visibleHandoffs = handoffs.filter(handoff => {
			if (handoff.model) {
				const resolvedModel = this.resolveModelReference(handoff.model);
				if (resolvedModel === undefined) {
					return false;
				}
				if (isModelAvailable) {
					return isModelAvailable(resolvedModel);
				}
				return this.languageModelsService.lookupLanguageModel(resolvedModel) !== undefined;
			}
			return true;
		});

		if (visibleHandoffs.length === 0) {
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

		// Group handoffs by category - handoffs with the same category share a button with dropdown
		const categoryGroups = new Map<string, IHandOff[]>();
		const uncategorized: IHandOff[] = [];

		for (const handoff of visibleHandoffs) {
			if (handoff.category) {
				const group = categoryGroups.get(handoff.category) || [];
				group.push(handoff);
				categoryGroups.set(handoff.category, group);
			} else {
				uncategorized.push(handoff);
			}
		}

		const hasAvailableModel = (h: IHandOff): boolean => {
			if (!h.model) {
				return false;
			}
			const resolvedModel = this.resolveModelReference(h.model);
			if (resolvedModel === undefined) {
				return false;
			}
			if (isModelAvailable) {
				return isModelAvailable(resolvedModel);
			}
			return this.languageModelsService.lookupLanguageModel(resolvedModel) !== undefined;
		};

		// Sort each category so handoffs with available models come first (they become the main button)
		for (const [, group] of categoryGroups) {
			const sorted = [...group].sort((a, b) => {
				const aHasModel = hasAvailableModel(a);
				const bHasModel = hasAvailableModel(b);
				if (aHasModel && !bHasModel) {
					return -1;
				}
				if (!aHasModel && bHasModel) {
					return 1;
				}
				return 0;
			});

			const mainHandoff = sorted[0];
			const categoryHandoffs = sorted.slice(1);
			const promptButton = this.createPromptButton(mainHandoff, categoryHandoffs);
			this.promptsContainer.appendChild(promptButton);
		}

		for (const handoff of uncategorized) {
			const promptButton = this.createPromptButton(handoff);
			this.promptsContainer.appendChild(promptButton);
		}

		this.domNode.style.display = 'flex';
		this._onDidChangeHeight.fire();
	}

	private createPromptButton(handoff: IHandOff, categoryHandoffs?: IHandOff[]): HTMLElement {
		const disposables = new DisposableStore();

		const button = dom.$('.chat-welcome-view-suggested-prompt');
		button.setAttribute('tabindex', '0');
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', localize('chat.suggestNext.item', '{0}', handoff.label));

		const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
		titleElement.textContent = handoff.label;

		const mainShowContinueOn = handoff.showContinueOn ?? true;
		const anyInCategoryShowsContinueOn = categoryHandoffs?.some(h => h.showContinueOn !== false) ?? false;
		const showContinueOn = mainShowContinueOn || anyInCategoryShowsContinueOn;

		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		const availableContributions = contributions.filter(c => c.canDelegate);

		const hasCategoryHandoffs = categoryHandoffs && categoryHandoffs.length > 0;
		const hasContinueOnOptions = showContinueOn && availableContributions.length > 0;

		if (hasCategoryHandoffs || hasContinueOnOptions) {
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

				const actions: IAction[] = [];

				if (hasCategoryHandoffs) {
					for (const h of categoryHandoffs!) {
						actions.push(new Action(
							`category-handoff-${h.label}`,
							h.label,
							undefined,
							true,
							() => {
								this._onDidSelectPrompt.fire({ handoff: h });
							}
						));
					}
					if (hasContinueOnOptions) {
						actions.push(new Separator());
					}
				}

				if (hasContinueOnOptions) {
					for (const contrib of availableContributions) {
						const provider = contrib.type === AgentSessionProviders.Background ? AgentSessionProviders.Background : AgentSessionProviders.Cloud;
						const icon = getAgentSessionProviderIcon(provider);
						const name = getAgentSessionProviderName(provider);
						actions.push(new Action(
							contrib.type,
							localize('continueIn', "Continue in {0}", name),
							ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : undefined,
							true,
							() => {
								this._onDidSelectPrompt.fire({ handoff, agentId: contrib.name });
							}
						));
					}
				}

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
