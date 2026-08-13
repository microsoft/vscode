/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../../../platform/opener/common/opener.js';
import { IResourceMultiDiffEditorInput } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import '../../../../browser/widgetHosts/viewPane/chatViewTitleControl.js';

const viewChangesActionId = 'workbench.action.chat.viewAgentSessionChanges';
const openPullRequestActionId = 'workbench.action.chat.openAgentSessionPullRequest';
const viewAllChangesCommandId = 'chatEditing.viewAllSessionChanges';

suite('ChatViewTitleControl', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens Changes in the multi-diff editor even when an external command is registered', async () => {
		const sessionResource = URI.parse('test-session:/session');
		const session = new class extends mock<IAgentSession>() {
			override readonly resource = sessionResource;
			override readonly providerType = 'test-session';
			override readonly label = 'Fix issue';
			override readonly changes = [{
				modifiedUri: URI.file('/workspace/modified.ts'),
				insertions: 1,
				deletions: 0,
			}];
		};
		let externalCommandRuns = 0;
		const opened: IResourceMultiDiffEditorInput[] = [];
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override readonly onDidChangeSessionArchivedState = Event.None;
			override getSession(): IAgentSession {
				return session;
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened.push(args[0] as IResourceMultiDiffEditorInput);
				return undefined;
			}
		});
		disposables.add(CommandsRegistry.registerCommand(viewAllChangesCommandId, () => {
			externalCommandRuns++;
		}));

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(viewChangesActionId)!.handler(accessor, { sessionResource }));

		assert.deepStrictEqual({ externalCommandRuns, opened }, {
			externalCommandRuns: 0,
			opened: [{
				multiDiffSource: URI.from({
					scheme: 'agent-session-changes',
					path: '/',
					query: encodeURIComponent(sessionResource.toString()),
				}),
				label: 'Fix issue - All Changes',
			}],
		});
	});

	test('always opens the linked pull request externally', async () => {
		const sessionResource = URI.parse('test-session:/session');
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/42');
		const session = new class extends mock<IAgentSession>() {
			override readonly metadata = { pullRequestUrl: pullRequestUri.toString() };
		};
		const opened: { readonly resource: string; readonly options: OpenInternalOptions | OpenExternalOptions | undefined }[] = [];
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override readonly onDidChangeSessionArchivedState = Event.None;
			override getSession(): IAgentSession {
				return session;
			}
		});
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened.push({
					resource: resource.toString(),
					options,
				});
				return true;
			}
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(openPullRequestActionId)!.handler(accessor, { sessionResource }));

		assert.deepStrictEqual(opened, [{
			resource: pullRequestUri.toString(),
			options: { openExternal: true },
		}]);
	});
});
