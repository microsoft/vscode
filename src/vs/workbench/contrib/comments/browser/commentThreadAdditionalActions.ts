/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';

import { IAction } from 'vs/base/common/actions';
import { IMenu, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { IRange } from 'vs/editor/common/core/range';
import * as languages from 'vs/editor/common/languages';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CommentFormActions } from 'vs/workbench/contrib/comments/browser/commentFormActions';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

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
