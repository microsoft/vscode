/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IWorkspaceEditingService } from '../../../../../../services/workspaces/common/workspaceEditing.js';
import { AgentHostWorktreeFollowContribution } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeFollow.js';
// The setting the follow reads and logs its trigger for
import '../../../../browser/agentSessions/agentHost/agentHostWorktreeLocations.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../browser/chatViewHost.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';

suite('AgentHostWorktreeFollow', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const worktree = URI.file('/work/vscode.worktrees/feature');

	/** The follow in a window whose folder is at `at`, recording where it moves the folder and its experiment triggers. */
	function createFollow(options: { readonly enabled: boolean; readonly at?: URI; readonly canSetLocation?: boolean }) {
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		const workingDirectories = new Map<string, string>();
		const onDidChangeSessions = store.add(new Emitter<void>());
		const moves: string[] = [];
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ shownSession }));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: (resource: URI) => {
				const path = workingDirectories.get(resource.toString());
				return path ? upcastPartial<IAgentSession>({ metadata: { workingDirectoryPath: path } }) : undefined;
			},
			model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: onDidChangeSessions.event }),
		}));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.enabled }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: options.at ?? primary })] }),
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({ canSetLocation: () => options.canSetLocation ?? true }));
		instantiationService.stub(IWorkspaceEditingService, upcastPartial<IWorkspaceEditingService>({
			setFolderLocation: async (location: URI, moveOptions?: { readonly reason?: string }) => { moves.push(`${location.path} (${moveOptions?.reason})`); },
		}));
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		store.add(instantiationService.createInstance(AgentHostWorktreeFollowContribution));
		const show = (resource: URI, reason: IChatViewHostShownSession['reason'] = 'open') => shownSession.set({ resource, reason }, undefined);
		return { show, workingDirectories, onDidChangeSessions, moves, triggers: telemetryService.triggers };
	}

	const agentSession = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session-1' });
	const localChat = LocalChatSessionUri.forSession('local-1');

	test('moves the folder to the working directory of an agent host session the user opens, and back for a local chat, but not for a restored chat', () => {
		const { show, workingDirectories, moves, triggers } = createFollow({ enabled: true });
		workingDirectories.set(agentSession.toString(), worktree.fsPath);
		show(agentSession, 'restore');
		const restored = [...moves];
		show(agentSession);
		const opened = [...moves];

		const atWorktree = createFollow({ enabled: true, at: worktree });
		atWorktree.show(localChat);
		atWorktree.show(URI.from({ scheme: SessionType.CopilotCloud, path: '/cloud-1' }));

		assert.deepStrictEqual({ restored, opened, triggers, local: atWorktree.moves }, {
			restored: [],
			opened: ['/work/vscode.worktrees/feature (user)'],
			triggers: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`],
			local: ['/work/vscode (user)'],
		});
	});

	test('waits for the working directory of a session that the list does not have yet, and moves nothing where the folder already is', () => {
		const { show, workingDirectories, onDidChangeSessions, moves } = createFollow({ enabled: true });
		show(agentSession);
		const beforeListed = [...moves];
		workingDirectories.set(agentSession.toString(), worktree.fsPath);
		onDidChangeSessions.fire();
		const listed = [...moves];
		show(localChat);

		assert.deepStrictEqual({ beforeListed, listed, localAtPrimary: moves }, {
			beforeListed: [],
			listed: ['/work/vscode.worktrees/feature (user)'],
			localAtPrimary: ['/work/vscode.worktrees/feature (user)'],
		});
	});

	test('with the setting off, logs the same trigger but moves nothing; in a window whose folder cannot move, does neither', () => {
		const off = createFollow({ enabled: false });
		off.workingDirectories.set(agentSession.toString(), worktree.fsPath);
		off.show(agentSession);
		const notMovable = createFollow({ enabled: true, canSetLocation: false });
		notMovable.workingDirectories.set(agentSession.toString(), worktree.fsPath);
		notMovable.show(agentSession);

		assert.deepStrictEqual({ off: { moves: off.moves, triggers: off.triggers }, notMovable: { moves: notMovable.moves, triggers: notMovable.triggers } }, {
			off: { moves: [], triggers: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`] },
			notMovable: { moves: [], triggers: [] },
		});
	});
});
