/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../common/constants.js';
import { IChatMode } from '../../../common/chatModes.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IHandOff } from '../../../common/promptSyntax/promptFileParser.js';
import { IChatWidgetService } from '../../chat.js';
import { getAgentCanContinueIn, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../agentSessions/agentSessions.js';

export interface INextPromptSelection {
	readonly handoff: IHandOff;
	readonly agentId?: string;
	readonly withAutopilot?: boolean;
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
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
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

		const isAutopilotPolicyRestricted = this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const firstAutoSendHandoff = !isAutopilotPolicyRestricted ? handoffs.find(h => h.send) : undefined;

		for (const handoff of handoffs) {
			const promptButton = this.createPromptButton(handoff);
			this.promptsContainer.appendChild(promptButton);

			if (handoff === firstAutoSendHandoff) {
				const autopilotButton = this.createAutopilotButton(handoff);
				this.promptsContainer.appendChild(autopilotButton);
			}
		}

		if (CommandsRegistry.getCommand(OPEN_AGENTS_WINDOW_COMMAND_ID)) {
			const handoffButton = this.createAgentsWindowHandoffButton(handoffs[0]);
			this.promptsContainer.appendChild(handoffButton);
		}

		this.domNode.style.display = 'flex';
		this._onDidChangeHeight.fire();
	}

	private createAgentsWindowHandoffButton(seedHandoff: IHandOff): HTMLElement {
		const disposables = new DisposableStore();
		const label = localize('chat.suggestNext.continueInAgentsWindow', "Continue in Agents Window");

		const handoffLabel = seedHandoff.label;
		const getCurrentHandoff = (): IHandOff | undefined => {
			const currentHandoffs = this._currentMode?.handOffs?.get();
			return currentHandoffs?.find(h => h.label === handoffLabel) ?? seedHandoff;
		};

		const button = dom.$('.chat-welcome-view-suggested-prompt.chat-suggest-next-handoff');
		button.setAttribute('tabindex', '0');
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', label);

		const iconEl = dom.append(button, dom.$('.codicon.codicon-window'));
		iconEl.setAttribute('aria-hidden', 'true');
		const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
		titleElement.textContent = label;

		const trigger = () => {
			const current = getCurrentHandoff();
			const handoffPrompt = current?.prompt?.trim() || '';
			const transcript = this.captureChatTranscript();
			const query = this.composeAgentsWindowQuery(handoffPrompt, transcript);
			const folderUri = this.workspaceContextService.getWorkspace().folders[0]?.uri;
			this.commandService.executeCommand(OPEN_AGENTS_WINDOW_COMMAND_ID, {
				folderUri: folderUri?.scheme === Schemas.file ? folderUri.toJSON() : undefined,
				initialQuery: query,
			});
		};

		disposables.add(dom.addDisposableListener(button, 'click', trigger));
		disposables.add(dom.addDisposableListener(button, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				trigger();
			}
		}));

		this.buttonDisposables.set(button, disposables);
		return button;
	}

	/**
	 * Pull a compact transcript of the current chat — last user request and
	 * the assistant reply — so the Agents-window CLI session has the context
	 * that produced this handoff, not just the static handoff prompt.
	 */
	private captureChatTranscript(): { lastUserMessage: string; lastAssistantReply: string } {
		const widget = this.chatWidgetService.lastFocusedWidget;
		const requests = widget?.viewModel?.model.getRequests() ?? [];
		const last = requests.at(-1);
		return {
			lastUserMessage: last?.message?.text?.trim() ?? '',
			lastAssistantReply: last?.response?.response.toString().trim() ?? '',
		};
	}

	private composeAgentsWindowQuery(handoffPrompt: string, transcript: { lastUserMessage: string; lastAssistantReply: string }): string {
		const parts: string[] = [];
		parts.push(localize('chat.suggestNext.handoffHeader', "Handing off from VS Code chat. Original request:"));
		if (transcript.lastUserMessage) {
			parts.push('', '> ' + transcript.lastUserMessage.split('\n').join('\n> '));
		}
		if (transcript.lastAssistantReply) {
			parts.push('', localize('chat.suggestNext.handoffPlanHeader', "Plan from VS Code chat:"), '', transcript.lastAssistantReply);
		}
		if (handoffPrompt) {
			parts.push('', '---', '', handoffPrompt);
		} else if (!transcript.lastUserMessage && !transcript.lastAssistantReply) {
			parts.push('', localize('chat.suggestNext.handoffDefaultQuery', "Continue the previous chat."));
		}
		return parts.join('\n');
	}

	private createPromptButton(handoff: IHandOff): HTMLElement {
		const disposables = new DisposableStore();

		// Capture the label to look up the current handoff at click time
		// This ensures we get the latest handoff data (e.g., updated model from settings)
		const handoffLabel = handoff.label;
		const getCurrentHandoff = (): IHandOff | undefined => {
			const currentHandoffs = this._currentMode?.handOffs?.get();
			return currentHandoffs?.find(h => h.label === handoffLabel) ?? handoff;
		};

		const button = dom.$('.chat-welcome-view-suggested-prompt');
		button.setAttribute('tabindex', '0');
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', localize('chat.suggestNext.item', '{0}', handoff.label));

		const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
		titleElement.textContent = handoff.label;

		// Optional showContinueOn behaves like send: only present if specified
		const showContinueOn = handoff.showContinueOn ?? true;

		// Get chat session contributions to show in chevron dropdown
		// Filter to only first-party providers that support "continue in".
		// TODO: Expand later to any agent with `canDelegate` === true.
		const currentSessionType = this.contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatSessionType.key);
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		const availableContributions = contributions.filter(c => {
			if (!c.canDelegate) {
				return false;
			}
			if (c.type === currentSessionType) {
				return false;
			}
			const provider = getAgentSessionProvider(c.type);
			return provider !== undefined && getAgentCanContinueIn(provider);
		});

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
					const provider = getAgentSessionProvider(contrib.type)!;
					const icon = getAgentSessionProviderIcon(provider);
					const name = getAgentSessionProviderName(provider);
					return new Action(
						contrib.type,
						localize('continueIn', "Continue in {0}", name),
						ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : undefined,
						true,
						() => {
							const currentHandoff = getCurrentHandoff();
							if (currentHandoff) {
								this._onDidSelectPrompt.fire({ handoff: currentHandoff, agentId: contrib.name });
							}
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
				const currentHandoff = getCurrentHandoff();
				if (currentHandoff) {
					this._onDidSelectPrompt.fire({ handoff: currentHandoff });
				}
			}));
		} else {
			disposables.add(dom.addDisposableListener(button, 'click', () => {
				const currentHandoff = getCurrentHandoff();
				if (currentHandoff) {
					this._onDidSelectPrompt.fire({ handoff: currentHandoff });
				}
			}));
		}

		disposables.add(dom.addDisposableListener(button, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const currentHandoff = getCurrentHandoff();
				if (currentHandoff) {
					this._onDidSelectPrompt.fire({ handoff: currentHandoff });
				}
			}
		}));

		// Store disposables for this button so they can be disposed when the button is removed
		this.buttonDisposables.set(button, disposables);

		return button;
	}

	private createAutopilotButton(handoff: IHandOff): HTMLElement {
		const disposables = new DisposableStore();

		const handoffLabel = handoff.label;
		const getCurrentHandoff = (): IHandOff | undefined => {
			const currentHandoffs = this._currentMode?.handOffs?.get();
			return currentHandoffs?.find(h => h.label === handoffLabel) ?? handoff;
		};

		const label = localize('chat.suggestNext.startWithAutopilot', "Start with Autopilot");
		const button = dom.$('.chat-welcome-view-suggested-prompt');
		button.setAttribute('tabindex', '0');
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', label);

		const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
		titleElement.textContent = label;

		disposables.add(dom.addDisposableListener(button, 'click', () => {
			const currentHandoff = getCurrentHandoff();
			if (currentHandoff) {
				this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
			}
		}));

		disposables.add(dom.addDisposableListener(button, 'keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const currentHandoff = getCurrentHandoff();
				if (currentHandoff) {
					this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
				}
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
