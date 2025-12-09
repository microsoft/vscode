/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { Button, ButtonWithDropdown, IButton, IButtonOptions } from '../../../../../base/browser/ui/button/button.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import type { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { FocusMode } from '../../../../../platform/native/common/native.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IChatWidgetService } from '../chat.js';
import { renderFileWidgets } from '../chatInlineAnchorWidget.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { ChatMarkdownContentPart, IChatMarkdownContentPartOptions } from './chatMarkdownContentPart.js';
import './media/chatConfirmationWidget.css';

export interface IChatConfirmationButton<T> {
	label: string;
	isSecondary?: boolean;
	tooltip?: string;
	data: T;
	disabled?: boolean;
	readonly onDidChangeDisablement?: Event<boolean>;
	moreActions?: (IChatConfirmationButton<T> | Separator)[];
}

export interface IChatConfirmationWidgetOptions<T> {
	title: string | IMarkdownString;
	message: string | IMarkdownString;
	subtitle?: string | IMarkdownString;
	buttons: IChatConfirmationButton<T>[];
	toolbarData?: { arg: unknown; partType: string; partSource?: string };
	silent?: boolean;
}

export class ChatQueryTitlePart extends Disposable {
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly _renderedTitle = this._register(new MutableDisposable<IRenderedMarkdown>());

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
			previousEl.replaceWith(next.element);
		} else {
			this.element.appendChild(next.element); // unreachable?
		}

		this._renderedTitle.value = next;
	}

	constructor(
		private readonly element: HTMLElement,
		private _title: IMarkdownString | string,
		subtitle: string | IMarkdownString | undefined,
		@IMarkdownRendererService private readonly _renderer: IMarkdownRendererService,
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

class ChatConfirmationNotifier extends Disposable {

	private readonly disposables = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IHostService private readonly _hostService: IHostService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();
	}

	async notify(targetWindow: Window, sessionResource: URI): Promise<void> {

		// Focus Window
		this._hostService.focus(targetWindow, { mode: FocusMode.Notify });

		// Notify
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		const title = widget?.viewModel?.model.title ? localize('chatTitle', "Chat: {0}", widget.viewModel.model.title) : localize('chat.untitledChat', "Untitled Chat");
		const notification = await dom.triggerNotification(title,
			{
				detail: localize('notificationDetail', "Approval needed to continue.")
			}
		);
		if (notification) {
			const disposables = this.disposables.value = new DisposableStore();
			disposables.add(notification);

			disposables.add(Event.once(notification.onClick)(async () => {
				await this._hostService.focus(targetWindow, { mode: FocusMode.Force });

				if (widget) {
					await this._chatWidgetService.reveal(widget);
					widget.focusInput();
				}
				disposables.dispose();
			}));

			disposables.add(this._hostService.onDidChangeFocus(focus => {
				if (focus) {
					disposables.dispose();
				}
			}));
		}
	}
}

abstract class BaseSimpleChatConfirmationWidget<T> extends Disposable {
	private _onDidClick = this._register(new Emitter<IChatConfirmationButton<T>>());
	get onDidClick(): Event<IChatConfirmationButton<T>> { return this._onDidClick.event; }

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

	private readonly silent: boolean;
	private readonly notificationManager: ChatConfirmationNotifier;

	constructor(
		protected readonly context: IChatContentPartRenderContext,
		options: IChatConfirmationWidgetOptions<T>,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService protected readonly _markdownRendererService: IMarkdownRendererService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const { title, subtitle, message, buttons, silent } = options;
		this.silent = !!silent;

		this.notificationManager = this._register(instantiationService.createInstance(ChatConfirmationNotifier));

		const elements = dom.h('.chat-confirmation-widget-container@container', [
			dom.h('.chat-confirmation-widget@root', [
				dom.h('.chat-confirmation-widget-title@title'),
				dom.h('.chat-confirmation-widget-message-container', [
					dom.h('.chat-confirmation-widget-message@message'),
					dom.h('.chat-buttons-container@buttonsContainer', [
						dom.h('.chat-buttons@buttons'),
						dom.h('.chat-toolbar@toolbar'),
					]),
				]),
			]),
		]);
		configureAccessibilityContainer(elements.container, title, message);
		this._domNode = elements.root;

		const titlePart = this._register(instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			title,
			subtitle
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
			const overlay = contextKeyService.createOverlay([
				['chatConfirmationPartType', options.toolbarData.partType],
				['chatConfirmationPartSource', options.toolbarData.partSource],
			]);
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

		if (this.showingButtons && this._configurationService.getValue<boolean>('chat.notifyWindowOnConfirmation') && !this.silent) {
			const targetWindow = dom.getWindow(listContainer);
			if (!targetWindow.document.hasFocus()) {
				this.notificationManager.notify(targetWindow, this.context.element.sessionResource);
			}
		}
	}
}

/** @deprecated Use ChatConfirmationWidget instead */
export class SimpleChatConfirmationWidget<T> extends BaseSimpleChatConfirmationWidget<T> {
	private _renderedMessage: HTMLElement | undefined;

