/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { getBaseBranchLabel } from '../../../../platform/agentHost/common/agentHostGitService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISessionChangesetBaseBranchCandidates, ISessionChangesetBaseBranchSelection } from '../../../services/sessions/common/session.js';
import { createBranchPickerActionItem, getBranchPickerListOptions, IBranchPickerItem, takePinnedBranchItems } from '../../chat/browser/agentSessions/agentHost/agentHostBranchPicker.js';

/**
 * Lists the branches `selection` can compare against below `anchor`, with
 * `currentRef`, the recorded base, focused, and compares against the ref the
 * user picks. Shows nothing until the branches load, or when `token` is
 * cancelled before then, and hides as `token` is cancelled later.
 */
export async function showBaseBranchPicker(
	actionWidgetService: IActionWidgetService,
	notificationService: INotificationService,
	selection: ISessionChangesetBaseBranchSelection,
	currentRef: string,
	anchor: HTMLElement,
	token: CancellationToken,
): Promise<void> {
	let candidates: ISessionChangesetBaseBranchCandidates;
	try {
		candidates = await selection.getCandidates(token);
	} catch (error) {
		if (!isCancellationError(error) && !token.isCancellationRequested) {
			notificationService.error(error);
		}
		return;
	}
	if (token.isCancellationRequested) {
		return;
	}

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

	const previouslyFocusedElement = getActiveElement();
	// Another widget may replace this picker, and must not be hidden in its place.
	let shown = true;
	const hideOnCancel = token.onCancellationRequested(() => {
		if (shown) {
			actionWidgetService.hide();
		}
	});
	actionWidgetService.show<IBranchPickerItem>(
		'changesBaseBranchPicker',
		false,
		items,
		{
			onSelect: item => {
				if (token.isCancellationRequested) {
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
				hideOnCancel.dispose();
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
		getBranchPickerListOptions(refs.length, localize('changesBaseBranchPicker.filter', "Filter branches...")),
	);
	actionWidgetService.focusItemById(currentRef);
}
