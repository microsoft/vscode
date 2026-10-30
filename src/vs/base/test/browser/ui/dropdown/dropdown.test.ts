/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate, IContextMenuProvider } from '../../../../browser/contextmenu.js';
import { $ } from '../../../../browser/dom.js';
import { mainWindow } from '../../../../browser/window.js';
import { contextViewMenuCloseAnimation, CONTEXT_VIEW_MENU_MOTION_CLASS, IContextViewCloseAnimation } from '../../../../browser/ui/contextview/contextview.js';
import { DropdownMenu } from '../../../../browser/ui/dropdown/dropdown.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('DropdownMenu', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies menu motion by default and preserves overrides', () => {
		const delegates: IContextMenuDelegate[] = [];
		const contextMenuProvider: IContextMenuProvider = {
			showContextMenu: delegate => delegates.push(delegate)
		};
		const customCloseAnimation: IContextViewCloseAnimation = {
			className: 'custom-closing',
			duration: 42
		};

		const defaultContainer = $('.default');
		disposables.add(toDisposable(() => defaultContainer.remove()));
		disposables.add(new DropdownMenu(defaultContainer, {
			contextMenuProvider,
			actions: [],
			menuClassName: 'custom-menu'
		})).show();

		const overriddenContainer = $('.overridden');
		disposables.add(toDisposable(() => overriddenContainer.remove()));
		disposables.add(new DropdownMenu(overriddenContainer, {
			contextMenuProvider,
			actions: [],
			menuClassName: CONTEXT_VIEW_MENU_MOTION_CLASS,
			closeAnimation: customCloseAnimation
		})).show();

		assert.deepStrictEqual(delegates.map(delegate => ({
			menuClassName: delegate.getMenuClassName?.(),
			closeAnimation: delegate.closeAnimation
		})), [{
			menuClassName: `custom-menu ${CONTEXT_VIEW_MENU_MOTION_CLASS}`,
			closeAnimation: contextViewMenuCloseAnimation
		}, {
			menuClassName: CONTEXT_VIEW_MENU_MOTION_CLASS,
			closeAnimation: customCloseAnimation
		}]);
	});

	test('hides the shown menu when the label is pressed again', () => {
		const delegates: IContextMenuDelegate[] = [];
		let hideRequests = 0;
		const contextMenuProvider: IContextMenuProvider = {
			showContextMenu: delegate => delegates.push(delegate),
			hideContextMenu: () => {
				hideRequests++;
				delegates.at(-1)?.onHide?.(true);
			}
		};
		const container = mainWindow.document.body.appendChild($('.container'));
		disposables.add(toDisposable(() => container.remove()));
		const dropdown = disposables.add(new DropdownMenu(container, {
			contextMenuProvider,
			actions: [],
			menuAsPopover: true,
			label: 'More'
		}));
		const visibility: boolean[] = [];
		disposables.add(dropdown.onDidChangeVisibility(visible => visibility.push(visible)));
		const pressLabel = () => dropdown.label!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));

		pressLabel();
		const shown = { delegates: delegates.length, active: dropdown.element.classList.contains('active'), visible: dropdown.isVisible() };
		pressLabel();
		const hidden = { hideRequests, active: dropdown.element.classList.contains('active'), visible: dropdown.isVisible() };
		dropdown.hide();

		assert.deepStrictEqual({ shown, hidden, hideRequests, visibility }, {
			shown: { delegates: 1, active: true, visible: true },
			hidden: { hideRequests: 1, active: false, visible: false },
			hideRequests: 1,
			visibility: [true, false]
		});
	});
});
