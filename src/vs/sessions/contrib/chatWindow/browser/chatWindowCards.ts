/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IEditorGroupView } from '../../../../workbench/browser/parts/editor/editor.js';
import { IEditorGroup, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { AGENTS_PART_CARD_CLASS, applyAgentsPartCardStyles } from '../../../browser/parts/agentsPartCard.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../common/layoutConstants.js';

/** Marks a group of a standalone chat window that is a card: the gaps are in the layout, so it has no margin of its own. */
export const CHAT_WINDOW_CARD_CLASS = 'chat-window-card';

const MODERN_UI_COMPACT_CLASS = 'modern-ui-compact';

/** What {@link ChatWindowCards} needs of the editor part of a chat window. */
export type ChatWindowCardsPart = Pick<IEditorPart, 'groups' | 'onDidAddGroup' | 'onDidRemoveGroup' | 'setGroupGap'>;

/**
 * Makes the chat, the editor area and the terminal row of a standalone chat window cards, as the main window's content parts
 * are, unless Layout Density is compact, which keeps them flush. The window root tracks the main window's density class, so
 * this follows it while the window is open. The docked chat window part is a single floating card and does not use this.
 */
export class ChatWindowCards extends Disposable {

	private readonly _cards = this._register(new DisposableMap<number>());
	private _enabled: boolean;

	constructor(
		private readonly _part: ChatWindowCardsPart,
		private readonly _root: HTMLElement,
		private readonly _themeService: IThemeService,
	) {
		super();

		this._enabled = !this._isCompact();
		for (const group of _part.groups) {
			this._addCard(group);
		}
		this._register(_part.onDidAddGroup(group => this._addCard(group)));
		this._register(_part.onDidRemoveGroup(group => this._cards.deleteAndDispose(group.id)));
		this._register(_themeService.onDidColorThemeChange(() => this._applyTheme()));

		const observer = new (getWindow(_root).MutationObserver)(() => this._update());
		observer.observe(_root, { attributes: true, attributeFilter: ['class'] });
		this._register({ dispose: () => observer.disconnect() });

		_part.setGroupGap(this._enabled ? AGENTS_FLOATING_PANEL_GAP : 0);
	}

	/** Whether the groups are cards: not while Layout Density is compact. */
	get enabled(): boolean {
		return this._enabled;
	}

	private _isCompact(): boolean {
		return this._root.classList.contains(MODERN_UI_COMPACT_CLASS);
	}

	private _update(): void {
		const enabled = !this._isCompact();
		if (enabled !== this._enabled) {
			this._enabled = enabled;
			this._part.setGroupGap(enabled ? AGENTS_FLOATING_PANEL_GAP : 0);
		}
	}

	private _addCard(group: IEditorGroup): void {
		const element = (group as IEditorGroupView).element;
		element.classList.add(AGENTS_PART_CARD_CLASS, CHAT_WINDOW_CARD_CLASS);
		applyAgentsPartCardStyles(element, this._themeService.getColorTheme());
		this._cards.set(group.id, {
			dispose: () => element.classList.remove(AGENTS_PART_CARD_CLASS, CHAT_WINDOW_CARD_CLASS)
		});
	}

	private _applyTheme(): void {
		const theme = this._themeService.getColorTheme();
		for (const group of this._part.groups) {
			applyAgentsPartCardStyles((group as IEditorGroupView).element, theme);
		}
	}
}
