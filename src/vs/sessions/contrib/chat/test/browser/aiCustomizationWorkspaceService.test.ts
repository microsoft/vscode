/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { SessionsAICustomizationWorkspaceService } from '../../browser/aiCustomizationWorkspaceService.js';
import { IChat, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('SessionsAICustomizationWorkspaceService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the repository label for virtual workspaces', () => {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const service = new SessionsAICustomizationWorkspaceService(
			upcastPartial<ISessionsService>({ activeSession }),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<ICommandService>({}),
			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
		);
		const labels = [service.activeProjectLabel.get()];

		activeSession.set(createActiveSession({
			uri: URI.file('/workspace'),
			label: 'workspace',
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
			}],
			icon: { id: 'folder' },
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		}), undefined);
		labels.push(service.activeProjectLabel.get());

		activeSession.set(createActiveSession({
			uri: URI.parse('github-remote-file://github/microsoft/vscode/HEAD'),
			label: 'microsoft/vscode',
			folders: [{
				root: URI.parse('github-remote-file://github/microsoft/vscode/HEAD'),
				workingDirectory: URI.parse('github-remote-file://github/microsoft/vscode/HEAD'),
				name: 'HEAD',
				description: undefined,
			}],
			icon: { id: 'repo' },
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		}), undefined);
		labels.push(service.activeProjectLabel.get());

		assert.deepStrictEqual(labels, [undefined, 'workspace', 'microsoft/vscode']);
	});
});

function createActiveSession(workspace: ISessionWorkspace): IActiveSession {
	const chat = upcastPartial<IChat>({ workspace: constObservable(workspace) });
	return upcastPartial<IActiveSession>({ activeChat: constObservable(chat) });
}
