/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAgentHostFilterService } from '../common/agentHostFilter.js';
import { HostFilterActionViewItem } from './hostFilterActionViewItem.js';
import './media/hostPickerDropdown.css';

/**
 * Mobile variant of {@link HostFilterActionViewItem}.
 *
 * Overrides the host picker to show a dropdown panel anchored below the
 * trigger element instead of the desktop context menu.
 */
export class MobileHostFilterActionViewItem extends HostFilterActionViewItem {

	private readonly _dropdown = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: IAction,
		@IAgentHostFilterService filterService: IAgentHostFilterService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
	) {
		super(action, filterService, contextMenuService, hoverService);
	}

	protected override _showMenu(_e: MouseEvent | KeyboardEvent): void {
		if (!this.element) {
			return;
		}

		const hosts = this._filterService.hosts;
		if (hosts.length <= 1) {
			return;
		}

		this._showDropdown();
	}

	private _showDropdown(): void {
		this._dropdown.clear();

		const disposables = new DisposableStore();
		this._dropdown.value = disposables;

		const targetWindow = dom.getWindow(this.element);
		const targetDocument = targetWindow.document;
		const hosts = this._filterService.hosts;
		const selectedId = this._filterService.selectedProviderId;

		// Append inside the workbench container so CSS theme variables are inherited.
		// The workbench element sets all --vscode-* custom properties; rendering
		// outside it (e.g. on document.body) leaves them undefined.
		const workbenchContainer = dom.findParentWithClass(this.element!, 'monaco-workbench')
			?? targetDocument.body;

		// --- Backdrop (transparent, dismiss on tap) ---
		const backdrop = targetDocument.createElement('div');
		backdrop.className = 'host-picker-dropdown-backdrop';
		disposables.add(dom.addDisposableListener(backdrop, dom.EventType.CLICK, () => dismiss()));
		disposables.add(Gesture.addTarget(backdrop));
		disposables.add(dom.addDisposableListener(backdrop, TouchEventType.Tap, () => dismiss()));

		// --- Dropdown panel anchored below trigger ---
		const panel = targetDocument.createElement('div');
		panel.className = 'host-picker-dropdown';
		panel.setAttribute('role', 'menu');
		panel.setAttribute('aria-label', localize('agentHostFilter.dropdown.aria', "Select Agent Host"));

		// Prevent taps on the panel from dismissing
		disposables.add(dom.addDisposableListener(panel, dom.EventType.CLICK, e => e.stopPropagation()));
		disposables.add(Gesture.addTarget(panel));
		disposables.add(dom.addDisposableListener(panel, TouchEventType.Tap, e => dom.EventHelper.stop(e, true)));

		// Position below the trigger element, centered horizontally
		const triggerRect = this.element!.getBoundingClientRect();
		const gap = 4;
		panel.style.top = `${triggerRect.bottom + gap}px`;
		panel.style.left = '50%';
		panel.style.transform = 'translateX(-50%)';
		panel.style.minWidth = `${Math.max(triggerRect.width, 200)}px`;

		let firstItem: HTMLElement | undefined;
		for (const host of hosts) {
			const item = targetDocument.createElement('button');
			item.className = 'host-picker-dropdown-item';
			item.setAttribute('role', 'menuitemradio');
			item.setAttribute('aria-checked', String(selectedId === host.providerId));
			if (selectedId === host.providerId) {
				item.classList.add('selected');
			}

			const iconSpan = targetDocument.createElement('span');
			iconSpan.className = 'host-picker-dropdown-item-icon';
			iconSpan.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
			item.appendChild(iconSpan);

			const labelSpan = targetDocument.createElement('span');
			labelSpan.className = 'host-picker-dropdown-item-label';
			labelSpan.textContent = host.label;
			item.appendChild(labelSpan);

			if (selectedId === host.providerId) {
				const checkSpan = targetDocument.createElement('span');
				checkSpan.className = 'host-picker-dropdown-item-check';
				checkSpan.append(...renderLabelWithIcons(`$(${Codicon.check.id})`));
				item.appendChild(checkSpan);
			}

			disposables.add(Gesture.addTarget(item));
			const selectHost = () => {
				this._filterService.setSelectedProviderId(host.providerId);
				dismiss();
			};
			disposables.add(dom.addDisposableListener(item, dom.EventType.CLICK, selectHost));
			disposables.add(dom.addDisposableListener(item, TouchEventType.Tap, selectHost));

			panel.appendChild(item);
			firstItem ??= item;
		}

		backdrop.appendChild(panel);
		workbenchContainer.appendChild(backdrop);
		disposables.add({ dispose: () => backdrop.remove() });

		// Dismiss on Escape
		disposables.add(dom.addDisposableListener(targetDocument, dom.EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				dom.EventHelper.stop(e, true);
				dismiss();
			}
		}));

		// Focus first item
		firstItem?.focus();

		let isDismissing = false;
		const dismiss = () => {
			if (isDismissing) {
				return;
			}
			isDismissing = true;
			panel.classList.add('dismissing');
			const onEnd = () => {
				if (this._dropdown.value === disposables) {
					this._dropdown.clear();
				}
			};
			panel.addEventListener('animationend', onEnd, { once: true });
			const dismissTimeout = setTimeout(onEnd, 200);
			disposables.add({ dispose: () => clearTimeout(dismissTimeout) });
		};
	}
}
