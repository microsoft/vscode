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
import { ITerminalChatService } from './terminal.js';
import * as dom from '../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

export class TerminalTabsChatEntry extends Disposable {

	private readonly _entry: HTMLElement;
	private readonly _label: HTMLElement;

	override dispose(): void {
		this._entry.remove();
		this._label.remove();
		super.dispose();
	}

	constructor(
		container: HTMLElement,
		private readonly _tabContainer: HTMLElement,
		@ICommandService private readonly _commandService: ICommandService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._entry = dom.append(container, $('.terminal-tabs-chat-entry'));
		this._entry.tabIndex = 0;
		this._entry.setAttribute('role', 'button');

		const entry = dom.append(this._entry, $('.terminal-tabs-entry'));
		const icon = dom.append(entry, $('.terminal-tabs-chat-entry-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussionSparkle));
		this._label = dom.append(entry, $('.terminal-tabs-chat-entry-label'));

		const runChatTerminalsCommand = () => {
			void this._commandService.executeCommand('workbench.action.terminal.chat.viewChatTerminals');
		};
		this._register(dom.addDisposableListener(this._entry, dom.EventType.CLICK, e => {
			e.preventDefault();
			runChatTerminalsCommand();
		}));
		this._register(dom.addDisposableListener(this._entry, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				runChatTerminalsCommand();
			}
		}));
	}

	get element(): HTMLElement {
		return this._entry;
	}

	update(): void {
		const chatTerminalCount = this._terminalChatService.getToolSessionTerminalInstances().length;

		if (!this._contextKeyService.getContextKeyValue<boolean>('hasHiddenChatTerminals')) {
			this._entry.style.display = 'none';
			this._label.textContent = '';
			this._entry.removeAttribute('aria-label');

			return;
		}

		this._entry.style.display = '';
		const hasText = this._tabContainer.classList.contains('has-text');
		if (hasText) {
			this._label.textContent = chatTerminalCount === 1
				? localize('terminal.tabs.chatEntryLabelSingle', "{0} Chat Terminal", chatTerminalCount)
				: localize('terminal.tabs.chatEntryLabelPlural', "{0} Chat Terminals", chatTerminalCount);
		} else {
			this._label.textContent = `${chatTerminalCount}`;
		}

		const ariaLabel = chatTerminalCount === 1
			? localize('terminal.tabs.chatEntryAriaLabelSingle', "Show 1 chat terminal")
			: localize('terminal.tabs.chatEntryAriaLabelPlural', "Show {0} chat terminals", chatTerminalCount);
		this._entry.setAttribute('aria-label', ariaLabel);
	}
}
