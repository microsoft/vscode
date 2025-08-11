/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Button, ButtonWithDropdown, IButton, IButtonOptions } from '../../../../../base/browser/ui/button/button.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRenderResult, MarkdownRenderer, openLinkFromMarkdown } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { FocusMode } from '../../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { showChatView } from '../chat.js';
import './media/chatConfirmationWidget.css';

export interface IChatConfirmationButton {
	label: string;
	isSecondary?: boolean;
	tooltip?: string;
	data: any;
	disabled?: boolean;
	onDidChangeDisablement?: Event<boolean>;
	moreActions?: (IChatConfirmationButton | Separator)[];
}

export interface IChatConfirmationWidgetOptions {
	title: string | IMarkdownString;
	subtitle?: string | IMarkdownString;
	buttons: IChatConfirmationButton[];
	toolbarData?: { arg: any; partType: string };
}

export class ChatQueryTitlePart extends Disposable {
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly _renderedTitle = this._register(new MutableDisposable<IMarkdownRenderResult>());

	public get title() {
		return this._title;
	}

	public set title(value: string | IMarkdownString) {
		this._title = value;

		const next = this._renderer.render(this.toMdString(value), {
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		});

		const previousEl = this._renderedTitle.value?.element;
		if (previousEl?.parentElement) {
			previousEl.parentElement.replaceChild(next.element, previousEl);
		} else {
			this.element.appendChild(next.element); // unreachable?
		}

		this._renderedTitle.value = next;
	}

	constructor(
		private readonly element: HTMLElement,
		private _title: IMarkdownString | string,
		subtitle: string | IMarkdownString | undefined,
		private readonly _renderer: MarkdownRenderer,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();

		element.classList.add('chat-query-title-part');

		this._renderedTitle.value = _renderer.render(this.toMdString(_title), {
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		});
		element.append(this._renderedTitle.value.element);
		if (subtitle) {
			const str = this.toMdString(subtitle);
			const renderedTitle = this._register(_renderer.render(str, {
				asyncRenderCallback: () => this._onDidChangeHeight.fire(),
				actionHandler: { callback: link => openLinkFromMarkdown(this._openerService, link, str.isTrusted), disposables: this._store },
			}));
			const wrapper = document.createElement('small');
			wrapper.appendChild(renderedTitle.element);
			element.append(wrapper);
		}
	}

	private toMdString(value: string | IMarkdownString) {
		if (typeof value === 'string') {
			return new MarkdownString('', { supportThemeIcons: true }).appendText(value);
		} else {
			return new MarkdownString(value.value, { supportThemeIcons: true, isTrusted: value.isTrusted });
		}
	}
}

abstract class BaseChatConfirmationWidget extends Disposable {
	private _onDidClick = this._register(new Emitter<IChatConfirmationButton>());
	get onDidClick(): Event<IChatConfirmationButton> { return this._onDidClick.event; }

	protected _onDidChangeHeight = this._register(new Emitter<void>());
	get onDidChangeHeight(): Event<void> { return this._onDidChangeHeight.event; }

	private _domNode: HTMLElement;
	get domNode(): HTMLElement {
		return this._domNode;
	}

	private get showingButtons() {
		return !this.domNode.classList.contains('hideButtons');
	}

	setShowButtons(showButton: boolean): void {
		this.domNode.classList.toggle('hideButtons', !showButton);
	}

	private readonly messageElement: HTMLElement;
	protected readonly markdownRenderer: MarkdownRenderer;
	private readonly title: string | IMarkdownString;

	private readonly notification = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		options: IChatConfirmationWidgetOptions,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHostService private readonly _hostService: IHostService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const { title, subtitle, buttons } = options;
		this.title = title;

