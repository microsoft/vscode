/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { searchViewIcon } from '../../../../workbench/contrib/search/browser/searchIcons.js';
import { OpenEditorCommandId } from '../../../../workbench/contrib/searchEditor/browser/constants.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsEmptyStateActions } from '../../../browser/parts/sessionsEmptyStateActions.js';
import { SessionsEmptyStateLayout } from '../../../browser/parts/sessionsEmptyStateLayout.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../common/sessionCommands.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';

export class ChangesEmptyState extends Disposable {
	private readonly emptyStateLayout: SessionsEmptyStateLayout;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const content = append(container, $('.sessions-empty-state-content'));
		append(content, $('.sessions-empty-state-description')).textContent = localize('changes.empty', "No changed files");
		const actions = append(content, $('.changes-empty-state-actions'));
		this._register(instantiationService.createInstance(SessionsEmptyStateActions, actions, Menus.EmptyChangesActions, {
			ariaLabel: localize('changes.emptyActions', "Changes actions"),
			telemetrySource: 'changes.emptyState',
		}));
		this.emptyStateLayout = this._register(new SessionsEmptyStateLayout(container, [content], actions));
	}

	layout(): void {
		this.emptyStateLayout.layout();
	}
}

MenuRegistry.appendMenuItems([
	{
		id: Menus.EmptyChangesActions,
		item: {
			command: { id: NEW_FILE_TAB_COMMAND_ID, title: localize2('changes.openFiles', "Open Files"), icon: EmptyFileEditorInput.ICON },
			group: 'navigation',
			order: 1,
		},
	},
	{
		id: Menus.EmptyChangesActions,
		item: {
			command: { id: OpenEditorCommandId, title: localize2('changes.searchFiles', "Search in Files"), icon: searchViewIcon },
			group: 'navigation',
			order: 2,
		},
	},
]);
