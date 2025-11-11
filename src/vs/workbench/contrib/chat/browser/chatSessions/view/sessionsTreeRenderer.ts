/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { $, append } from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { IconLabel } from '../../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { InputBox, MessageType } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from '../../../../../../base/browser/ui/tree/tree.js';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { FuzzyScore, createMatches } from '../../../../../../base/common/filters.js';
import { createSingleCallFunction } from '../../../../../../base/common/functional.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import Severity from '../../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import * as nls from '../../../../../../nls.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import product from '../../../../../../platform/product/common/product.js';
import { defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { IEditableData, ViewContainerLocation } from '../../../../../common/views.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Position } from '../../../../../services/layout/browser/layoutService.js';
import { getLocalHistoryDateFormatter } from '../../../../localHistory/browser/localHistory.js';
import { IChatService } from '../../../common/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { chatSessionResourceToId } from '../../../common/chatUri.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatWidgetService } from '../../chat.js';
import { allowedChatMarkdownHtmlTags } from '../../chatContentMarkdownRenderer.js';
import '../../media/chatSessions.css';
import { ChatSessionTracker } from '../chatSessionTracker.js';
import { ChatSessionItemWithProvider, extractTimestamp, getSessionItemContextOverlay, isLocalChatSessionItem, processSessionsWithTimeGrouping } from '../common.js';
import { LocalChatSessionsProvider } from '../localChatSessionsProvider.js';

interface ISessionTemplateData {
	readonly container: HTMLElement;
	readonly iconLabel: IconLabel;
	readonly actionBar: ActionBar;
	readonly elementDisposable: DisposableStore;
	readonly timestamp: HTMLElement;
	readonly descriptionRow: HTMLElement;
	readonly descriptionLabel: HTMLElement;
	readonly statisticsLabel: HTMLElement;
	readonly customIcon: HTMLElement;
}

export interface IGettingStartedItem {
	id: string;
	label: string;
	commandId: string;
	icon?: ThemeIcon;
	args?: any[];
}

export class GettingStartedDelegate implements IListVirtualDelegate<IGettingStartedItem> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return 'gettingStartedItem';
	}
}

interface IGettingStartedTemplateData {
	resourceLabel: IResourceLabel;
}

export class GettingStartedRenderer implements IListRenderer<IGettingStartedItem, IGettingStartedTemplateData> {
	readonly templateId = 'gettingStartedItem';

	constructor(private readonly labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): IGettingStartedTemplateData {
		const resourceLabel = this.labels.create(container, { supportHighlights: true });
		return { resourceLabel };
	}

	renderElement(element: IGettingStartedItem, index: number, templateData: IGettingStartedTemplateData): void {
		templateData.resourceLabel.setResource({
			name: element.label,
			resource: undefined
		}, {
			icon: element.icon,
			hideIcon: false
		});
		templateData.resourceLabel.element.setAttribute('data-command', element.commandId);
	}

	disposeTemplate(templateData: IGettingStartedTemplateData): void {
		templateData.resourceLabel.dispose();
	}
}

export class SessionsRenderer extends Disposable implements ITreeRenderer<IChatSessionItem, FuzzyScore, ISessionTemplateData> {
	static readonly TEMPLATE_ID = 'session';

	constructor(
		private readonly viewLocation: ViewContainerLocation | null,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
	}

	get templateId(): string {
		return SessionsRenderer.TEMPLATE_ID;
	}