		const elements = dom.h('.chat-confirmation-widget@root', [
			dom.h('.chat-confirmation-widget-title@title'),
			dom.h('.chat-confirmation-widget-message@message'),
			dom.h('.chat-buttons-container@buttonsContainer', [
				dom.h('.chat-buttons@buttons'),
				dom.h('.chat-toolbar@toolbar'),
			]),
		]);
		this._domNode = elements.root;
		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});

		const titlePart = this._register(instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			title,
			subtitle,
			this.markdownRenderer,
		));

		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this.messageElement = elements.message;

		// Create buttons
		buttons.forEach(buttonData => {
			const buttonOptions: IButtonOptions = { ...defaultButtonStyles, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };

			let button: IButton;
			if (buttonData.moreActions) {
				button = new ButtonWithDropdown(elements.buttons, {
					...buttonOptions,
					contextMenuProvider: contextMenuService,
					addPrimaryActionToDropdown: false,
					actions: buttonData.moreActions.map(action => {
						if (action instanceof Separator) {
							return action;
						}
						return this._register(new Action(
							action.label,
							action.label,
							undefined,
							!action.disabled,
							() => {
								this._onDidClick.fire(action);
								return Promise.resolve();
							},
						));
					}),
				});
			} else {
				button = new Button(elements.buttons, buttonOptions);
			}

			this._register(button);
			button.label = buttonData.label;
			this._register(button.onDidClick(() => this._onDidClick.fire(buttonData)));
			if (buttonData.onDidChangeDisablement) {
				this._register(buttonData.onDidChangeDisablement(disabled => button.enabled = !disabled));
			}
		});

		// Create toolbar if actions are provided
		if (options?.toolbarData) {
			const overlay = contextKeyService.createOverlay([['chatConfirmationPartType', options.toolbarData.partType]]);
			const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
			this._register(nestedInsta.createInstance(
				MenuWorkbenchToolBar,
				elements.toolbar,
				MenuId.ChatConfirmationMenu,
				{
					// buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
					menuOptions: {
						arg: options.toolbarData.arg,
						shouldForwardArgs: true,
					}
				}
			));
		}
	}

	protected renderMessage(element: HTMLElement, listContainer: HTMLElement): void {
		this.messageElement.append(element);

		if (this.showingButtons && this._configurationService.getValue<boolean>('chat.notifyWindowOnConfirmation')) {
			const targetWindow = dom.getWindow(listContainer);
			if (!targetWindow.document.hasFocus()) {
				this.notifyConfirmationNeeded(targetWindow);
			}
		}
	}

	private async notifyConfirmationNeeded(targetWindow: Window): Promise<void> {

		// Focus Window
		this._hostService.focus(targetWindow, { mode: FocusMode.Notify });

		// Notify
		const title = renderAsPlaintext(this.title);
		const notification = await dom.triggerNotification(title ? localize('notificationTitle', "Chat: {0}", title) : localize('defaultTitle', "Chat: Confirmation Required"),
			{
				detail: localize('notificationDetail', "The current chat session requires your confirmation to proceed.")
			}
		);
		if (notification) {
			const disposables = this.notification.value = new DisposableStore();
			disposables.add(notification);

			disposables.add(Event.once(notification.onClick)(() => {
				this._hostService.focus(targetWindow, { mode: FocusMode.Force });
				showChatView(this._viewsService);
			}));

			disposables.add(this._hostService.onDidChangeFocus(focus => {
				if (focus) {
					disposables.dispose();
				}
			}));
		}
	}
}
export class ChatConfirmationWidget extends BaseChatConfirmationWidget {
	private _renderedMessage: HTMLElement | undefined;

	constructor(
		private readonly _container: HTMLElement,
		options: IChatConfirmationWidgetOptions & { message: string | IMarkdownString },
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHostService hostService: IHostService,
		@IViewsService viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(options, instantiationService, contextMenuService, configurationService, hostService, viewsService, contextKeyService);
		this.updateMessage(options.message);
	}

	public updateMessage(message: string | IMarkdownString): void {
		this._renderedMessage?.remove();
		const renderedMessage = this._register(this.markdownRenderer.render(
			typeof message === 'string' ? new MarkdownString(message) : message,
			{ asyncRenderCallback: () => this._onDidChangeHeight.fire() }
		));
		this.renderMessage(renderedMessage.element, this._container);
		this._renderedMessage = renderedMessage.element;
	}
}

export class ChatCustomConfirmationWidget extends BaseChatConfirmationWidget {
	constructor(
		container: HTMLElement,
		options: IChatConfirmationWidgetOptions & { message: HTMLElement },
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHostService hostService: IHostService,
		@IViewsService viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(options, instantiationService, contextMenuService, configurationService, hostService, viewsService, contextKeyService);
		this.renderMessage(options.message, container);
	}
}
