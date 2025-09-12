/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { $, append, getActiveWindow } from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { InputBox, MessageType } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from '../../../../../../base/browser/ui/tree/tree.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { FuzzyScore } from '../../../../../../base/common/filters.js';
import { createSingleCallFunction } from '../../../../../../base/common/functional.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import Severity from '../../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import * as nls from '../../../../../../nls.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { IEditableData } from '../../../../../common/views.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IChatService } from '../../../common/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatWidgetService } from '../../chat.js';
import { allowedChatMarkdownHtmlTags } from '../../chatMarkdownRenderer.js';
import { ChatSessionItemWithProvider, extractTimestamp, getSessionItemContextOverlay, isLocalChatSessionItem, processSessionsWithTimeGrouping } from '../common.js';
import '../../media/chatSessions.css';
import { LocalChatSessionsProvider } from '../localChatSessionsProvider.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { ChatSessionTracker } from '../chatSessionTracker.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';

interface ISessionTemplateData {
	readonly container: HTMLElement;
	readonly resourceLabel: IResourceLabel;
	readonly actionBar: ActionBar;
	readonly elementDisposable: DisposableStore;
	readonly timestamp: HTMLElement;
	readonly descriptionRow: HTMLElement;
	readonly descriptionLabel: HTMLElement;
	readonly statisticsLabel: HTMLElement;
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
	private appliedIconColorStyles = new Set<string>();
	private markdownRenderer: MarkdownRenderer;

	constructor(
		private readonly labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super();

		// Listen for theme changes to clear applied styles
		this._register(this.themeService.onDidColorThemeChange(() => {
			this.appliedIconColorStyles.clear();
		}));

		this.markdownRenderer = instantiationService.createInstance(MarkdownRenderer, {});
	}

	private applyIconColorStyle(iconId: string, colorId: string): void {
		const styleKey = `${iconId}-${colorId}`;
		if (this.appliedIconColorStyles.has(styleKey)) {
			return; // Already applied
		}

		const colorTheme = this.themeService.getColorTheme();
		const color = colorTheme.getColor(colorId);

		if (color) {
			// Target the ::before pseudo-element where the actual icon is rendered
			const css = `.monaco-workbench .chat-session-item .monaco-icon-label.codicon-${iconId}::before { color: ${color} !important; }`;
			const activeWindow = getActiveWindow();

			const styleId = `chat-sessions-icon-${styleKey}`;
			const existingStyle = activeWindow.document.getElementById(styleId);
			if (existingStyle) {
				existingStyle.textContent = css;
			} else {
				const styleElement = activeWindow.document.createElement('style');
				styleElement.id = styleId;
				styleElement.textContent = css;
				activeWindow.document.head.appendChild(styleElement);

				// Clean up on dispose
				this._register({
					dispose: () => {
						const activeWin = getActiveWindow();
						const style = activeWin.document.getElementById(styleId);
						if (style) {
							style.remove();
						}
					}
				});
			}

			this.appliedIconColorStyles.add(styleKey);
		} else {
			this.logService.debug('No color found for colorId:', colorId);
		}
	}

	get templateId(): string {
		return SessionsRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		const element = append(container, $('.chat-session-item'));

		// Create a container that holds the label, timestamp, and actions
		const contentContainer = append(element, $('.session-content'));
		const resourceLabel = this.labels.create(contentContainer, { supportHighlights: true });
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
			resourceLabel,
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
				return Codicon.loading;
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
			editableData = this.chatSessionsService.getEditableData(session.id);
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
		let iconResource: URI | undefined;
		let iconTheme: ThemeIcon | undefined;
		if (!session.iconPath && session.id !== LocalChatSessionsProvider.HISTORY_NODE_ID) {
			iconTheme = this.statusToIcon(session.status);
		} else {
			iconTheme = session.iconPath;
		}

		if (iconTheme?.color?.id) {
			this.applyIconColorStyle(iconTheme.id, iconTheme.color.id);
		}

		const renderDescriptionOnSecondRow = this.configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription) && session.provider.chatSessionType !== 'local';

		if (renderDescriptionOnSecondRow && session.description) {
			templateData.container.classList.toggle('multiline', true);
			templateData.descriptionRow.style.display = 'flex';
			if (typeof session.description === 'string') {
				templateData.descriptionLabel.textContent = session.description;
			} else {
				templateData.elementDisposable.add(this.markdownRenderer.render(session.description, {
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

		// Set the resource label
		templateData.resourceLabel.setResource({
			name: session.label,
			description: !renderDescriptionOnSecondRow && 'description' in session && typeof session.description === 'string' ? session.description : '',
			resource: iconResource
		}, {
			fileKind: undefined,
			icon: iconTheme,
			// Set tooltip on resourceLabel only for single-row items
			title: !renderDescriptionOnSecondRow || !session.description ? tooltipContent : undefined
		});

		// For two-row items, set tooltip on the container instead
		if (renderDescriptionOnSecondRow && session.description && tooltipContent) {
			if (typeof tooltipContent === 'string') {
				templateData.elementDisposable.add(
					this.hoverService.setupDelayedHover(templateData.container, { content: tooltipContent })
				);
			} else if (tooltipContent && typeof tooltipContent === 'object' && 'markdown' in tooltipContent) {
				templateData.elementDisposable.add(
					this.hoverService.setupDelayedHover(templateData.container, { content: tooltipContent.markdown })
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
		templateData.resourceLabel.clear();
		templateData.actionBar.clear();
	}

	private renderInputBox(container: HTMLElement, session: IChatSessionItem, editableData: IEditableData): DisposableStore {
		// Hide the existing resource label element and session content
		const existingResourceLabelElement = container.querySelector('.monaco-icon-label') as HTMLElement;
		if (existingResourceLabelElement) {
			existingResourceLabelElement.style.display = 'none';
		}

		// Hide the session content container to avoid layout conflicts
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
		templateData.resourceLabel.dispose();
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
				if (this.provider.chatSessionType !== 'local') {
					const hybridSessions = await this.sessionTracker.getHybridSessionsForProvider(this.provider);
					itemsWithProvider.push(...(hybridSessions as ChatSessionItemWithProvider[]));
				}

				// For non-local providers, apply time-based sorting and grouping
				if (this.provider.chatSessionType !== 'local') {
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
			const allHistory = await this.chatService.getHistory();

			// Create history items with provider reference and timestamps
			const historyItems = allHistory.map((historyDetail: any): ChatSessionItemWithProvider => ({
				id: historyDetail.sessionId,
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
		if (element.description && this.configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription) && element.provider.chatSessionType !== 'local') {
			return SessionsDelegate.ITEM_HEIGHT_WITH_DESCRIPTION;
		} else {
			return SessionsDelegate.ITEM_HEIGHT;
		}
	}

	getTemplateId(element: ChatSessionItemWithProvider): string {
		return SessionsRenderer.TEMPLATE_ID;
	}
}