	private getHoverPosition(): HoverPosition {
		const sideBarPosition = this.layoutService.getSideBarPosition();
		switch (this.viewLocation) {
			case ViewContainerLocation.Sidebar:
				return sideBarPosition === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
			case ViewContainerLocation.AuxiliaryBar:
				return sideBarPosition === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
			default:
				return HoverPosition.RIGHT;
		}
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		const element = append(container, $('.chat-session-item'));

		// Create a container that holds the label, timestamp, and actions
		const contentContainer = append(element, $('.session-content'));
		// Custom icon element rendered separately from label text
		const customIcon = append(contentContainer, $('.chat-session-custom-icon'));
		const iconLabel = new IconLabel(contentContainer, { supportHighlights: true, supportIcons: true });
		const descriptionRow = append(element, $('.description-row'));
		const descriptionLabel = append(descriptionRow, $('span.description'));
		const statisticsLabel = append(descriptionRow, $('span.statistics'));

		// Create timestamp container and element
		const timestampContainer = append(contentContainer, $('.timestamp-container'));
		const timestamp = append(timestampContainer, $('.timestamp'));

		const actionsContainer = append(contentContainer, $('.actions'));
		const actionBar = new ActionBar(actionsContainer);
		const elementDisposable = new DisposableStore();

		return {
			container: element,
			iconLabel,
			customIcon,
			actionBar,
			elementDisposable,
			timestamp,
			descriptionRow,
			descriptionLabel,
			statisticsLabel,
		};
	}

	statusToIcon(status?: ChatSessionStatus) {
		switch (status) {
			case ChatSessionStatus.InProgress:
				return ThemeIcon.modify(Codicon.loading, 'spin');
			case ChatSessionStatus.Completed:
				return Codicon.pass;
			case ChatSessionStatus.Failed:
				return Codicon.error;
			default:
				return Codicon.circleOutline;
		}

	}

