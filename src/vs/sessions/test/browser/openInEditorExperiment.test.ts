/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ILogService, NullLogService } from '../../../platform/log/common/log.js';
import { TestExperimentTriggerTelemetryService } from '../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkbenchAssignmentService } from '../../../workbench/services/assignment/common/assignmentService.js';
import { HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT, OpenInEditorAvailableContext, OpenInEditorExperimentContribution, OpenInEditorTitleBarContext } from '../../browser/openInEditorExperiment.js';
import { IsQuickChatSessionContext, SessionHasWorkspaceContext, SessionsHideOpenInEditorForFolderlessSessionsContext, SessionsWelcomeVisibleContext } from '../../common/contextkeys.js';

suite('Open in Editor experiment', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('hides Open in Editor for folderless sessions only while the treatment is assigned', async () => {
		const assignmentsChanged = disposables.add(new Emitter<void>());
		const treatments: string[] = [];
		const warnings: string[] = [];
		const state: { treatment?: boolean; fail: boolean } = { fail: false };
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(new OpenInEditorExperimentContribution(
			contextKeyService,
			createAssignmentService(assignmentsChanged.event, async name => {
				treatments.push(name);
				if (state.fail) {
					throw new Error('Treatment failed');
				}
				return state.treatment;
			}),
			new TestExperimentTriggerTelemetryService(),
			new class extends mock<ILogService>() {
				override warn(message: string): void {
					warnings.push(message);
				}
			},
		));
		const hidden = () => SessionsHideOpenInEditorForFolderlessSessionsContext.getValue(contextKeyService);
		const refetch = async (update: Partial<typeof state>) => {
			Object.assign(state, update);
			assignmentsChanged.fire();
			await timeout(0);
			return hidden();
		};

		const initial = hidden();
		await timeout(0);
		const unassigned = hidden();
		const control = await refetch({ treatment: false });
		const treatment = await refetch({ treatment: true });
		const failed = await refetch({ fail: true });

		assert.deepStrictEqual({ treatments, initial, unassigned, control, treatment, failed, warnings }, {
			treatments: Array(4).fill(HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT),
			initial: false,
			unassigned: false,
			control: false,
			treatment: true,
			failed: false,
			warnings: ['[OpenInEditorExperimentContribution] Failed to resolve the folderless Open in Editor treatment; showing Open in Editor.'],
		});
	});

	test('logs the experiment trigger in every arm only for folderless quick chats, not while the window starts', async () => {
		const run = async (assignedTreatment: boolean | undefined) => {
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const quickChat = IsQuickChatSessionContext.bindTo(contextKeyService);
			const hasWorkspace = SessionHasWorkspaceContext.bindTo(contextKeyService);
			const welcomeVisible = SessionsWelcomeVisibleContext.bindTo(contextKeyService);
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const treatmentRequest = new DeferredPromise<boolean | undefined>();
			disposables.add(new OpenInEditorExperimentContribution(contextKeyService, createAssignmentService(Event.None, () => treatmentRequest.p), telemetryService, new NullLogService()));
			const state = () => ({
				triggers: [...telemetryService.triggers],
				shown: contextKeyService.contextMatchesRules(ContextKeyExpr.and(OpenInEditorTitleBarContext, OpenInEditorAvailableContext)),
			});

			// A folderless quick chat is restored before the treatment resolves.
			quickChat.set(true);
			const beforeTreatment = state();
			// The treatment resolves while the window starts, before any session is active.
			quickChat.set(false);
			await treatmentRequest.complete(assignedTreatment);
			await timeout(0);
			const startup = state();
			hasWorkspace.set(true);
			const workspace = state();
			// A session that isn't a quick chat, while its workspace is still loading.
			hasWorkspace.set(false);
			const workspaceLoading = state();
			welcomeVisible.set(true);
			quickChat.set(true);
			const quickChatBehindWelcome = state();
			welcomeVisible.set(false);
			const folderlessQuickChat = state();
			quickChat.set(false);
			quickChat.set(true);
			return { beforeTreatment, startup, workspace, workspaceLoading, quickChatBehindWelcome, folderlessQuickChat, folderlessQuickChatAgain: state() };
		};
		const expected = (hidesFolderlessQuickChats: boolean) => {
			const untriggered = { triggers: [], shown: true };
			const triggered = { triggers: [HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT], shown: !hidesFolderlessQuickChats };
			return {
				beforeTreatment: untriggered,
				startup: untriggered,
				workspace: untriggered,
				workspaceLoading: untriggered,
				quickChatBehindWelcome: { triggers: [], shown: false },
				folderlessQuickChat: triggered,
				folderlessQuickChatAgain: triggered,
			};
		};

		assert.deepStrictEqual({
			unassigned: await run(undefined),
			control: await run(false),
			treatment: await run(true),
		}, {
			unassigned: expected(false),
			control: expected(false),
			treatment: expected(true),
		});
	});
});

function createAssignmentService(onDidRefetchAssignments: Event<void>, getTreatment: (name: string) => Promise<boolean | undefined>): IWorkbenchAssignmentService {
	return new class extends mock<IWorkbenchAssignmentService>() {
		override readonly onDidRefetchAssignments = onDidRefetchAssignments;
		override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
			return await getTreatment(name) as T | undefined;
		}
	}();
}
