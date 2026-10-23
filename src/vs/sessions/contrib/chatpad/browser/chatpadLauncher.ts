/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ChatWindowDockedOpenContext } from '../../../services/chatWindow/browser/chatWindowService.js';
import { OPEN_CHATPAD_COMMAND_ID, ChatpadEnabledContext } from './chatpad.js';
import './media/chatpadLauncher.css';

/** Shows the launcher wherever Open Chatpad can run, except in the phone layout and while a docked chat window covers it. */
const ChatpadLauncherVisibleContext = ContextKeyExpr.and(ChatpadEnabledContext, IsPhoneLayoutContext.negate(), ChatWindowDockedOpenContext.negate());

/** A floating button in the bottom right corner of the Agents window that opens the Chatpad. */
export class ChatpadLauncherContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.chatpadLauncher';

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		const label = localize('chatpadLauncher', "Open Chatpad");
		const button = dom.append(layoutService.mainContainer, dom.$('button.chatpad-launcher', { type: 'button' }, dom.$(`span${ThemeIcon.asCSSSelector(Codicon.note)}`, { 'aria-hidden': 'true' })));
		this._register(toDisposable(() => button.remove()));

		const updateLabel = () => button.setAttribute('aria-label', keybindingService.appendKeybinding(label, OPEN_CHATPAD_COMMAND_ID));
		updateLabel();
		this._register(keybindingService.onDidUpdateKeybindings(updateLabel));
		this._register(hoverService.setupDelayedHover(button, () => ({ content: keybindingService.appendKeybinding(label, OPEN_CHATPAD_COMMAND_ID) }), { setupKeyboardEvents: true }));
		this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => commandService.executeCommand(OPEN_CHATPAD_COMMAND_ID)));

		const updateVisibility = () => button.classList.toggle('hidden', !contextKeyService.contextMatchesRules(ChatpadLauncherVisibleContext));
		updateVisibility();
		const keys = new Set(ChatpadLauncherVisibleContext?.keys());
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(keys)) {
				updateVisibility();
			}
		}));
	}
}
