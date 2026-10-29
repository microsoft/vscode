/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getActiveElement } from '../../../../base/browser/dom.js';
import { IContextMenuDelegate, markAsContextMenuHost } from '../../../../base/browser/contextmenu.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextMenuHandler } from '../../browser/contextMenuHandler.js';
import { IContextViewService } from '../../browser/contextView.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';

suite('ContextMenuHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [selection, expected] of [
		[undefined, undefined],
		[false, undefined],
		[true, 'First'],
		[0, 'First'],
		[2, 'Second'],
		[-1, undefined],
		[NaN, undefined],
		[Infinity, undefined],
		[-Infinity, undefined],
		[0.5, undefined],
		[3, undefined],
	] as const) {
		test(`normalizes HTML menu selection ${selection} to ${expected}`, () => {
			const container = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => container.remove()));
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					store.add(delegate.render(container));
					delegate.focus?.();
					return { close: () => delegate.onHide?.() };
				},
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			const actions = [store.add(new Action('first', 'First')), new Separator(), store.add(new Action('second', 'Second'))];
			handler.showContextMenu({
				getAnchor: () => container,
				getActions: () => actions,
				autoSelectItem: selection,
			});

			assert.strictEqual(getActiveElement()?.closest('.action-item')?.textContent, expected);
		});
	}

	suite('context menu hosts', () => {
		function showAndCaptureContainer(delegate: Omit<IContextMenuDelegate, 'getActions'>) {
			let captured: { container: HTMLElement | undefined; shadowRoot: boolean | undefined; useWindowContainerForShadowRoot: boolean | undefined } | undefined;
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: (_delegate, container, shadowRoot, useWindowContainerForShadowRoot) => {
					captured = { container, shadowRoot, useWindowContainerForShadowRoot };
					return { close: () => { } };
				},
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			const action = store.add(new Action('action', 'Action'));
			handler.showContextMenu({ ...delegate, getActions: () => [action] });
			return captured;
		}

		function createHosts() {
			const outer = mainWindow.document.body.appendChild($('div.outer'));
			store.add(toDisposable(() => outer.remove()));
			const inner = outer.appendChild($('div.inner'));
			const trigger = inner.appendChild($('button'));
			const unmarked = mainWindow.document.body.appendChild($('button'));
			store.add(toDisposable(() => unmarked.remove()));
			store.add(markAsContextMenuHost(outer));
			store.add(markAsContextMenuHost(inner));
			return { outer, inner, trigger, unmarked };
		}

		test('host resolution: nearest host, mouse event target, explicit element, coordinates, unmarked', () => {
			const { inner, trigger, unmarked } = createHosts();
			const explicit = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => explicit.remove()));
			const mouseEvent = new StandardMouseEvent(mainWindow, new MouseEvent('contextmenu'));
			Object.defineProperty(mouseEvent, 'target', { value: trigger });

			assert.deepStrictEqual({
				elementAnchor: showAndCaptureContainer({ getAnchor: () => trigger }),
				mouseEventAnchor: showAndCaptureContainer({ getAnchor: () => mouseEvent }),
				explicitWins: showAndCaptureContainer({ getAnchor: () => trigger, domForShadowRoot: explicit }),
				windowContainer: showAndCaptureContainer({ getAnchor: () => trigger, domForShadowRoot: explicit, useWindowContainerForShadowRoot: true }),
				coordinates: showAndCaptureContainer({ getAnchor: () => ({ x: 1, y: 1 }) }),
				unmarked: showAndCaptureContainer({ getAnchor: () => unmarked }),
			}, {
				elementAnchor: { container: inner, shadowRoot: true, useWindowContainerForShadowRoot: undefined },
				mouseEventAnchor: { container: inner, shadowRoot: true, useWindowContainerForShadowRoot: undefined },
				explicitWins: { container: explicit, shadowRoot: true, useWindowContainerForShadowRoot: undefined },
				windowContainer: { container: explicit, shadowRoot: true, useWindowContainerForShadowRoot: true },
				coordinates: { container: undefined, shadowRoot: false, useWindowContainerForShadowRoot: undefined },
				unmarked: { container: undefined, shadowRoot: false, useWindowContainerForShadowRoot: undefined },
			});
		});

		test('disposing a host declaration removes it', () => {
			const outer = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => outer.remove()));
			const trigger = outer.appendChild($('button'));
			const declaration = markAsContextMenuHost(outer);
			const before = showAndCaptureContainer({ getAnchor: () => trigger })?.container;
			declaration.dispose();
			const after = showAndCaptureContainer({ getAnchor: () => trigger })?.container;
			assert.deepStrictEqual([before, after], [outer, undefined]);
		});
	});
});
