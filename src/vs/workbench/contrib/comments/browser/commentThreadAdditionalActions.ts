/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';

import { IAction } from '../../../../base/common/actions.js';
import { IMenu, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { IRange } from '../../../../editor/common/core/range.js';
import * as languages from '../../../../editor/common/languages.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CommentFormActions } from './commentFormActions.js';
import { CommentMenus } from './commentMenus.js';
import { ICellRange } from '../../notebook/common/notebookRange.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

export class CommentThreadAdditionalActions<T extends IRange | ICellRange> extends Disposable {
	private _container: HTMLElement | null;
	private _buttonBar: HTMLElement | null;
	private _commentFormActions!: CommentFormActions;

	constructor(
		container: HTMLElement,
		private _commentThread: languages.CommentThread<T>,
		private _contextKeyService: IContextKeyService,
		private _commentMenus: CommentMenus,
		private _actionRunDelegate: (() => void) | null,
		@IKeybindingService private _keybindingService: IKeybindingService,
	) {
		super();

		this._container = dom.append(container, dom.$('.comment-additional-actions'));
		dom.append(this._container, dom.$('.section-separator'));

		this._buttonBar = dom.append(this._container, dom.$('.button-bar'));
		this._createAdditionalActions(this._buttonBar);
	}

	private _showMenu() {
		this._container?.classList.remove('hidden');
	}

	private _hideMenu() {
		this._container?.classList.add('hidden');
	}

	private _enableDisableMenu(menu: IMenu) {
		const groups = menu.getActions({ shouldForwardArgs: true });

		// Show the menu if at least one action is enabled.
		for (const group of groups) {
			const [, actions] = group;
			for (const action of actions) {
				if (action.enabled) {
					this._showMenu();
					return;
				}

				for (const subAction of (action as SubmenuItemAction).actions ?? []) {
					if (subAction.enabled) {
						this._showMenu();
						return;
					}
				}
			}
		}

		this._hideMenu();
	}


	private _createAdditionalActions(container: HTMLElement) {
		const menu = this._commentMenus.getCommentThreadAdditionalActions(this._contextKeyService);
		this._register(menu);
		this._register(menu.onDidChange(() => {
			this._commentFormActions.setActions(menu, /*hasOnlySecondaryActions*/ true);
			this._enableDisableMenu(menu);
		}));

		this._commentFormActions = new CommentFormActions(this._keybindingService, this._contextKeyService, container, async (action: IAction) => {
			this._actionRunDelegate?.();

			action.run({
				thread: this._commentThread,
				$mid: MarshalledId.CommentThreadInstance
			});
		}, 4);

		this._register(this._commentFormActions);
		this._commentFormActions.setActions(menu, /*hasOnlySecondaryActions*/ true);
		this._enableDisableMenu(menu);
	}
}
