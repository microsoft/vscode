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
import { localize2 } from '../../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatTip, IChatTipService } from '../../chatTipService.js';

const $ = dom.$;

export class ChatTipContentPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidHide = this._register(new Emitter<void>());
	public readonly onDidHide = this._onDidHide.event;

	private readonly _renderedContent = this._register(new MutableDisposable());

	constructor(
		tip: IChatTip,
		private readonly _renderer: IMarkdownRenderer,
		private readonly _chatTipService: IChatTipService,
		private readonly _contextMenuService: IContextMenuService,
		private readonly _menuService: IMenuService,
		private readonly _contextKeyService: IContextKeyService,
		private readonly _getNextTip: () => IChatTip | undefined,
	) {
		super();

		this.domNode = $('.chat-tip-widget');
		this._renderTip(tip);

		this._register(this._chatTipService.onDidDismissTip(() => {
			const nextTip = this._getNextTip();
			if (nextTip) {
				this._renderTip(nextTip);
			} else {
				this._onDidHide.fire();
			}
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

	private _renderTip(tip: IChatTip): void {
		dom.clearNode(this.domNode);
		this.domNode.appendChild(renderIcon(Codicon.lightbulb));
		const markdownContent = this._renderer.render(tip.content);
		this._renderedContent.value = markdownContent;
		this.domNode.appendChild(markdownContent.element);
	}
}

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
			f1: false,
			menu: [{
				id: MenuId.ChatTipContext,
				group: 'chatTip',
				order: 2,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IChatTipService).disableTips();
	}
});

//#endregion
