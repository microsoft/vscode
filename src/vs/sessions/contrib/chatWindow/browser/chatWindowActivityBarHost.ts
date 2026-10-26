/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { EditorGroupView } from '../../../../workbench/browser/parts/editor/editorGroupView.js';
import { EditorPart } from '../../../../workbench/browser/parts/editor/editorPart.js';
import { IEditorGroup, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SessionActivityBarHostOccupancy } from '../../../browser/parts/sessionActivityBar.js';
import { SessionLayoutMode } from '../../../common/sessionLayoutMode.js';

/**
 * While the chat of a chat window is below its editor or hidden, the Session Activity Bar of the chat window shows at the
 * right edge of the window, as the main window shows it. Stacked, the window is two columns: the groups (the editor, the
 * chat and the terminal row, with their tabs and sashes) are laid out in the first, and the strip runs in the second, of
 * its own, the full height of the window; with the chat hidden, the editor makes room for it below its tabs. Beside the
 * editor or alone, the chat shows it.
 *
 * `scope` is the element of the chat window's editor part, within which the host applies to the chat window's strip.
 */
export function registerChatWindowActivityBarHost(part: IEditorPart, scope: HTMLElement, layout: IObservable<SessionLayoutMode>, getEditorGroup: () => IEditorGroup | undefined): IDisposable {
	if (!(part instanceof EditorPart)) {
		return Disposable.None;
	}
	const store = new DisposableStore();
	const element = append(scope, $('.session-activity-bar-host.session-activity-bar-editor-host'));
	element.style.setProperty('--session-activity-bar-column-width', `${SESSION_ACTIVITY_BAR_COLUMN_WIDTH}px`);
	store.add(toDisposable(() => element.remove()));

	const occupancy = new SessionActivityBarHostOccupancy();
	const height = observableValue('height', 0);
	const active = derived(reader => {
		const current = layout.read(reader);
		return current === SessionLayoutMode.Stacked || current === SessionLayoutMode.EditorOnly;
	});
	store.add(registerSessionActivityBarExternalHost(scope, {
		element,
		active,
		height,
		setOccupied: (occupant, occupied) => occupancy.set(occupant, occupied),
	}));

	const inColumn = derived(reader => occupancy.occupied.read(reader) && layout.read(reader) === SessionLayoutMode.Stacked);
	// Only while the host is active or a strip is in it; from the laid out content height, so it forces no reflow.
	const layoutHost = () => {
		const contentHeight = part.contentDimension?.height;
		if (contentHeight === undefined || (!active.get() && !occupancy.occupied.get())) {
			return;
		}
		const group = getEditorGroup();
		const top = inColumn.get() ? 0 : group ? part.getGroup(group.id)?.titleHeight.offset ?? 0 : 0;
		const available = Math.max(0, contentHeight - top);
		element.style.top = `${top}px`;
		element.style.height = `${available}px`;
		height.set(available, undefined);
	};
	store.add(part.onDidLayout(layoutHost));
	// Below the tabs, whose height is known once the group lays out: a window opening stacked lays the part out first.
	const groupRelayouts = store.add(new DisposableMap<IEditorGroup>());
	const trackGroup = (group: IEditorGroup) => {
		if (group instanceof EditorGroupView) {
			groupRelayouts.set(group, group.onDidRelayout(layoutHost));
		}
	};
	part.groups.forEach(trackGroup);
	store.add(part.onDidAddGroup(trackGroup));
	store.add(part.onDidRemoveGroup(group => groupRelayouts.deleteAndDispose(group)));
	store.add(autorun(reader => {
		active.read(reader);
		inColumn.read(reader);
		occupancy.occupied.read(reader);
		layoutHost();
	}));

	store.add(autorun(reader => {
		const isOccupied = occupancy.occupied.read(reader);
		const column = inColumn.read(reader);
		element.classList.toggle('occupied', isOccupied);
		element.classList.toggle('stacked-column', column);
		part.setGridRightInset(column ? SESSION_ACTIVITY_BAR_COLUMN_WIDTH : 0);
		part.setContentRightInset(isOccupied && !column ? SESSION_ACTIVITY_BAR_COLUMN_WIDTH : 0);
	}));
	store.add(toDisposable(() => {
		part.setGridRightInset(0);
		part.setContentRightInset(0);
	}));
	return store;
}
