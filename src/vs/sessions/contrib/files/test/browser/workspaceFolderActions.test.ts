/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IView } from '../../../../../workbench/common/views.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { OpenFilesViewAction } from '../../browser/workspaceFolderActions.js';
import { SESSIONS_FILES_VIEW_ID } from '../../browser/filesView.js';

suite('Sessions - Workspace Folder Actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('folder pill opens the managed Files editor and Files view in single-pane layout', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		const commandCalls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];
		const viewCalls: { readonly id: string; readonly focus: boolean | undefined }[] = [];
		const session = new class extends mock<IActiveSession>() {
			override readonly resource = URI.parse('test-session://folder-pill');
			override readonly workspace = constObservable(undefined);
		};

		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(session);
		});
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly isSinglePaneLayoutEnabled = true;
		});
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				calls.push('openFilesEditor');
				commandCalls.push({ commandId, args });
				return undefined;
			}
		});
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override async openView<T extends IView>(id: string, focus?: boolean): Promise<T | null> {
				calls.push('openFilesView');
				viewCalls.push({ id, focus });
				return null;
			}
		});

		await new OpenFilesViewAction().run(instantiationService, session);

		assert.deepStrictEqual({
			calls,
			commandCalls: commandCalls.map(call => ({
				commandId: call.commandId,
				args: call.args
			})),
			viewCalls
		}, {
			calls: ['openFilesEditor', 'openFilesView'],
			commandCalls: [{
				commandId: NEW_FILE_TAB_COMMAND_ID,
				args: []
			}],
			viewCalls: [{
				id: SESSIONS_FILES_VIEW_ID,
				focus: false
			}]
		});
	});
});