	renderElement(element: ITreeNode<IChatSessionItem, FuzzyScore>, index: number, templateData: ISessionTemplateData): void {
		const session = element.element as ChatSessionItemWithProvider;

		// Add CSS class for local sessions
		let editableData: IEditableData | undefined;
		if (isLocalChatSessionItem(session)) {
			templateData.container.classList.add('local-session');
			editableData = this.chatSessionsService.getEditableData(session.resource);
		} else {
			templateData.container.classList.remove('local-session');
		}

		// Check if this session is being edited using the actual session ID
		if (editableData) {
			// Render input box for editing
			templateData.actionBar.clear();
			const editDisposable = this.renderInputBox(templateData.container, session, editableData);
			templateData.elementDisposable.add(editDisposable);
			return;
		}

		// Normal rendering - clear the action bar in case it was used for editing
		templateData.actionBar.clear();

		// Handle different icon types
		let iconTheme: ThemeIcon | undefined;
		if (!session.iconPath && session.id !== LocalChatSessionsProvider.HISTORY_NODE_ID) {
			iconTheme = this.statusToIcon(session.status);
		} else {
			iconTheme = session.iconPath;
		}

		const renderDescriptionOnSecondRow = this.configurationService.getValue<boolean>(ChatConfiguration.ShowAgentSessionsViewDescription) && session.provider.chatSessionType !== localChatSessionType;

		if (renderDescriptionOnSecondRow && session.description) {
			templateData.container.classList.toggle('multiline', true);
			templateData.descriptionRow.style.display = 'flex';
			if (typeof session.description === 'string') {
				templateData.descriptionLabel.textContent = session.description;
			} else {
				templateData.elementDisposable.add(this.markdownRendererService.render(session.description, {
					sanitizerConfig: {
						replaceWithPlaintext: true,
						allowedTags: {
							override: allowedChatMarkdownHtmlTags,
						},
						allowedLinkSchemes: { augment: [product.urlProtocol] }
					},
				}, templateData.descriptionLabel));
				templateData.elementDisposable.add(DOM.addDisposableListener(templateData.descriptionLabel, 'mousedown', e => e.stopPropagation()));
				templateData.elementDisposable.add(DOM.addDisposableListener(templateData.descriptionLabel, 'click', e => e.stopPropagation()));
				templateData.elementDisposable.add(DOM.addDisposableListener(templateData.descriptionLabel, 'auxclick', e => e.stopPropagation()));
			}

			DOM.clearNode(templateData.statisticsLabel);
			const insertionNode = append(templateData.statisticsLabel, $('span.insertions'));
			insertionNode.textContent = session.statistics ? `+${session.statistics.insertions}` : '';
			const deletionNode = append(templateData.statisticsLabel, $('span.deletions'));
			deletionNode.textContent = session.statistics ? `-${session.statistics.deletions}` : '';
		} else {
			templateData.container.classList.toggle('multiline', false);
		}

		// Prepare tooltip content
		const tooltipContent = 'tooltip' in session && session.tooltip ?
			(typeof session.tooltip === 'string' ? session.tooltip :
				isMarkdownString(session.tooltip) ? {
					markdown: session.tooltip,
					markdownNotSupportedFallback: session.tooltip.value
				} : undefined) :
			undefined;

		templateData.customIcon.className = iconTheme ? `chat-session-custom-icon ${ThemeIcon.asClassName(iconTheme)}` : '';

		// Set the icon label
		templateData.iconLabel.setLabel(
			session.label,
			!renderDescriptionOnSecondRow && typeof session.description === 'string' ? session.description : undefined,
			{
				title: !renderDescriptionOnSecondRow || !session.description ? tooltipContent : undefined,
				matches: createMatches(element.filterData)
			}
		);

		// For two-row items, set tooltip on the container instead
		if (renderDescriptionOnSecondRow && session.description && tooltipContent) {
			if (typeof tooltipContent === 'string') {
				templateData.elementDisposable.add(
					this.hoverService.setupDelayedHover(templateData.container, () => ({
						content: tooltipContent,
						style: HoverStyle.Pointer,
						position: { hoverPosition: this.getHoverPosition() }
					}), { groupId: 'chat.sessions' })
				);
			} else if (tooltipContent && typeof tooltipContent === 'object' && 'markdown' in tooltipContent) {
				templateData.elementDisposable.add(
					this.hoverService.setupDelayedHover(templateData.container, () => ({
						content: tooltipContent.markdown,
						style: HoverStyle.Pointer,
						position: { hoverPosition: this.getHoverPosition() }
					}), { groupId: 'chat.sessions' })
				);
			}
		}

		// Handle timestamp display and grouping
		const hasTimestamp = session.timing?.startTime !== undefined;
		if (hasTimestamp) {
			templateData.timestamp.textContent = session.relativeTime ?? '';
			templateData.timestamp.ariaLabel = session.relativeTimeFullWord ?? '';
			templateData.timestamp.parentElement!.classList.toggle('timestamp-duplicate', session.hideRelativeTime === true);
			templateData.timestamp.parentElement!.style.display = '';

			// Add tooltip showing full date/time when hovering over the timestamp
			if (session.timing?.startTime) {
				const fullDateTime = getLocalHistoryDateFormatter().format(session.timing.startTime);
				templateData.elementDisposable.add(
					this.hoverService.setupDelayedHover(templateData.timestamp, () => ({
						content: nls.localize('chat.sessions.lastActivity', 'Last Activity: {0}', fullDateTime),
						style: HoverStyle.Pointer,
						position: { hoverPosition: this.getHoverPosition() }
					}), { groupId: 'chat.sessions' })
				);
			}
		} else {
			// Hide timestamp container if no timestamp available
			templateData.timestamp.parentElement!.style.display = 'none';
		}

		// Create context overlay for this specific session item
		const contextOverlay = getSessionItemContextOverlay(
			session,
			session.provider,
			this.chatWidgetService,
			this.chatService,
			this.editorGroupsService
		);

		const contextKeyService = this.contextKeyService.createOverlay(contextOverlay);

		// Create menu for this session item
		const menu = templateData.elementDisposable.add(
			this.menuService.createMenu(MenuId.ChatSessionsMenu, contextKeyService)
		);

		// Setup action bar with contributed actions
		const setupActionBar = () => {
			templateData.actionBar.clear();

			// Create marshalled context for command execution
			const marshalledSession = {
				session: session,
				$mid: MarshalledId.ChatSessionContext
			};

			const actions = menu.getActions({ arg: marshalledSession, shouldForwardArgs: true });

			const { primary } = getActionBarActions(
				actions,
				'inline',
			);

			templateData.actionBar.push(primary, { icon: true, label: false });

			// Set context for the action bar
			templateData.actionBar.context = session;
		};

		// Setup initial action bar and listen for menu changes
		templateData.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
		setupActionBar();
	}

