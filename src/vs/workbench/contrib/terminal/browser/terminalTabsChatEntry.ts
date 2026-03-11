/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { $ } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ITerminalChatService, ITerminalService } from './terminal.js';
import * as dom from '../../../../base/browser/dom.js';

export class TerminalTabsChatEntry extends Disposable {

	private readonly _entry: HTMLElement;
	private readonly _label: HTMLElement;
	private readonly _deleteButton: HTMLElement;

	override dispose(): void {
		this._entry.remove();
		this._label.remove();
		this._deleteButton.remove();
		super.dispose();
	}

	constructor(
		container: HTMLElement,
		private readonly _tabContainer: HTMLElement,
		@ICommandService private readonly _commandService: ICommandService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		this._entry = dom.append(container, $('.terminal-tabs-chat-entry'));
		this._entry.tabIndex = 0;
		this._entry.setAttribute('role', 'button');

		const entry = dom.append(this._entry, $('.terminal-tabs-entry'));
		const icon = dom.append(entry, $('.terminal-tabs-chat-entry-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussionSparkle));
		this._label = dom.append(entry, $('.terminal-tabs-chat-entry-label'));

		// Add delete button (right-aligned via CSS margin-left: auto)
		this._deleteButton = dom.append(entry, $('.terminal-tabs-chat-entry-delete'));
		this._deleteButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.trashcan));
		this._deleteButton.tabIndex = 0;
		this._deleteButton.setAttribute('role', 'button');
		this._deleteButton.setAttribute('aria-label', localize('terminal.tabs.chatEntryDeleteAriaLabel', "Kill all hidden chat terminals"));
		this._deleteButton.setAttribute('title', localize('terminal.tabs.chatEntryDeleteTooltip', "Kill all hidden chat terminals"));

		const runChatTerminalsCommand = () => {
			void this._commandService.executeCommand('workbench.action.terminal.chat.viewHiddenChatTerminals');
		};
		this._register(dom.addDisposableListener(this._entry, dom.EventType.CLICK, e => {
			// Don't trigger if clicking on the delete button
			if (e.target === this._deleteButton || this._deleteButton.contains(e.target as Node)) {
				return;
			}
			e.preventDefault();
			runChatTerminalsCommand();
		}));
		this._register(dom.addDisposableListener(this._entry, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				runChatTerminalsCommand();
			}
		}));

		// Delete button click handler
		this._register(dom.addDisposableListener(this._deleteButton, dom.EventType.CLICK, async (e) => {
			e.preventDefault();
			e.stopPropagation();
			await this._deleteAllHiddenTerminals();
		}));

		// Delete button keyboard handler
		this._register(dom.addDisposableListener(this._deleteButton, dom.EventType.KEY_DOWN, async (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				await this._deleteAllHiddenTerminals();
			}
		}));

		this.update();
	}

	private async _deleteAllHiddenTerminals(): Promise<void> {
		const hiddenTerminals = this._terminalChatService.getToolSessionTerminalInstances(true);
		await Promise.all(hiddenTerminals.map(terminal => this._terminalService.safeDisposeTerminal(terminal)));
	}

	get element(): HTMLElement {
		return this._entry;
	}

	update(): void {
		const hiddenChatTerminalCount = this._terminalChatService.getToolSessionTerminalInstances(true).length;
		if (hiddenChatTerminalCount <= 0) {
			this._entry.style.display = 'none';
			this._label.textContent = '';
			this._entry.removeAttribute('aria-label');
			this._entry.removeAttribute('title');

			return;
		}

		this._entry.style.display = '';
		const tooltip = localize('terminal.tabs.chatEntryTooltip', "Show hidden chat terminals");
		this._entry.setAttribute('title', tooltip);
		const hasText = this._tabContainer.classList.contains('has-text');
		if (hasText) {
			this._label.textContent = hiddenChatTerminalCount === 1
				? localize('terminal.tabs.chatEntryLabelSingle', "{0} Hidden Terminal", hiddenChatTerminalCount)
				: localize('terminal.tabs.chatEntryLabelPlural', "{0} Hidden Terminals", hiddenChatTerminalCount);
		} else {
			this._label.textContent = `${hiddenChatTerminalCount}`;
		}

		const ariaLabel = hiddenChatTerminalCount === 1
			? localize('terminal.tabs.chatEntryAriaLabelSingle', "Show 1 hidden chat terminal")
			: localize('terminal.tabs.chatEntryAriaLabelPlural', "Show {0} hidden chat terminals", hiddenChatTerminalCount);
		this._entry.setAttribute('aria-label', ariaLabel);
	}
}