	constructor(
		context: IChatContentPartRenderContext,
		options: IChatConfirmationWidgetOptions<T>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(context, options, instantiationService, markdownRendererService, contextMenuService, configurationService, contextKeyService);
		this.updateMessage(options.message);
	}

	public updateMessage(message: string | IMarkdownString): void {
		this._renderedMessage?.remove();
		const renderedMessage = this._register(this._markdownRendererService.render(
			typeof message === 'string' ? new MarkdownString(message) : message,
			{ asyncRenderCallback: () => this._onDidChangeHeight.fire() }
		));
		this.renderMessage(renderedMessage.element, this.context.container);
		this._renderedMessage = renderedMessage.element;
	}
}

export interface IChatConfirmationWidget2Options<T> {
	title: string | IMarkdownString;
	message: string | IMarkdownString | HTMLElement;
	icon?: ThemeIcon;
	subtitle?: string | IMarkdownString;
	buttons: IChatConfirmationButton<T>[];
	toolbarData?: { arg: unknown; partType: string; partSource?: string };
}

abstract class BaseChatConfirmationWidget<T> extends Disposable {
	private _onDidClick = this._register(new Emitter<IChatConfirmationButton<T>>());
	get onDidClick(): Event<IChatConfirmationButton<T>> { return this._onDidClick.event; }

	protected _onDidChangeHeight = this._register(new Emitter<void>());
	get onDidChangeHeight(): Event<void> { return this._onDidChangeHeight.event; }

	private _domNode: HTMLElement;
	get domNode(): HTMLElement {
		return this._domNode;
	}

	private _buttonsDomNode: HTMLElement;

	private get showingButtons() {
		return !this.domNode.classList.contains('hideButtons');
	}

	setShowButtons(showButton: boolean): void {
		this.domNode.classList.toggle('hideButtons', !showButton);
	}

	private readonly messageElement: HTMLElement;
	private readonly markdownContentPart = this._register(new MutableDisposable<ChatMarkdownContentPart>());
	private readonly notificationManager: ChatConfirmationNotifier;

	public get codeblocksPartId() {
		return this.markdownContentPart.value?.codeblocksPartId;
	}

	public get codeblocks() {
		return this.markdownContentPart.value?.codeblocks;
	}

	constructor(
		protected readonly _context: IChatContentPartRenderContext,
		options: IChatConfirmationWidget2Options<T>,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService protected readonly markdownRendererService: IMarkdownRendererService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
	) {
		super();

		const { title, subtitle, message, buttons, icon } = options;

		this.notificationManager = this._register(instantiationService.createInstance(ChatConfirmationNotifier));

		const elements = dom.h('.chat-confirmation-widget-container@container', [
			dom.h('.chat-confirmation-widget2@root', [
				dom.h('.chat-confirmation-widget-title', [
					dom.h('.chat-title@title'),
					dom.h('.chat-toolbar-container@buttonsContainer', [
						dom.h('.chat-toolbar@toolbar'),
					]),
				]),
				dom.h('.chat-confirmation-widget-message@message'),
				dom.h('.chat-confirmation-widget-buttons', [
					dom.h('.chat-buttons@buttons'),
				]),
			]),]);

		configureAccessibilityContainer(elements.container, title, message);
		this._domNode = elements.root;
		this._buttonsDomNode = elements.buttons;

		const titlePart = this._register(instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			new MarkdownString(icon ? `$(${icon.id}) ${typeof title === 'string' ? title : title.value}` : typeof title === 'string' ? title : title.value),
			subtitle,
		));

		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this.messageElement = elements.message;

		this.updateButtons(buttons);