	disposeElement(_element: ITreeNode<IChatSessionItem, FuzzyScore>, _index: number, templateData: ISessionTemplateData): void {
		templateData.elementDisposable.clear();
		templateData.actionBar.clear();
	}

	private renderInputBox(container: HTMLElement, session: IChatSessionItem, editableData: IEditableData): DisposableStore {
		// Hide the existing resource label element and session content
		// eslint-disable-next-line no-restricted-syntax
		const existingResourceLabelElement = container.querySelector('.monaco-icon-label') as HTMLElement;
		if (existingResourceLabelElement) {
			existingResourceLabelElement.style.display = 'none';
		}

		// Hide the session content container to avoid layout conflicts
		// eslint-disable-next-line no-restricted-syntax
		const sessionContentElement = container.querySelector('.session-content') as HTMLElement;
		if (sessionContentElement) {
			sessionContentElement.style.display = 'none';
		}

		// Create a simple container that mimics the file explorer's structure
		const editContainer = DOM.append(container, DOM.$('.explorer-item.explorer-item-edited'));

		// Add the icon
		const iconElement = DOM.append(editContainer, DOM.$('.codicon'));
		if (session.iconPath && ThemeIcon.isThemeIcon(session.iconPath)) {
			iconElement.classList.add(`codicon-${session.iconPath.id}`);
		} else {
			iconElement.classList.add('codicon-file'); // Default file icon
		}

		// Create the input box directly
		const inputBox = new InputBox(editContainer, this.contextViewService, {
			validationOptions: {
				validation: (value) => {
					const message = editableData.validationMessage(value);
					if (!message || message.severity !== Severity.Error) {
						return null;
					}
					return {
						content: message.content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: nls.localize('chatSessionInputAriaLabel', "Type session name. Press Enter to confirm or Escape to cancel."),
			inputBoxStyles: defaultInputBoxStyles,
		});

		inputBox.value = session.label;
		inputBox.focus();
		inputBox.select({ start: 0, end: session.label.length });

		const done = createSingleCallFunction((success: boolean, finishEditing: boolean) => {
			const value = inputBox.value;

			// Clean up the edit container
			editContainer.style.display = 'none';
			editContainer.remove();

			// Restore the original resource label
			if (existingResourceLabelElement) {
				existingResourceLabelElement.style.display = '';
			}

			// Restore the session content container
			// eslint-disable-next-line no-restricted-syntax
			const sessionContentElement = container.querySelector('.session-content') as HTMLElement;
			if (sessionContentElement) {
				sessionContentElement.style.display = '';
			}

			if (finishEditing) {
				editableData.onFinish(value, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputValid()) {
				const message = editableData.validationMessage(inputBox.value);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						formatContent: true,
						type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
					});
				} else {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const disposables: IDisposable[] = [
			inputBox,
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: StandardKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					if (!inputBox.validate()) {
						done(true, true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false, true);
				}
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, () => {
				showInputBoxNotification();
			}),
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, async () => {
				while (true) {
					await timeout(0);

					const ownerDocument = inputBox.inputElement.ownerDocument;
					if (!ownerDocument.hasFocus()) {
						break;
					}
					if (DOM.isActiveElement(inputBox.inputElement)) {
						return;
					} else if (DOM.isHTMLElement(ownerDocument.activeElement) && DOM.hasParentWithClass(ownerDocument.activeElement, 'context-view')) {
						// Do nothing - context menu is open
					} else {
						break;
					}
				}

				done(inputBox.isInputValid(), true);
			})
		];

		const disposableStore = new DisposableStore();
		disposables.forEach(d => disposableStore.add(d));
		disposableStore.add(toDisposable(() => done(false, false)));
		return disposableStore;
	}

	disposeTemplate(templateData: ISessionTemplateData): void {
		templateData.elementDisposable.dispose();
		templateData.iconLabel.dispose();
		templateData.actionBar.dispose();
	}
}

// Chat sessions item data source for the tree
export class SessionsDataSource implements IAsyncDataSource<IChatSessionItemProvider, ChatSessionItemWithProvider> {

	constructor(
		private readonly provider: IChatSessionItemProvider,
		private readonly chatService: IChatService,
		private readonly sessionTracker: ChatSessionTracker,
	) {
	}

	hasChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): boolean {
		const isProvider = element === this.provider;
		if (isProvider) {
			// Root provider always has children
			return true;
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
			return true;
		}

		return false;
	}

	async getChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): Promise<ChatSessionItemWithProvider[]> {
		if (element === this.provider) {
			try {
				const items = await this.provider.provideChatSessionItems(CancellationToken.None);
				const itemsWithProvider = items.map(item => {
					const itemWithProvider: ChatSessionItemWithProvider = { ...item, provider: this.provider };

					// Extract timestamp using the helper function
					itemWithProvider.timing = { startTime: extractTimestamp(item) ?? 0 };

					return itemWithProvider;
				});

				// Add hybrid local editor sessions for this provider using the centralized service
				if (this.provider.chatSessionType !== localChatSessionType) {
					const hybridSessions = await this.sessionTracker.getHybridSessionsForProvider(this.provider);
					const existingSessions = new ResourceSet();
					itemsWithProvider.forEach(s => existingSessions.add(s.resource));

					hybridSessions.forEach(session => {
						if (!existingSessions.has(session.resource)) {
							itemsWithProvider.push(session as ChatSessionItemWithProvider);
							existingSessions.add(session.resource);
						}
					});
					processSessionsWithTimeGrouping(itemsWithProvider);
				}

				return itemsWithProvider;
			} catch (error) {
				return [];
			}
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
			return this.getHistoryItems();
		}

		// Individual session items don't have children
		return [];
	}

	private async getHistoryItems(): Promise<ChatSessionItemWithProvider[]> {
		try {
			// Get all chat history
			const allHistory = await this.chatService.getLocalSessionHistory();

			// Create history items with provider reference and timestamps
			const historyItems = allHistory.map((historyDetail): ChatSessionItemWithProvider => ({
				id: chatSessionResourceToId(historyDetail.sessionResource),
				resource: historyDetail.sessionResource,
				label: historyDetail.title,
				iconPath: Codicon.chatSparkle,
				provider: this.provider,
				timing: {
					startTime: historyDetail.lastMessageDate ?? Date.now()
				},
				isHistory: true,
			}));

			// Apply sorting and time grouping
			processSessionsWithTimeGrouping(historyItems);

			return historyItems;

		} catch (error) {
			return [];
		}
	}
}


export class SessionsDelegate implements IListVirtualDelegate<ChatSessionItemWithProvider> {
	static readonly ITEM_HEIGHT = 22;
	static readonly ITEM_HEIGHT_WITH_DESCRIPTION = 44; // Slightly smaller for cleaner look

	constructor(private readonly configurationService: IConfigurationService) { }

	getHeight(element: ChatSessionItemWithProvider): number {
		// Return consistent height for all items (single-line layout)
		if (element.description && this.configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription) && element.provider.chatSessionType !== localChatSessionType) {
			return SessionsDelegate.ITEM_HEIGHT_WITH_DESCRIPTION;
		} else {
			return SessionsDelegate.ITEM_HEIGHT;
		}
	}

	getTemplateId(element: ChatSessionItemWithProvider): string {
		return SessionsRenderer.TEMPLATE_ID;
	}
}
