/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { getBaseBranchLabel } from '../../../../platform/agentHost/common/agentHostGitService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISessionChangesetBaseBranchCandidates } from '../../../services/sessions/common/session.js';
import { createBranchPickerActionItem, getBranchPickerListOptions, IBranchPickerItem, takePinnedBranchItems } from '../../chat/browser/agentSessions/agentHost/agentHostBranchPicker.js';
import { BRANCH_PICKER_LOADING_LABEL } from '../../sessions/browser/chat/branchPicker.js';
import type { IChangesBaseBranch } from './changesView.js';

/**
 * Lists below `anchor` the branches the selection of `baseBranch` can compare against, with its ref, the recorded
 * base, focused, and compares against the ref the user picks. Shows a loading row at once and the branches as they
 * load. Does nothing while `baseBranch` has no selection, and hides as `token` is cancelled or `baseBranch` carries
 * another selection.
 */
export function showBaseBranchPicker(
	actionWidgetService: IActionWidgetService,
	notificationService: INotificationService,
	baseBranch: IObservable<IChangesBaseBranch | undefined>,
	anchor: HTMLElement,
	token: CancellationToken = CancellationToken.None,
): void {
	const { ref: currentRef, selection } = baseBranch.get() ?? {};
	if (!currentRef || !selection || token.isCancellationRequested) {
		return;
	}

	const previouslyFocusedElement = getActiveElement();
	const store = new DisposableStore();
	const cts = new CancellationTokenSource(token);
	store.add(toDisposable(() => cts.dispose(true)));
	// Each changeset has its own selection, so another one means the picker would change the base of another session, chat or changeset.
	store.add(autorun(reader => {
		if (baseBranch.read(reader)?.selection !== selection) {
			cts.cancel();
		}
	}));
	// Another widget may replace this picker, and must not be hidden in its place.
	let shown = true;
	store.add(cts.token.onCancellationRequested(() => {
		if (shown) {
			actionWidgetService.hide();
		}
	}));
	let filter = '';
	actionWidgetService.show<IBranchPickerItem>(
		'changesBaseBranchPicker',
		false,
		[{
			kind: ActionListItemKind.Action,
			label: BRANCH_PICKER_LOADING_LABEL,
			group: { title: '', icon: ThemeIcon.modify(Codicon.loading, 'spin') },
			disabled: true,
			// A row without an item renders no label.
			item: { id: '', value: '', label: BRANCH_PICKER_LOADING_LABEL },
		}],
		{
			onSelect: item => {
				if (cts.token.isCancellationRequested) {
					return;
				}
				actionWidgetService.hide();
				if (item.value === currentRef) {
					return;
				}
				selection.setBaseBranch(item.value).catch(error => {
					if (!isCancellationError(error)) {
						notificationService.error(error);
					}
				});
			},
			onHide: () => {
				shown = false;
				store.dispose();
				if (isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			},
		},
		anchor,
		undefined,
		[],
		{
			getAriaLabel: item => item.group?.title
				? localize('changesBaseBranchPicker.itemAriaLabel', "{0}, {1}", item.label ?? '', item.group.title)
				: item.label ?? '',
			getWidgetAriaLabel: () => localize('changesBaseBranchPicker.ariaLabel', "Base Branch Picker"),
		},
		{
			// The branches are not counted until they load, and the list cannot add its filter later.
			...getBranchPickerListOptions(Number.POSITIVE_INFINITY, localize('changesBaseBranchPicker.filter', "Filter branches...")),
			onDidChangeFilter: text => filter = text,
		},
	);

	selection.getCandidates(cts.token).then(candidates => {
		if (!cts.token.isCancellationRequested) {
			// Whoever types a filter while the branches load keeps typing it.
			actionWidgetService.updateItems(getBaseBranchItems(candidates, currentRef), currentRef, { focusFilter: !!filter });
		}
	}, error => {
		if (cts.token.isCancellationRequested) {
			return;
		}
		actionWidgetService.hide();
		if (!isCancellationError(error)) {
			notificationService.error(error);
		}
	});
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
