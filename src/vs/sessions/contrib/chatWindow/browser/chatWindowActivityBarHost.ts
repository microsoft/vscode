/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { EditorPart } from '../../../../workbench/browser/parts/editor/editorPart.js';
import { IEditorGroup, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SessionActivityBarHostOccupancy } from '../../../browser/parts/sessionActivityBar.js';
import { SessionLayoutMode } from '../../../common/sessionLayoutMode.js';

/**
 * While the chat of a chat window is below its editor or hidden, the Session Activity Bar of the chat window shows at the
 * right edge of the window, below the editor's tabs, as the main window shows it at the right edge of its editor area;
 * the groups at the right edge of the window make room for it. Beside the editor or alone, the chat shows it.
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

	// Only while the host is active or a strip is in it; from the laid out content height, so it forces no reflow.
	const layoutHost = () => {
		const contentHeight = part.contentDimension?.height;
		if (contentHeight === undefined || (!active.get() && !occupancy.occupied.get())) {
			return;
		}
		const group = getEditorGroup();
		const top = group ? part.getGroup(group.id)?.titleHeight.offset ?? 0 : 0;
		const available = Math.max(0, contentHeight - top);
		element.style.top = `${top}px`;
		element.style.height = `${available}px`;
		height.set(available, undefined);
	};
	store.add(part.onDidLayout(layoutHost));
	store.add(autorun(reader => {
		active.read(reader);
		occupancy.occupied.read(reader);
		layoutHost();
	}));

	store.add(autorun(reader => {
		const isOccupied = occupancy.occupied.read(reader);
		element.classList.toggle('occupied', isOccupied);
		part.setContentRightInset(isOccupied ? SESSION_ACTIVITY_BAR_COLUMN_WIDTH : 0);
	}));
	store.add(toDisposable(() => part.setContentRightInset(0)));
	return store;
}
