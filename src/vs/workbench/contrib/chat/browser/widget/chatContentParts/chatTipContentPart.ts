/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatTipContent.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatTip, IChatTipService } from '../../chatTipService.js';

const $ = dom.$;

export class ChatTipContentPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidHide = this._register(new Emitter<void>());
	public readonly onDidHide = this._onDidHide.event;

	private readonly _renderedContent = this._register(new MutableDisposable());
	private readonly _toolbar = this._register(new MutableDisposable<MenuWorkbenchToolBar>());

	private readonly _inChatTipContextKey: IContextKey<boolean>;

	constructor(
		tip: IChatTip,
		private readonly _renderer: IMarkdownRenderer,
		@IChatTipService private readonly _chatTipService: IChatTipService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = $('.chat-tip-widget');
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-roledescription', localize('chatTipRoleDescription', "tip"));

		this._inChatTipContextKey = ChatContextKeys.inChatTip.bindTo(this._contextKeyService);
		const focusTracker = this._register(dom.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => this._inChatTipContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this._inChatTipContextKey.set(false)));
		this._register({ dispose: () => this._inChatTipContextKey.reset() });

		this._renderTip(tip);

		this._register(this._chatTipService.onDidDismissTip(() => {
			const nextTip = this._chatTipService.navigateToNextTip();
			if (nextTip) {
				this._renderTip(nextTip);
				dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => this.focus());
			} else {
				this._onDidHide.fire();
			}
		}));

		this._register(this._chatTipService.onDidNavigateTip(tip => {
			this._renderTip(tip);
			dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => this.focus());
		}));

		this._register(this._chatTipService.onDidHideTip(() => {
			this._onDidHide.fire();
		}));

		this._register(this._chatTipService.onDidDisableTips(() => {
			this._onDidHide.fire();
		}));

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			const event = new StandardMouseEvent(dom.getWindow(this.domNode), e);
			this._contextMenuService.showContextMenu({
				getAnchor: () => event,
				getActions: () => {
					const menu = this._menuService.getMenuActions(MenuId.ChatTipContext, this._contextKeyService);
					return getFlatContextMenuActions(menu);
				},
			});
		}));
	}

	hasFocus(): boolean {
		return dom.isAncestorOfActiveElement(this.domNode);
	}

	focus(): void {
		this.domNode.focus();
	}

	private _renderTip(tip: IChatTip): void {
		dom.clearNode(this.domNode);
		this._toolbar.clear();

		this.domNode.appendChild(renderIcon(Codicon.lightbulb));
		const markdownContent = this._renderer.render(tip.content);
		this._renderedContent.value = markdownContent;
		this.domNode.appendChild(markdownContent.element);

		// Toolbar with previous, next, and dismiss actions via MenuWorkbenchToolBar
		const toolbarContainer = $('.chat-tip-toolbar');
		this._toolbar.value = this._instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.ChatTipToolbar, {
			menuOptions: {
				shouldForwardArgs: true,
			},
		});
		this.domNode.appendChild(toolbarContainer);

		const textContent = markdownContent.element.textContent ?? localize('chatTip', "Chat tip");
		const hasLink = /\[.*?\]\(.*?\)/.test(tip.content.value);
		const ariaLabel = hasLink
			? localize('chatTipWithAction', "{0} Tab to reach the action.", textContent)
			: textContent;
		this.domNode.setAttribute('aria-label', ariaLabel);
	}
}

//#region Tip toolbar actions

registerAction2(class PreviousTipAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.previousTip',
			title: localize2('chatTip.previous', "Previous tip"),
			icon: Codicon.chevronLeft,
			f1: false,
			menu: [{
				id: MenuId.ChatTipToolbar,
				group: 'navigation',
				order: 1,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatTipService = accessor.get(IChatTipService);
		chatTipService.navigateToPreviousTip();
	}
});

registerAction2(class NextTipAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.nextTip',
			title: localize2('chatTip.next', "Next tip"),
			icon: Codicon.chevronRight,
			f1: false,
			menu: [{
				id: MenuId.ChatTipToolbar,
				group: 'navigation',
				order: 2,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatTipService = accessor.get(IChatTipService);
		chatTipService.navigateToNextTip();
	}
});

registerAction2(class DismissTipToolbarAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.dismissTipToolbar',
			title: localize2('chatTip.dismissButton', "Dismiss tip"),
			icon: Codicon.check,
			f1: false,
			menu: [{
				id: MenuId.ChatTipToolbar,
				group: 'navigation',
				order: 3,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IChatTipService).dismissTip();
	}
});

//#endregion

//#region Tip context menu actions

registerAction2(class DismissTipAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.dismissTip',
			title: localize2('chatTip.dismiss', "Dismiss this tip"),
			f1: false,
			menu: [{
				id: MenuId.ChatTipContext,
				group: 'chatTip',
				order: 1,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IChatTipService).dismissTip();
	}
});

registerAction2(class DisableTipsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.disableTips',
			title: localize2('chatTip.disableTips', "Disable tips"),
			icon: Codicon.bellSlash,
			f1: false,
			menu: [{
				id: MenuId.ChatTipContext,
				group: 'chatTip',
				order: 2,
			}, {
				id: MenuId.ChatTipToolbar,
				group: 'navigation',
				order: 5,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatTipService = accessor.get(IChatTipService);
		const commandService = accessor.get(ICommandService);

		await chatTipService.disableTips();
		await commandService.executeCommand('workbench.action.openSettings', 'chat.tips.enabled');
	}
});

registerAction2(class ResetDismissedTipsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.resetDismissedTips',
			title: localize2('chatTip.resetDismissedTips', "Reset Dismissed Tips"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IChatTipService).clearDismissedTips();
	}
});

//#endregion
