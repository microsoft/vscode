/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INativeHostService } from '../../../../../../platform/native/common/native.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { ILifecycleService, InternalBeforeShutdownEvent, ShutdownReason } from '../../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { LocalAgentHostLifecycleContribution } from '../../electron-browser/localAgentHostLifecycle.contribution.js';

suite('Local Agent Host Lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(status: SessionStatus, archived = false): ISession {
		return upcastPartial<ISession>({
			status: constObservable(status),
			isArchived: constObservable(archived),
		});
	}

	async function runShutdown(
		sessions: readonly ISession[],
		confirmed: boolean,
		reason = ShutdownReason.QUIT,
		windowCount = 1,
		inFlightSessions: readonly ISession[] = [],
	): Promise<{ readonly confirmations: number; readonly vetoes: readonly boolean[] }> {
		const lifecycleService = store.add(new TestLifecycleService());
		const instantiationService = store.add(new TestInstantiationService());
		const provider = upcastPartial<ISessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID,
			getSessions: () => [...sessions],
		});
		let confirmations = 0;

		instantiationService.stub(ILifecycleService, lifecycleService);
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>(providerId: string) => providerId === LOCAL_AGENT_HOST_PROVIDER_ID ? provider as T : undefined,
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getInFlightNewSessionRequests: () => inFlightSessions,
		}));
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			confirm: async () => {
				confirmations++;
				return { confirmed };
			},
		}));
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
			getWindowCount: async () => windowCount,
		}));
		instantiationService.stub(INativeWorkbenchEnvironmentService, upcastPartial<INativeWorkbenchEnvironmentService>({
			enableSmokeTestDriver: false,
		}));
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
			sentiment: {},
		}));
		store.add(instantiationService.createInstance(LocalAgentHostLifecycleContribution));

		const vetoes: Promise<boolean>[] = [];
		lifecycleService.fireBeforeShutdown(upcastPartial<InternalBeforeShutdownEvent>({
			reason,
			veto: value => vetoes.push(Promise.resolve(value)),
		}));

		const resolvedVetoes = await Promise.all(vetoes);
		return { confirmations, vetoes: resolvedVetoes };
	}

	test('prompts for active local Agent Host sessions', async () => {
		assert.deepStrictEqual({
			inProgressConfirmed: await runShutdown([createSession(SessionStatus.InProgress)], true),
			needsInputCancelled: await runShutdown([createSession(SessionStatus.NeedsInput)], false),
		}, {
			inProgressConfirmed: { confirmations: 1, vetoes: [false] },
			needsInputCancelled: { confirmations: 1, vetoes: [true] },
		});
	});

	test('prompts for an in-flight request before it enters the provider catalog', async () => {
		const draft = upcastPartial<ISession>({
			...createSession(SessionStatus.InProgress),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
		});

		assert.deepStrictEqual(await runShutdown([], true, ShutdownReason.QUIT, 1, [draft]), {
			confirmations: 1,
			vetoes: [false],
		});
	});

	(isMacintosh ? test.skip : test)('prompts only when closing the last Windows/Linux window', async () => {
		const activeSession = createSession(SessionStatus.InProgress);

		assert.deepStrictEqual({
			editorClosesFirst: await runShutdown([activeSession], true, ShutdownReason.CLOSE, 2),
			agentsClosesLast: await runShutdown([activeSession], true, ShutdownReason.CLOSE, 1),
		}, {
			editorClosesFirst: { confirmations: 0, vetoes: [false] },
			agentsClosesLast: { confirmations: 1, vetoes: [false] },
		});
	});

	test('does not prompt for inactive local Agent Host sessions', async () => {
		assert.deepStrictEqual({
			completed: await runShutdown([createSession(SessionStatus.Completed)], true),
			archived: await runShutdown([createSession(SessionStatus.InProgress, true)], true),
			empty: await runShutdown([], true),
		}, {
			completed: { confirmations: 0, vetoes: [false] },
			archived: { confirmations: 0, vetoes: [false] },
			empty: { confirmations: 0, vetoes: [false] },
		});
	});
});
