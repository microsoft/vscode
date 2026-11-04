/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { IGitHubService, IGitHubSessionPullRequestObservables } from '../../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { FIX_CI_CHECKS_COMMAND_ID } from '../../browser/checksActions.js';

suite('Fix Checks', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sends the fix to the widget of the chat its session shows, not to the widget of its main chat', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const ciModel = new class extends mock<GitHubPullRequestCIModel>() {
			// No failed check yet: the action stops after finding the widget.
			override readonly requiredChecks = constObservable(undefined);
		}();
		instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
			override getSessionPullRequest(): IGitHubSessionPullRequestObservables {
				return new class extends mock<IGitHubSessionPullRequestObservables>() {
					override readonly pullRequestCIObs = constObservable(ciModel);
				}();
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
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = 'session';
			override readonly resource = sessionResource;
			override readonly activeChat = constObservable(new class extends mock<IChat>() {
				override readonly resource = secondChat;
			}());
		}();

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(FIX_CI_CHECKS_COMMAND_ID)!.handler(accessor, session));

		assert.deepStrictEqual(lookups, [secondChat.toString()]);
	});
});
