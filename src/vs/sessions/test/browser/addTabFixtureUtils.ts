/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, isHTMLElement } from '../../../base/browser/dom.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Event } from '../../../base/common/event.js';
import { decodeKeybinding, ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { mock } from '../../../base/test/common/mock.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../platform/contextview/browser/contextView.js';
import { USLayoutResolvedKeybinding } from '../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';

// Shared fixture data and services for the Add Tab surfaces (empty editor group list, session toolbar).

export interface IFixtureEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly keybinding?: number;
	readonly submenu?: readonly string[];
	/** Renders the entry disabled, as when its precondition does not hold. */
	readonly disabled?: boolean;
}

export const fixtureChanges: IFixtureEntry = { id: 'sessions.fixture.addTab.changes', title: 'Changes', icon: Codicon.diffMultiple, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG };
export const fixtureFiles: IFixtureEntry = { id: 'sessions.fixture.addTab.files', title: 'Files', icon: Codicon.files, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE };
export const fixtureBrowser: IFixtureEntry = { id: 'sessions.fixture.addTab.browser', title: 'Browser', icon: Codicon.globe, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB };
export const fixtureCanvas: IFixtureEntry = { id: 'sessions.fixture.addTab.canvas', title: 'Canvas', icon: Codicon.preview, submenu: ['Kusto'] };

export class FixtureMenuService extends mock<IMenuService>() {

	commandService: ICommandService | undefined;

	constructor(private readonly entries: readonly IFixtureEntry[]) {
		super();
	}

	override createMenu(_id: MenuId, contextKeyService: IContextKeyService): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: options => [['navigation', this.entries.map(entry => this.toAction(entry, contextKeyService, options))]],
		};
	}

	private toAction(entry: IFixtureEntry, contextKeyService: IContextKeyService, options: IMenuActionOptions | undefined): MenuItemAction | SubmenuItemAction {
		if (entry.submenu) {
			return new SubmenuItemAction({ submenu: MenuId.for(entry.id), title: entry.title, icon: entry.icon }, undefined, entry.submenu.map((label, index) => ({
				id: `${entry.id}.${index}`, label, tooltip: '', class: undefined, enabled: true, run: () => { },
			})));
		}
		return new MenuItemAction({ id: entry.id, title: entry.title, icon: entry.icon, precondition: entry.disabled ? ContextKeyExpr.false() : undefined }, undefined, options, undefined, undefined, contextKeyService, this.commandService!);
	}
}

export class FixtureKeybindingService extends MockKeybindingService {

	constructor(private readonly entries: readonly IFixtureEntry[]) {
		super();
	}

	override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
		const keybinding = this.entries.find(entry => entry.id === commandId)?.keybinding;
		const decoded = keybinding === undefined ? null : decodeKeybinding(keybinding, OS);
		return decoded ? USLayoutResolvedKeybinding.resolveKeybinding(decoded, OS)[0] : undefined;
	}
}

/** Renders context views inside the fixture next to their anchor, instead of in the workbench overlay. */
export class FixtureContextViewService extends mock<IContextViewService>() {

	private current: { readonly delegate: IContextViewDelegate; readonly element: HTMLElement; readonly rendered: IDisposable } | undefined;

	constructor(private readonly host: HTMLElement) {
		super();
	}

	override showContextView(delegate: IContextViewDelegate): IOpenContextView {
		this.hideContextView();

		const element = append(this.host, $('.fixture-context-view'));
		element.style.position = 'absolute';
		element.style.zIndex = '10';
		const rendered = delegate.render(element);
		const anchor = delegate.getAnchor();
		if (isHTMLElement(anchor)) {
			// Like the real context view: beside the anchor, on the side that has room.
			const hostBounds = this.host.getBoundingClientRect();
			const anchorBounds = anchor.getBoundingClientRect();
			const width = element.offsetWidth;
			const left = anchorBounds.right + width <= hostBounds.right ? anchorBounds.right : anchorBounds.left - width;
			element.style.left = `${left - hostBounds.left}px`;
			element.style.top = `${anchorBounds.top - hostBounds.top}px`;
		}

		this.current = { delegate, element, rendered };
		delegate.focus?.();
		return {
			close: () => {
				if (this.current?.delegate === delegate) {
					this.hideContextView();
				}
			}
		};
	}

	override hideContextView(): void {
		const current = this.current;
		if (!current) {
			return;
		}
		this.current = undefined;
		current.delegate.onHide?.();
		current.rendered.dispose();
		current.element.remove();
	}
}
