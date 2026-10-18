/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ICreateNewSessionOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { NewChatInSessionsWindowAction } from '../../browser/newSessionAction.js';

suite('NewChatInSessionsWindowAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse(`${SessionType.AgentHostCopilot}:/new-session`);

	function createCommand(options: { active?: boolean; available?: boolean; creationFailed?: boolean } = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const opened: { target: ICreateNewSessionOptions | undefined; preserveNavigation: boolean | undefined }[] = [];
		let navigations = 0;
		instantiationService.stub(INewSessionComposerService, {
			notifyUserNavigation: () => { navigations++; },
		});
		instantiationService.stub(ISessionsManagementService, {
			isQuickChatTargetAvailable: () => options.available ?? true,
		});
		instantiationService.stub(ISessionsService, {
			activeSession: constObservable(options.active ? upcastPartial<IActiveSession>({
				providerId: 'other-provider',
				sessionType: 'other-agent',
			}) : undefined),
			openQuickChat: (target, preserveNavigation) => {
				opened.push({ target, preserveNavigation });
				return options.creationFailed ? undefined : upcastPartial<IActiveSession>({ resource });
			},
		});
		if (!CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID)) {
			store.add(registerAction2(NewChatInSessionsWindowAction));
		}
		const command = CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID);
		assert.ok(command);
		return {
			opened,
			get navigations() { return navigations; },
			run: (args: INewSessionInAgentsWindowOptions) => instantiationService.invokeFunction(command.handler, args),
		};
	}

	test('reuses an already registered New Session command', async () => {
		createCommand();
		const command = CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID);
		const fixture = createCommand();
		assert.deepStrictEqual({
			commandUnchanged: CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID) === command,
			result: await fixture.run({ noWorkspace: true }),
			opened: fixture.opened,
		}, {
			commandUnchanged: true,
			result: resource,
			opened: [{ target: undefined, preserveNavigation: true }],
		});
	});

	test('the registered command returns the explicitly requested local Copilot session', async () => {
		const fixture = createCommand({ active: true });
		const result = await fixture.run({ noWorkspace: true, agentHostProvider: 'copilotcli' });
		assert.deepStrictEqual({ result, opened: fixture.opened, navigations: fixture.navigations }, {
			result: resource,
			opened: [{ target: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }, preserveNavigation: true }],
			navigations: 1,
		});
	});

	test('keeps inheriting the active target for ordinary workspace-less sessions', async () => {
		const fixture = createCommand({ active: true });
		await fixture.run({ noWorkspace: true });
		assert.deepStrictEqual(fixture.opened, [{
			target: { providerId: 'other-provider', sessionTypeId: 'other-agent' },
			preserveNavigation: true,
		}]);
	});

	test('keeps default target selection when there is no active session', async () => {
		const fixture = createCommand();
		await fixture.run({ noWorkspace: true });
		assert.deepStrictEqual(fixture.opened, [{ target: undefined, preserveNavigation: true }]);
	});

	test('does not fall back to another provider when the explicit target is unavailable', async () => {
		const fixture = createCommand({ available: false, active: true });
		await assert.rejects(async () => fixture.run({ noWorkspace: true, agentHostProvider: 'copilotcli' }), /unavailable/);
		assert.deepStrictEqual(fixture.opened, []);
	});

	test('surfaces failure to create an explicitly targeted session', async () => {
		const fixture = createCommand({ creationFailed: true });
		await assert.rejects(async () => fixture.run({ noWorkspace: true, agentHostProvider: 'copilotcli' }), /Could not create a session/);
	});
});
