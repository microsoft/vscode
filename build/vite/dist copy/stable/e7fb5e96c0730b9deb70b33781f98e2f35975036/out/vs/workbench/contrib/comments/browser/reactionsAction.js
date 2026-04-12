/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import * as cssJs from '../../../../base/browser/cssValue.js';
import { Action } from '../../../../base/common/actions.js';
import { URI } from '../../../../base/common/uri.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
export class ToggleReactionsAction extends Action {
    static { this.ID = 'toolbar.toggle.pickReactions'; }
    constructor(toggleDropdownMenu, title) {
        super(ToggleReactionsAction.ID, title || nls.localize('pickReactions', "Pick Reactions..."), 'toggle-reactions', true);
        this._menuActions = [];
        this.toggleDropdownMenu = toggleDropdownMenu;
    }
    run() {
        this.toggleDropdownMenu();
        return Promise.resolve(true);
    }
    get menuActions() {
        return this._menuActions;
    }
    set menuActions(actions) {
        this._menuActions = actions;
    }
}
export class ReactionActionViewItem extends ActionViewItem {
    constructor(action) {
        super(null, action, {});
    }
    updateLabel() {
        if (!this.label) {
            return;
        }
        const action = this.action;
        if (action.class) {
            this.label.classList.add(action.class);
        }
        if (!action.icon) {
            const reactionLabel = dom.append(this.label, dom.$('span.reaction-label'));
            reactionLabel.innerText = action.label;
        }
        else {
            const reactionIcon = dom.append(this.label, dom.$('.reaction-icon'));
            const uri = URI.revive(action.icon);
            reactionIcon.style.backgroundImage = cssJs.asCSSUrl(uri);
        }
        if (action.count) {
            const reactionCount = dom.append(this.label, dom.$('span.reaction-count'));
            reactionCount.innerText = `${action.count}`;
        }
    }
    getTooltip() {
        const action = this.action;
        const toggleMessage = action.enabled ? nls.localize('comment.toggleableReaction', "Toggle reaction, ") : '';
        if (action.count === undefined) {
            return nls.localize({
                key: 'comment.reactionLabelNone', comment: [
                    'This is a tooltip for an emoji button so that the current user can toggle their reaction to a comment.',
                    'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second is the name of the reaction.'
                ]
            }, "{0}{1} reaction", toggleMessage, action.label);
        }
        else if (action.reactors === undefined || action.reactors.length === 0) {
            if (action.count === 1) {
                return nls.localize({
                    key: 'comment.reactionLabelOne', comment: [
                        'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is 1.',
                        'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
                        'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second is the name of the reaction.'
                    ]
                }, "{0}1 reaction with {1}", toggleMessage, action.label);
            }
            else if (action.count > 1) {
                return nls.localize({
                    key: 'comment.reactionLabelMany', comment: [
                        'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is greater than 1.',
                        'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
                        'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second is number of users who have reacted with that reaction, and the third is the name of the reaction.'
                    ]
                }, "{0}{1} reactions with {2}", toggleMessage, action.count, action.label);
            }
        }
        else {
            if (action.reactors.length <= 10 && action.reactors.length === action.count) {
                return nls.localize({
                    key: 'comment.reactionLessThanTen', comment: [
                        'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
                        'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
                        'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.'
                    ]
                }, "{0}{1} reacted with {2}", toggleMessage, action.reactors.join(', '), action.label);
            }
            else if (action.count > 1) {
                const displayedReactors = action.reactors.slice(0, 10);
                return nls.localize({
                    key: 'comment.reactionMoreThanTen', comment: [
                        'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
                        'The emoji is also a button so that the current user can also toggle their own emoji reaction.',
                        'The first arg is localized message "Toggle reaction" or empty if the user doesn\'t have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.'
                    ]
                }, "{0}{1} and {2} more reacted with {3}", toggleMessage, displayedReactors.join(', '), action.count - displayedReactors.length, action.label);
            }
        }
        return undefined;
    }
}
export class ReactionAction extends Action {
    static { this.ID = 'toolbar.toggle.reaction'; }
    constructor(id, label = '', cssClass = '', enabled = true, actionCallback, reactors, icon, count) {
        super(ReactionAction.ID, label, cssClass, enabled, actionCallback);
        this.reactors = reactors;
        this.icon = icon;
        this.count = count;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhY3Rpb25zQWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9yZWFjdGlvbnNBY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sS0FBSyxLQUFLLE1BQU0sc0NBQXNDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRTFGLE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxNQUFNO2FBQ2hDLE9BQUUsR0FBRyw4QkFBOEIsQUFBakMsQ0FBa0M7SUFHcEQsWUFBWSxrQkFBOEIsRUFBRSxLQUFjO1FBQ3pELEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLEVBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLG1CQUFtQixDQUFDLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFIaEgsaUJBQVksR0FBYyxFQUFFLENBQUM7UUFJcEMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDO0lBQzlDLENBQUM7SUFDUSxHQUFHO1FBQ1gsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDMUIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFDRCxJQUFJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDMUIsQ0FBQztJ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