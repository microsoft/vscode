/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { IRadioOptionItem, Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';

/**
 * The kind of working set tab.
 */
export const enum ChatWorkingSetTabKind {
	Messages,
	Files,
	Todos,
	Questions,
}

/**
 * Data for a single working set tab.
 */
export interface IChatWorkingSetTabData {
	readonly kind: ChatWorkingSetTabKind;
	readonly count: number;
	readonly diffStats?: { readonly added: number; readonly removed: number };
}

/**
 * A tabbed widget for switching between working set panels (Messages, Files, Todos).
 * Tabs are only shown when they have data, and the widget auto-selects the first
 * available tab when the active tab becomes empty.
 */
export class ChatWorkingSetTabs extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _onDidSelect = this._register(new Emitter<ChatWorkingSetTabKind>());
	readonly onDidSelect: Event<ChatWorkingSetTabKind> = this._onDidSelect.event;

	private readonly _onDidToggle = this._register(new Emitter<ChatWorkingSetTabKind>());
	readonly onDidToggle: Event<ChatWorkingSetTabKind> = this._onDidToggle.event;

	private readonly _radioDisposables = this._register(new DisposableStore());
	private _tabs: IChatWorkingSetTabData[] = [];
	private _activeTabs: IChatWorkingSetTabData[] = [];
	private _activeTabKind: ChatWorkingSetTabKind | undefined;
	private _contentVisible = false;

	constructor() {
		super();
		this.domNode = $('div.chat-working-set-tabs');
	}

	get activeTab(): ChatWorkingSetTabKind | undefined {
		return this._activeTabKind;
	}

	setContentVisible(visible: boolean): void {
		if (this._contentVisible !== visible) {
			this._contentVisible = visible;
			this.domNode.classList.toggle('content-hidden', !visible);
		}
	}

	setActiveTab(kind: ChatWorkingSetTabKind): void {
		if (this._activeTabs.some(t => t.kind === kind)) {
			this._activeTabKind = kind;
			this._rebuild();
			this._onDidSelect.fire(kind);
		}
	}

	setTabData(tabs: IChatWorkingSetTabData[]): void {
		this._tabs = tabs;
		this._rebuild();
	}

	private _rebuild(): void {
		this._radioDisposables.clear();
		this.domNode.replaceChildren();

		this._activeTabs = this._tabs.filter(t => t.count > 0);
		if (this._activeTabs.length === 0) {
			this._activeTabKind = undefined;
			return;
		}

		// If the current active tab is no longer present, switch to the first available
		const stillActive = this._activeTabKind !== undefined
			&& this._activeTabs.some(t => t.kind === this._activeTabKind);
		if (!stillActive) {
			this._activeTabKind = this._activeTabs[0].kind;
		}

		const items: IRadioOptionItem[] = this._activeTabs.map(tab => ({
			text: this._formatLabel(tab),
			labelElement: this._createLabelElement(tab),
			tooltip: this._formatTooltip(tab),
			isActive: tab.kind === this._activeTabKind,
		}));

		const radio = this._radioDisposables.add(new Radio({ items }));
		this._radioDisposables.add(radio.onDidSelect(index => {
			const selected = this._activeTabs[index];
			if (selected && selected.kind !== this._activeTabKind) {
				this._activeTabKind = selected.kind;
				this._onDidSelect.fire(selected.kind);
			}
		}));
		this._radioDisposables.add(radio.onDidClickActive(index => {
			const selected = this._activeTabs[index];
			if (selected) {
				this._onDidToggle.fire(selected.kind);
			}
		}));
		append(this.domNode, radio.domNode);
	}

	private _formatLabel(tab: IChatWorkingSetTabData): string {
		switch (tab.kind) {
			case ChatWorkingSetTabKind.Messages:
				return `$(comment-discussion) ${tab.count}`;
			case ChatWorkingSetTabKind.Files:
				if (tab.diffStats) {
					return `$(diff) +${tab.diffStats.added} -${tab.diffStats.removed}`;
				}
				return `$(files) ${tab.count}`;
			case ChatWorkingSetTabKind.Todos:
				if (tab.diffStats) {
					return `$(record) ${tab.diffStats.added}/${tab.count}`;
				}
				return `$(checklist) ${tab.count}`;
			case ChatWorkingSetTabKind.Questions:
				return `$(question) ${tab.count}`;
		}
	}

	private _createLabelElement(tab: IChatWorkingSetTabData): HTMLElement | undefined {
		if (tab.kind === ChatWorkingSetTabKind.Files && tab.diffStats) {
			const container = $('span.chat-tab-label');
			const icon = $('span' + ThemeIcon.asCSSSelector(Codicon.diffMultiple));
			icon.style.marginRight = '4px';
			append(container, icon);
			const added = $('span.chat-tab-diff-added');
			added.textContent = `+${tab.diffStats.added}`;
			append(container, added);
			const spacer = $('span');
			spacer.textContent = ' ';
			append(container, spacer);
			const removed = $('span.chat-tab-diff-removed');
			removed.textContent = `-${tab.diffStats.removed}`;
			append(container, removed);
			return container;
		}
		if (tab.kind === ChatWorkingSetTabKind.Todos && tab.diffStats) {
			const container = $('span.chat-tab-label');
			const icon = $('span' + ThemeIcon.asCSSSelector(Codicon.record));
			icon.style.marginRight = '4px';
			icon.style.color = 'var(--vscode-charts-blue)';
			append(container, icon);
			const text = $('span');
			text.textContent = `${tab.diffStats.added}/${tab.count}`;
			append(container, text);
			return container;
		}
		return undefined;
	}

	private _formatTooltip(tab: IChatWorkingSetTabData): string {
		switch (tab.kind) {
			case ChatWorkingSetTabKind.Messages:
				return localize('chatWorkingSetTabs.messages', "Messages ({0})", tab.count);
			case ChatWorkingSetTabKind.Files:
				if (tab.diffStats) {
					return localize('chatWorkingSetTabs.filesWithDiff', "Files (+{0} -{1})", tab.diffStats.added, tab.diffStats.removed);
				}
				return localize('chatWorkingSetTabs.files', "Files ({0})", tab.count);
			case ChatWorkingSetTabKind.Todos:
				if (tab.diffStats) {
					return localize('chatWorkingSetTabs.todosProgress', "Todos ({0}/{1})", tab.diffStats.added, tab.count);
				}
				return localize('chatWorkingSetTabs.todos', "Todos ({0})", tab.count);
			case ChatWorkingSetTabKind.Questions:
				return localize('chatWorkingSetTabs.questions', "Questions ({0})", tab.count);
		}
	}
}
