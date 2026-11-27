/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { getBaseBranchLabel } from '../../../../platform/agentHost/common/agentHostGitService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISessionChangesetBaseBranchCandidates, ISessionChangesetBaseBranchSelection } from '../../../services/sessions/common/session.js';
import { createBranchPickerActionItem, getBranchPickerListOptions, IBranchPickerItem, takePinnedBranchItems } from '../../chat/browser/agentSessions/agentHost/agentHostBranchPicker.js';
import { BRANCH_PICKER_LOADING_LABEL } from '../../sessions/browser/chat/branchPicker.js';

/** The branches a base branch submenu lists, as they load. */
export type BaseBranchCandidatesState =
	| { readonly kind: 'loading' }
	| { readonly kind: 'loaded'; readonly candidates: ISessionChangesetBaseBranchCandidates }
	| { readonly kind: 'failed' };

/**
 * The submenu that compares a changeset against the branch the user picks: a loading row, or the branches grouped with
 * `currentRef`, checked, and the default branch pinned above the others. A pick changes nothing once `isCurrent` is false.
 */
export function getBaseBranchSubmenuActions(
	state: Exclude<BaseBranchCandidatesState, { kind: 'failed' }>,
	currentRef: string,
	selection: ISessionChangesetBaseBranchSelection,
	isCurrent: () => boolean,
	notificationService: INotificationService,
): IAction[] {
	if (state.kind === 'loading') {
		return [Object.assign(toAction({ id: 'loading', label: BRANCH_PICKER_LOADING_LABEL, enabled: false, run: () => { } }), { icon: ThemeIcon.modify(Codicon.loading, 'spin') })];
	}

	const setBaseBranch = (ref: string) => {
		// Each changeset has its own selection, so another one means the pick would change the base of another session, chat or changeset.
		if (ref === currentRef || !isCurrent()) {
			return;
		}
		selection.setBaseBranch(ref).catch(error => {
			if (!isCancellationError(error)) {
				notificationService.error(error);
			}
		});
	};
	const groups: { label: string; actions: IAction[] }[] = [];
	for (const item of getBaseBranchItems(state.candidates, currentRef)) {
		if (item.kind === ActionListItemKind.Separator) {
			groups.push({ label: item.label ?? '', actions: [] });
		} else if (item.item) {
			if (groups.length === 0) {
				groups.push({ label: item.group?.title ?? '', actions: [] });
			}
			const ref = item.item.value;
			groups[groups.length - 1].actions.push(Object.assign(toAction({ id: ref, label: item.item.label, checked: ref === currentRef, run: () => setBaseBranch(ref) }), { icon: Codicon.gitBranch }));
		}
	}
	return groups.map(({ label, actions }, index) => new SubmenuAction(`changesBaseBranchPicker.group.${index}`, label, actions));
}

/** The options of a base branch submenu, which fixes its filter as it opens, before its branches are counted, and focuses it. */
export function getBaseBranchSubmenuOptions(): IActionListOptions {
	return { ...getBranchPickerListOptions(Number.POSITIVE_INFINITY, localize('changesBaseBranchPicker.filter', "Filter branches...")), focusFilterOnOpen: true };
}

/** The rows of `candidates`, with `currentRef` and the default branch pinned above the others. */
function getBaseBranchItems(candidates: ISessionChangesetBaseBranchCandidates, currentRef: string): IActionListItem<IBranchPickerItem>[] {
	// A base that is not a candidate, such as a short name recorded earlier, still gets its row and label.
	const refs = candidates.refs.includes(currentRef) ? candidates.refs : [currentRef, ...candidates.refs];
	const items: IActionListItem<IBranchPickerItem>[] = refs.map(ref => createBranchPickerActionItem(ref, getBaseBranchLabel(ref)));
	// Every row is listed already, so pinning creates none.
	items.unshift(...takePinnedBranchItems(items, [
		{
			label: localize('changesBaseBranchPicker.currentBaseGroup', "Current Base"),
			branches: currentRef !== candidates.defaultRef ? [{ name: currentRef, isRemote: false }] : [],
		},
		{
			label: localize('changesBaseBranchPicker.defaultBranchGroup', "Default Branch"),
			branches: [{ name: candidates.defaultRef, isRemote: false }],
		},
	], undefined));
	return items;
}
