/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionOptionsRow } from '../../browser/sessionOptionsRow.js';
import { getSessionPickerId } from '../../browser/sessionPickerToolbar.js';

suite('Sessions - SessionOptionsRow', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Tab and the arrow keys move through the row\'s pickers and the disclosure toggle in order', () => {
		const document = mainWindow.document;
		const container = document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const row = container.appendChild(document.createElement('div'));
		const control = (parent: HTMLElement, name: string, role: string) => {
			const element = parent.appendChild(document.createElement('a'));
			element.tabIndex = 0;
			element.role = role;
			element.setAttribute('aria-label', name);
			return element;
		};
		const folder = control(row, 'folder', 'button');
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'test',
			screenReaderOptimized: constObservable(false),
			expanded: constObservable(true),
			collapsedShowIcons: constObservable(true),
			setExpanded: () => { },
		}));
		control(sessionOptionsRow.repositoryControlsHost, 'isolation', 'button');
		control(sessionOptionsRow.repositoryControlsHost, 'branch', 'button');
		const harness = control(sessionOptionsRow.details, 'harness', 'button');
		harness.setAttribute('aria-disabled', 'true');
		harness.classList.add('disabled');

		const visit = (key: string, count: number) => {
			folder.focus();
			const visited: (string | null)[] = [];
			for (let i = 0; i < count; i++) {
				visited.push(document.activeElement?.getAttribute('aria-label') ?? null);
				document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			}
			return visited;
		};

		assert.deepStrictEqual({ tab: visit('Tab', 4), arrow: visit('ArrowRight', 6), reverseArrow: visit('ArrowLeft', 6) }, {
			tab: ['folder', 'isolation', 'branch', 'Hide Session Options'],
			arrow: ['folder', 'isolation', 'branch', 'harness', 'Hide Session Options', 'folder'],
			reverseArrow: ['folder', 'Hide Session Options', 'harness', 'branch', 'isolation', 'folder'],
		});
	});

	test('focus moves to the primary picker, not the hidden toggle, when the options go away', () => {
		const document = mainWindow.document;
		const container = document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const row = container.appendChild(document.createElement('div'));
		const folder = row.appendChild(document.createElement('a'));
		folder.tabIndex = 0;
		folder.role = 'button';
		folder.setAttribute('aria-label', 'folder');
		const hasDetails = observableValue('hasDetails', true);
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'test',
			screenReaderOptimized: constObservable(false),
			expanded: constObservable(true),
			collapsedShowIcons: constObservable(true),
			hasDetails,
			setExpanded: () => { },
		}));
		const isolation = sessionOptionsRow.repositoryControlsHost.appendChild(document.createElement('a'));
		isolation.tabIndex = 0;
		isolation.role = 'button';
		isolation.focus();
		hasDetails.set(false, undefined);

		assert.deepStrictEqual({ focused: document.activeElement?.getAttribute('aria-label'), toggleHidden: sessionOptionsRow.toggle.element.hidden }, { focused: 'folder', toggleHidden: true });
	});

	test('pickers collapse to their icon and open their context menu', () => {
		const document = mainWindow.document;
		const container = document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const row = container.appendChild(document.createElement('div'));
		const picker = (parent: HTMLElement, id: string) => {
			const slot = parent.appendChild(document.createElement('div'));
			slot.className = 'sessions-chat-picker-slot';
			slot.setAttribute('data-session-picker-id', id);
			const label = slot.appendChild(document.createElement('a')).appendChild(document.createElement('span'));
			label.className = 'sessions-chat-dropdown-label';
			label.textContent = id;
			return slot;
		};
		const workspace = picker(row, 'workspace');
		const iconOnlyPickerIds = observableValue<ReadonlySet<string>>('iconOnlyPickerIds', new Set());
		const contextMenus: (string | undefined)[] = [];
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'test',
			screenReaderOptimized: constObservable(false),
			expanded: constObservable(true),
			collapsedShowIcons: constObservable(true),
			setExpanded: () => { },
			iconOnlyPickers: {
				iconOnlyPickerIds,
				showOptionsToggle: constObservable(true),
				getPickerId: element => getSessionPickerId(element),
				showContextMenu: pickerId => contextMenus.push(pickerId),
			},
		}));
		const environment = picker(sessionOptionsRow.details, 'environment');
		const harness = picker(sessionOptionsRow.details, 'harness');
		const snapshot = () => {
			sessionOptionsRow.layout();
			const contextMenuCount = contextMenus.length;
			const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
			harness.querySelector('.sessions-chat-dropdown-label')!.dispatchEvent(event);
			return {
				iconOnly: [workspace, environment, harness].filter(element => element.classList.contains('compact-picker')).map(element => element.getAttribute('data-session-picker-id')),
				contextMenu: contextMenus.slice(contextMenuCount),
				handled: event.defaultPrevented,
			};
		};

		const states = [snapshot()];
		iconOnlyPickerIds.set(new Set(['workspace', 'environment']), undefined);
		states.push(snapshot());

		assert.deepStrictEqual(states, [
			{ iconOnly: [], contextMenu: ['harness'], handled: true },
			{ iconOnly: ['workspace', 'environment'], contextMenu: ['harness'], handled: true },
		]);
	});

	test('a hidden disclosure keeps the options available and can be restored from the row context menu', () => {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const row = container.appendChild(mainWindow.document.createElement('div'));
		const workspace = row.appendChild(mainWindow.document.createElement('a'));
		workspace.textContent = 'Workspace';
		workspace.role = 'button';
		workspace.tabIndex = 0;
		const showOptionsToggle = observableValue('showOptionsToggle', true);
		const menus: (string | undefined)[] = [];
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'test',
			screenReaderOptimized: constObservable(false),
			expanded: constObservable(false),
			collapsedShowIcons: constObservable(false),
			setExpanded: () => { },
			iconOnlyPickers: {
				iconOnlyPickerIds: constObservable(new Set<string>()),
				showOptionsToggle,
				getPickerId: () => undefined,
				showContextMenu: pickerId => menus.push(pickerId),
			},
		}));
		const snapshot = () => ({
			toggleHidden: sessionOptionsRow.toggle.element.hidden,
			optionsHidden: sessionOptionsRow.details.hidden,
			inert: sessionOptionsRow.details.inert,
		});
		const initial = snapshot();
		const unrelatedMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		workspace.dispatchEvent(unrelatedMenu);
		sessionOptionsRow.toggle.focus();
		showOptionsToggle.set(false, undefined);
		const hidden = { ...snapshot(), focusedWorkspace: mainWindow.document.activeElement === workspace };
		row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		showOptionsToggle.set(true, undefined);
		assert.deepStrictEqual({ initial, hidden, restored: snapshot(), menus, unrelatedMenuHandled: unrelatedMenu.defaultPrevented }, {
			initial: { toggleHidden: false, optionsHidden: true, inert: true },
			hidden: { toggleHidden: true, optionsHidden: false, inert: false, focusedWorkspace: true },
			restored: initial,
			menus: [undefined],
			unrelatedMenuHandled: false,
		});
	});
});