		// Create toolbar if actions are provided
		if (options?.toolbarData) {
			const overlay = contextKeyService.createOverlay([
				['chatConfirmationPartType', options.toolbarData.partType],
				['chatConfirmationPartSource', options.toolbarData.partSource],
			]);
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

	updateButtons(buttons: IChatConfirmationButton<T>[]) {
		while (this._buttonsDomNode.children.length > 0) {
			this._buttonsDomNode.children[0].remove();
		}
		for (const buttonData of buttons) {
			const buttonOptions: IButtonOptions = { ...defaultButtonStyles, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };

			let button: IButton;
			if (buttonData.moreActions) {
				button = new ButtonWithDropdown(this._buttonsDomNode, {
					...buttonOptions,
					contextMenuProvider: this.contextMenuService,
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
				button = new Button(this._buttonsDomNode, buttonOptions);
			}

			this._register(button);
			button.label = buttonData.label;
			this._register(button.onDidClick(() => this._onDidClick.fire(buttonData)));
			if (buttonData.onDidChangeDisablement) {
				this._register(buttonData.onDidChangeDisablement(disabled => button.enabled = !disabled));
			}
		}
	}

	protected renderMessage(element: HTMLElement | IMarkdownString | string, listContainer: HTMLElement): void {
		this.markdownContentPart.clear();

		if (!dom.isHTMLElement(element)) {
			const part = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart,
				{
					kind: 'markdownContent',
					content: typeof element === 'string' ? new MarkdownString().appendMarkdown(element) : element
				},
				this._context,
				this._context.editorPool,
				false,
				this._context.codeBlockStartIndex,
				this.markdownRendererService,
				undefined,
				this._context.currentWidth(),
				this._context.codeBlockModelCollection,
				{
					allowInlineDiffs: true,
					horizontalPadding: 6,
				} satisfies IChatMarkdownContentPartOptions,
			));
			renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store);
			this._register(part.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

			this.markdownContentPart.value = part;
			element = part.domNode;
		}

		for (const child of this.messageElement.children) {
			child.remove();
		}
		this.messageElement.append(element);

		if (this.showingButtons && this._configurationService.getValue<boolean>('chat.notifyWindowOnConfirmation')) {
			const targetWindow = dom.getWindow(listContainer);
			if (!targetWindow.document.hasFocus()) {
				this.notificationManager.notify(targetWindow, this._context.element.sessionResource);
			}
		}
	}
}
export class ChatConfirmationWidget<T> extends BaseChatConfirmationWidget<T> {
	private _renderedMessage: HTMLElement | undefined;

	constructor(
		context: IChatContentPartRenderContext,
		options: IChatConfirmationWidget2Options<T>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
	) {
		super(context, options, instantiationService, markdownRendererService, contextMenuService, configurationService, contextKeyService, chatMarkdownAnchorService);
		this.renderMessage(options.message, context.container);
	}

	public updateMessage(message: string | IMarkdownString): void {
		this._renderedMessage?.remove();
		const renderedMessage = this._register(this.markdownRendererService.render(
			typeof message === 'string' ? new MarkdownString(message) : message,
			{ asyncRenderCallback: () => this._onDidChangeHeight.fire() }
		));
		this.renderMessage(renderedMessage.element, this._context.container);
		this._renderedMessage = renderedMessage.element;
	}
}
export class ChatCustomConfirmationWidget<T> extends BaseChatConfirmationWidget<T> {
	constructor(
		context: IChatContentPartRenderContext,
		options: IChatConfirmationWidget2Options<T>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
	) {
		super(context, options, instantiationService, markdownRendererService, contextMenuService, configurationService, contextKeyService, chatMarkdownAnchorService);
		this.renderMessage(options.message, context.container);
	}
}

function configureAccessibilityContainer(container: HTMLElement, title: string | IMarkdownString, message?: string | IMarkdownString | HTMLElement): void {
	container.tabIndex = 0;
	const titleAsString = typeof title === 'string' ? title : title.value;
	const messageAsString = typeof message === 'string' ? message : message && 'value' in message ? message.value : message && 'textContent' in message ? message.textContent : '';
	container.setAttribute('aria-label', localize('chat.confirmationWidget.ariaLabel', "Chat Confirmation Dialog {0} {1}", titleAsString, messageAsString));
	container.classList.add('chat-confirmation-widget-container');
}
