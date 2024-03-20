/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Action, IAction } from 'vs/base/common/actions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';

export class ToggleReactionsAction extends Action {
	static readonly ID = 'toolbar.toggle.pickReactions';
	private _menuActions: IAction[] = [];
	private toggleDropdownMenu: () => void;
	constructor(toggleDropdownMenu: () => void, title?: string) {
		super(ToggleReactionsAction.ID, title || nls.localize('pickReactions', "Pick Reactions..."), 'toggle-reactions', true);
		this.toggleDropdownMenu = toggleDropdownMenu;
	}
	override run(): Promise<any> {
		this.toggleDropdownMenu();
		return Promise.resolve(true);
	}
	get menuActions() {
		return this._menuActions;
	}
	set menuActions(actions: IAction[]) {
		this._menuActions = actions;
	}
}
export class ReactionActionViewItem extends ActionViewItem {
	constructor(action: ReactionAction) {
		super(null, action, {});
	}
	protected override updateLabel(): void {
		if (!this.label) {
			return;
		}

		const action = this.action as ReactionAction;
		if (action.class) {
			this.label.classList.add(action.class);
		}
		if (!action.icon) {
			const reactionLabel = dom.append(this.label, dom.$('span.reaction-label'));
			reactionLabel.innerText = action.label;
		} else {
			const reactionIcon = dom.append(this.label, dom.$('.reaction-icon'));
			const uri = URI.revive(action.icon);
			reactionIcon.style.backgroundImage = dom.asCSSUrl(uri);
		}
		if (action.count) {
			const reactionCount = dom.append(this.label, dom.$('span.reaction-count'));
			reactionCount.innerText = `${action.count}`;
		}
	}

	protected override getTooltip(): string | undefined {
		const action = this.action as ReactionAction;
		const toggleMessage = action.enabled ? nls.localize('comment.toggleableReaction', "Toggle reaction, ") : '';

		if (action.count === undefined) {
			return nls.localize({
				key: 'comment.reactionLabelNone', comment: [
					'This is a tooltip for an emoji button so that the current user can toggle their reaction to a comment.',
					'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second is the name of the reaction.']
			}, "{0}{1} reaction", toggleMessage, action.label);
		} else if (action.reactors === undefined || action.reactors.length === 0) {
			if (action.count === 1) {
				return nls.localize({
					key: 'comment.reactionLabelOne', comment: [
						'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is 1.',
						'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
						'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second is the name of the reaction.']
				}, "{0}1 reaction with {1}", toggleMessage, action.label);
			} else if (action.count > 1) {
				return nls.localize({
					key: 'comment.reactionLabelMany', comment: [
						'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is greater than 1.',
						'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
						'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second is number of users who have reacted with that reaction, and the third is the name of the reaction.']
				}, "{0}{1} reactions with {2}", toggleMessage, action.count, action.label);
			}
		} else {
			if (action.reactors.length <= 10 && action.reactors.length === action.count) {
				return nls.localize({
					key: 'comment.reactionLessThanTen', comment: [
						'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
						'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
						'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.']
				}, "{0}{1} reacted with {2}", toggleMessage, action.reactors.join(', '), action.label);
			} else if (action.count > 1) {
				const displayedReactors = action.reactors.slice(0, 10);
				return nls.localize({
					key: 'comment.reactionMoreThanTen', comment: [
						'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
						'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
						'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.']
				}, "{0}{1} and {2} more reacted with {3}", toggleMessage, displayedReactors.join(', '), action.count - displayedReactors.length, action.label);
			}
		}
		return undefined;
	}
}
export class ReactionAction extends Action {
	static readonly ID = 'toolbar.toggle.reaction';
	constructor(id: string, label: string = '', cssClass: string = '', enabled: boolean = true, actionCallback?: (event?: any) => Promise<any>, public readonly reactors?: readonly string[], public icon?: UriComponents, public count?: number) {
		super(ReactionAction.ID, label, cssClass, enabled, actionCallback);
	}
}
