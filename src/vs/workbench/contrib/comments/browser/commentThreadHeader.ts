/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar';
import { Action, ActionRunner } from '../../../../base/common/actions';
import { Codicon } from '../../../../base/common/codicons';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle';
import * as strings from '../../../../base/common/strings';
import * as languages from '../../../../editor/common/languages';
import { IRange } from '../../../../editor/common/core/range';
import * as nls from '../../../../nls';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem';
import { IMenu, MenuItemAction, SubmenuItemAction } from '../../../../platform/actions/common/actions';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry';
import { ThemeIcon } from '../../../../base/common/themables';
import { CommentMenus } from './commentMenus';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView';
import { MarshalledId } from '../../../../base/common/marshallingIds';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent';
import { MarshalledCommentThread } from '../../../common/comments';

const collapseIcon = registerIcon('review-comment-collapse', Codicon.chevronUp, nls.localize('collapseIcon', 'Icon to collapse a review comment.'));
const COLLAPSE_ACTION_CLASS = 'expand-review-action ' + ThemeIcon.asClassName(collapseIcon);
const DELETE_ACTION_CLASS = 'expand-review-action ' + ThemeIcon.asClassName(Codicon.trashcan);

function threadHasComments(comments: ReadonlyArray<languages.Comment> | undefined): comments is ReadonlyArray<languages.Comment> {
	return !!comments && comments.length > 0;
}

export class CommentThreadHeader<T = IRange> extends Disposable {
	private _headElement: HTMLElement;
	private _headingLabel!: HTMLElement;
	private _actionbarWidget!: ActionBar;
	private _collapseAction!: Action;

	constructor(
		container: HTMLElement,
		private _delegate: { collapse: () => void },
		private _commentMenus: CommentMenus,
		private _commentThread: languages.CommentThread<T>,
		private _contextKeyService: IContextKeyService,
		private instantiationService: IInstantiationService,
		private _contextMenuService: IContextMenuService
	) {
		super();
		this._headElement = <HTMLDivElement>dom.$('.head');
		container.appendChild(this._headElement);
		this._register(toDisposable(() => this._headElement.remove()));
		this._fillHead();
	}

	protected _fillHead(): void {
		const titleElement = dom.append(this._headElement, dom.$('.review-title'));

		this._headingLabel = dom.append(titleElement, dom.$('span.filename'));
		this.createThreadLabel();

		const actionsContainer = dom.append(this._headElement, dom.$('.review-actions'));
		this._actionbarWidget = new ActionBar(actionsContainer, {
			actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService)
		});

		this._register(this._actionbarWidget);

		const collapseClass = threadHasComments(this._commentThread.comments) ? COLLAPSE_ACTION_CLASS : DELETE_ACTION_CLASS;
		this._collapseAction = new Action('review.expand', nls.localize('label.collapse', "Collapse"), collapseClass, true, () => this._delegate.collapse());
		if (!threadHasComments(this._commentThread.comments)) {
			const commentsChanged: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
			commentsChanged.value = this._commentThread.onDidChangeComments(() => {
				if (threadHasComments(this._commentThread.comments)) {
					this._collapseAction.class = COLLAPSE_ACTION_CLASS;
					commentsChanged.clear();
				}
			});
		}

		const menu = this._commentMenus.getCommentThreadTitleActions(this._contextKeyService);
		this._register(menu);
		this.setActionBarActions(menu);

		this._register(menu);
		this._register(menu.onDidChange(e => {
			this.setActionBarActions(menu);
		}));

		this._register(dom.addDisposableListener(this._headElement, dom.EventType.CONTEXT_MENU, e => {
			return this.onContextMenu(e);
		}));

		this._actionbarWidget.context = this._commentThread;
	}

	private setActionBarActions(menu: IMenu): void {
		const groups = menu.getActions({ shouldForwardArgs: true }).reduce((r, [, actions]) => [...r, ...actions], <(MenuItemAction | SubmenuItemAction)[]>[]);
		this._actionbarWidget.clear();
		this._actionbarWidget.push([...groups, this._collapseAction], { label: false, icon: true });
	}

	updateCommentThread(commentThread: languages.CommentThread<T>) {
		this._commentThread = commentThread;

		this._actionbarWidget.context = this._commentThread;
		this.createThreadLabel();
	}

	createThreadLabel() {
		let label: string | undefined;
		label = this._commentThread.label;

		if (label === undefined) {
			if (!(this._commentThread.comments && this._commentThread.comments.length)) {
				label = nls.localize('startThread', "Start discussion");
			}
		}

		if (label) {
			this._headingLabel.textContent = strings.escape(label);
			this._headingLabel.setAttribute('aria-label', label);
		}
	}

	updateHeight(headHeight: number) {
		this._headElement.style.height = `${headHeight}px`;
		this._headElement.style.lineHeight = this._headElement.style.height;
	}

	private onContextMenu(e: MouseEvent) {
		const actions = this._commentMenus.getCommentThreadTitleContextActions(this._contextKeyService).getActions({ shouldForwardArgs: true }).map((value) => value[1]).flat();
		if (!actions.length) {
			return;
		}
		const event = new StandardMouseEvent(dom.getWindow(this._headElement), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => event,
			getActions: () => actions,
			actionRunner: new ActionRunner(),
			getActionsContext: (): MarshalledCommentThread => {
				return {
					commentControlHandle: this._commentThread.controllerHandle,
					commentThreadHandle: this._commentThread.commentThreadHandle,
					$mid: MarshalledId.CommentThread
				};
			},
		});
	}
}
