/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuItemAction, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { createScopedChangesPickerActionItem, VERSIONS_PICKER_ACTION_ID, VERSIONS_PICKER_TITLE } from '../../../sessionChanges/browser/changesView.js';
import { IChangesEditorScope } from '../../common/changesViewService.js';
import { Menus } from '../menus.js';

/**
 * The picker of the changesets of the Changes editor that the chats of the chat part of an editor window open, as the
 * Agents window has it: in the header row that the editor shows itself, as the editor groups of an editor window have
 * none to host it (see `ISessionsHostLayoutService.sessionEditorsShowOwnHeader`).
 */
export class AgentsChatPartChangesEditorHeader extends Disposable {

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// A command and menu item rather than an action: the command is the Agents window's (`VersionsPickerAction`), which
		// only the Agents window registers, though both may load together, as in tests
		this._register(CommandsRegistry.registerCommand(VERSIONS_PICKER_ACTION_ID, () => { /* The picker shows the changesets to pick from as it is clicked */ }));
		this._register(MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderPrimary, {
			command: { id: VERSIONS_PICKER_ACTION_ID, title: VERSIONS_PICKER_TITLE, precondition: ChatContextKeys.enabled },
			group: 'navigation',
			order: 1,
			when: ChatContextKeys.enabled,
		}));

		this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, VERSIONS_PICKER_ACTION_ID, (action, _options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			// Of the session whose changes the Changes editor shows, whichever session is active
			const scope = instantiationService.invokeFunction(accessor => accessor.get(IChangesEditorScope).scope);
			return scope ? createScopedChangesPickerActionItem(instantiationService, action, scope) : undefined;
		}));
	}
}
