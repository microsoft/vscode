/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getUntitledSessionTitle, ISession } from '../../../services/sessions/common/session.js';

class ShowSessionDetailsAction extends Action2 {

	static readonly ID = 'sessions.showSessionDetails';

	constructor() {
		super({
			id: ShowSessionDetailsAction.ID,
			title: localize2('sessions.showSessionDetails', "Show Session Details"),
			category: Categories.Developer,
			f1: true,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const contents = formatSessionDetails(accessor.get(ISessionsManagementService).getSessions());
		const resource = URI.from({
			scheme: Schemas.untitled,
			path: localize('sessions.details.editorTitle', "Session Details"),
			query: generateUuid(),
		});
		await accessor.get(IEditorService).openEditor({
			resource,
			contents,
			languageId: 'plaintext',
			options: { pinned: true },
		});
	}
}

registerAction2(ShowSessionDetailsAction);

export function formatSessionDetails(allSessions: readonly ISession[]): string {
	const sessions = allSessions.filter(session => !session.isArchived.get() && !(session.isAutomation?.get() ?? false));
	const lines = ['Session Details', ''];

	if (sessions.length === 0) {
		lines.push('No non-archived user sessions.');
		return `${lines.join('\n')}\n`;
	}

	for (const [index, session] of sessions.entries()) {
		const title = session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false);
		const workingDirectories = session.workspace.get()?.folders.map(folder => formatWorkingDirectory(folder.workingDirectory)) ?? [];

		lines.push(`Session: ${title.replace(/\r\n?|\n/g, ' ')}`);
		if (workingDirectories.length === 0) {
			lines.push('Working directory: (none)');
		} else {
			for (const workingDirectory of workingDirectories) {
				lines.push(`Working directory: ${workingDirectory}`);
			}
		}
		lines.push(`Resource: ${session.resource.toString(true)}`);
		if (index < sessions.length - 1) {
			lines.push('');
		}
	}

	return `${lines.join('\n')}\n`;
}

function formatWorkingDirectory(resource: URI): string {
	return resource.scheme === Schemas.file ? resource.fsPath : resource.toString(true);
}
