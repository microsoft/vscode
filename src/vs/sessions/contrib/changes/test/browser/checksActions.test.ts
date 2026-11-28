/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { IChangesSessionObservables, IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import type { IChangesRepository } from '../../../../../workbench/contrib/sessions/common/changesRepositories.js';
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IGitHubService, IGitHubSessionPullRequestObservables } from '../../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { FIX_CI_CHECKS_COMMAND_ID } from '../../browser/checksActions.js';
import { ITestSessionsService, ITestSessionWithChat, stubSessionHostsFromSessionsService } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionHostService, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';

suite('Fix Checks', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(selectedRepository?: IChangesRepository) {
		const instantiationService = store.add(new TestInstantiationService());
		const ciModel = new class extends mock<GitHubPullRequestCIModel>() {
			// No failed check yet: the action stops after finding the widget.
			override readonly requiredChecks = constObservable(undefined);
		}();
		const requestedRepositories: (string | undefined)[] = [];
		instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
			override getSessionPullRequest(_session: IObservable<ISession | undefined>, repositoryObs?: IObservable<IChangesRepository | undefined>): IGitHubSessionPullRequestObservables {
				requestedRepositories.push(repositoryObs?.get()?.root.path);
				return new class extends mock<IGitHubSessionPullRequestObservables>() {
					override readonly pullRequestCIObs = constObservable(ciModel);
				}();
			}
		}());
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override getSessionChanges(): IChangesSessionObservables {
				return upcastPartial<IChangesSessionObservables>({ repositoryObs: constObservable(selectedRepository) });
			}
		}());
		const lookups: string[] = [];
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
			override getWidgetBySessionResource(resource: URI): IChatWidget {
				lookups.push(resource.toString());
				return new class extends mock<IChatWidget>() { }();
			}
		}());
		instantiationService.stub(ILogService, new NullLogService());

		const sessionResource = URI.parse('local-agent-host:/session');
		const secondChat = URI.parse('local-agent-host-chat:/session/second');
		// A session that shows its second chat, such as in a window of its own.
		const session = new class extends mock<ITestSessionWithChat>() {
			override readonly sessionId = 'session';
			override readonly resource = sessionResource;
			override readonly mainChat = constObservable(new class extends mock<IChat>() {
				override readonly resource = sessionResource;
				override readonly title = constObservable('main');
			}());
			override readonly activeChat = constObservable(new class extends mock<IChat>() {
				override readonly resource = secondChat;
			}());
		}();
		// The main window, which has focus, shows another session
		const otherResource = URI.parse('local-agent-host:/other');
		const other = new class extends mock<ITestSessionWithChat>() {
			override readonly sessionId = 'other';
			override readonly resource = otherResource;
			override readonly mainChat = constObservable(new class extends mock<IChat>() {
				override readonly resource = otherResource;
			}());
			override readonly activeChat = this.mainChat;
		}();
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({ windowSessions: constObservable([session]), mainWindowActiveSession: constObservable(other) }));
		stubSessionHostsFromSessionsService(instantiationService);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => resource.toString() === sessionResource.toString() ? { session, chat: session.mainChat.get() } : undefined,
		}));
		const handler = CommandsRegistry.getCommand(FIX_CI_CHECKS_COMMAND_ID)!.handler;
		const run = () => instantiationService.invokeFunction(accessor => handler(accessor, session));
		// As the Changes header of the session's window runs it: no session, the header's host
		const runFromHeader = () => instantiationService.invokeFunction(accessor => {
			const windowHost = accessor.get(ISessionHostService).hosts.get().find(host => host.kind === SessionHostKind.ChatWindow)!;
			return handler(accessor, undefined, undefined, { sessionHostId: windowHost.id });
		});
		// As the Changes editor of the session's main chat runs it in that window, which shows the second chat
		const runFromEditorOfMainChat = () => instantiationService.invokeFunction(accessor => {
			const windowHost = accessor.get(ISessionHostService).hosts.get().find(host => host.kind === SessionHostKind.ChatWindow)!;
			return handler(accessor, { session, chat: session.mainChat.get() }, undefined, { sessionHostId: windowHost.id });
		});
		return { run, runFromHeader, runFromEditorOfMainChat, lookups, requestedRepositories, secondChat, sessionResource };
	}

	test('sends the fix to the widget of the chat its session shows, not to the widget of its main chat', async () => {
		const harness = createHarness();
		await harness.run();
		assert.deepStrictEqual(harness.lookups, [harness.secondChat.toString()]);
	});

	test('from a Changes header, fixes the checks of the session of the header\'s window, not of the focused window', async () => {
		const harness = createHarness();
		await harness.runFromHeader();
		assert.deepStrictEqual(harness.lookups, [harness.secondChat.toString()]);
	});

	test('from a Changes editor of a chat its window does not show, fixes the checks of that chat', async () => {
		const harness = createHarness();
		await harness.runFromEditorOfMainChat();
		assert.deepStrictEqual(harness.lookups, [harness.sessionResource.toString()]);
	});

	test('fixes the checks of the repository the session\'s Changes show', async () => {
		const selected = upcastPartial<IChangesRepository>({ root: URI.file('/work/web') });
		const withRepository = createHarness(selected);
		await withRepository.run();
		const withoutRepository = createHarness();
		await withoutRepository.run();
		assert.deepStrictEqual({ selected: withRepository.requestedRepositories, all: withoutRepository.requestedRepositories }, { selected: ['/work/web'], all: [undefined] });
	});
});
