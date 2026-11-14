/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../../platform/notification/test/common/testNotificationService.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IWorkspaceEditingService } from '../../../../../../services/workspaces/common/workspaceEditing.js';
import { TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { ITerminalInstance, ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { AgentHostWorktreeContribution } from '../../../../browser/agentSessions/agentHost/agentHostWorktree.contribution.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../browser/chatViewHost.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';

suite('AgentHostWorktree', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const worktree = URI.file('/work/vscode.worktrees/feature');
	const created = URI.file('/work/vscode.worktrees/created');

	/** The feature in a window whose folder is at `at`, recording the moves it asks for, the chats it opens and its experiment triggers. */
	function createWorktree(options: { readonly enabled: boolean; readonly at?: URI; readonly canSetLocation?: boolean; readonly worktrees?: readonly URI[]; readonly resolving?: Promise<void>; readonly terminalCwd?: URI }) {
		const worktrees = options.worktrees ?? [worktree, created];
		const marks: string[] = [];
		const terminal = upcastPartial<ITerminalInstance>({
			initialCwd: options.terminalCwd?.fsPath,
			statusList: upcastPartial<ITerminalInstance['statusList']>({ add: () => { marks.push('marked'); }, remove: () => { marks.push('unmarked'); } }),
		});
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		const workingDirectories = new Map<string, string>();
		const onDidChangeSessions = store.add(new Emitter<void>());
		const onDidChangeLocation = store.add(new Emitter<IFolderLocationChangeEvent>());
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const workspace = { at: options.at ?? primary };
		const moves: string[] = [];
		const opened: string[] = [];
		const providers: string[] = [];
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const configurationService = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.enabled });
		const contextKeyService = store.add(new MockContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		const folder = () => upcastPartial<IWorkspaceFolder>({ uri: workspace.at });

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			shownSession,
			openSession: async (resource: URI) => { opened.push(resource.path); return undefined; },
		}));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: (resource: URI) => {
				const path = workingDirectories.get(resource.toString());
				return path ? upcastPartial<IAgentSession>({ metadata: { workingDirectoryPath: path } }) : undefined;
			},
			model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: onDidChangeSessions.event }),
		}));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [folder()] }),
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			onDidChangeWorkbenchState: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			canSetLocation: () => options.canSetLocation ?? true,
			onDidChangeLocation: onDidChangeLocation.event,
			getLocation: () => workspace.at.path === primary.path ? undefined : upcastPartial<IResolvedFolderLocation>({ providerId: 'agentHost.sessionWorktrees' }),
			resolveLocation: async (_primary: URI, location: URI) => {
				await options.resolving;
				return worktrees.some(known => known.path === location.path) ? upcastPartial<IResolvedFolderLocation>({ uri: location }) : undefined;
			},
			registerProvider: () => { providers.push('registered'); return toDisposable(() => providers.push('unregistered')); },
		}));
		instantiationService.stub(IWorkspaceEditingService, upcastPartial<IWorkspaceEditingService>({
			setFolderLocation: async (location: URI, moveOptions?: { readonly ifIdle?: boolean; readonly reason?: string }) => {
				moves.push(`${location.path}${moveOptions?.ifIdle ? ' (automatic)' : ''}`);
				workspace.at = location;
				onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [folder()] });
				onDidChangeLocation.fire({ folder: folder(), reason: moveOptions?.reason === 'user' ? 'user' : 'programmatic' });
			},
		}));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({ stat: async () => upcastPartial<IFileStatWithMetadata>({}) }));
		instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => uri.path }));
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: options.terminalCwd ? [terminal] : [], onDidCreateInstance: Event.None }));
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		const contribution = store.add(instantiationService.createInstance(AgentHostWorktreeContribution));

		const show = (resource: URI, reason: IChatViewHostShownSession['reason'] = 'open') => shownSession.set({ resource, reason }, undefined);
		const setEnabled = (enabled: boolean) => {
			configurationService.setUserConfiguration(ChatConfiguration.EditorWindowEnableWorktree, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === ChatConfiguration.EditorWindowEnableWorktree } as never);
		};
		const userMovesTo = (location: URI) => {
			workspace.at = location;
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [folder()] });
			onDidChangeLocation.fire({ folder: folder(), reason: 'user' });
		};
		return { show, workingDirectories, onDidChangeSessions, moves, opened, providers, triggers: telemetryService.triggers, setEnabled, userMovesTo, contribution, marks };
	}

	const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
	const agentSession = (id: string) => URI.from({ scheme: SessionType.AgentHostCopilot, path: `/${id}` });
	const localChat = LocalChatSessionUri.forSession('local-1');

	test('follows a chat the user opens to its worktree and a local chat back to the folder, but not a restored chat', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'), 'restore');
		await settle();
		const restored = [...feature.moves];
		feature.show(agentSession('a'));
		await settle();
		feature.show(localChat);
		await settle();

		assert.deepStrictEqual({ restored, moves: feature.moves, providers: feature.providers, triggers: feature.triggers }, {
			restored: [],
			moves: ['/work/vscode.worktrees/feature', '/work/vscode'],
			providers: ['registered'],
			triggers: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`],
		});
	});

	test('follows on its own once the shown session\'s working directory is known, or as it changes, such as to a worktree its agent created', async () => {
		const feature = createWorktree({ enabled: true });
		feature.show(agentSession('new'));
		await settle();
		const beforeKnown = [...feature.moves];
		feature.workingDirectories.set(agentSession('new').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		feature.workingDirectories.set(agentSession('new').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();

		assert.deepStrictEqual({ beforeKnown, moves: feature.moves }, {
			beforeKnown: [],
			moves: ['/work/vscode.worktrees/feature (automatic)', '/work/vscode.worktrees/created (automatic)'],
		});
	});

	test('opens the last chat of a location the user moves the folder to themselves', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.show(localChat);
		await settle();
		feature.userMovesTo(worktree);

		assert.deepStrictEqual({ moves: feature.moves, opened: feature.opened }, {
			moves: ['/work/vscode.worktrees/feature', '/work/vscode'],
			opened: ['/a'],
		});
	});

	test('with the setting off, logs the same trigger but moves nothing; turned off at a worktree, returns the folder to its own location', async () => {
		const off = createWorktree({ enabled: false });
		off.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		off.show(agentSession('a'));
		await settle();

		const turnedOff = createWorktree({ enabled: true, at: worktree });
		turnedOff.setEnabled(false);
		await settle();

		const notMovable = createWorktree({ enabled: true, canSetLocation: false });
		notMovable.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		notMovable.show(agentSession('a'));
		await settle();

		assert.deepStrictEqual({
			off: { moves: off.moves, providers: off.providers, triggers: off.triggers },
			turnedOff: { moves: turnedOff.moves, providers: turnedOff.providers },
			notMovable: { moves: notMovable.moves, triggers: notMovable.triggers },
		}, {
			off: { moves: [], providers: [], triggers: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`] },
			turnedOff: { moves: ['/work/vscode'], providers: ['registered', 'unregistered'] },
			notMovable: { moves: [], triggers: [] },
		});
	});

	test('a later choice, also one that moves nothing, or a move of the user\'s own, supersedes a switch still under way', async () => {
		const run = async (supersede: (feature: ReturnType<typeof createWorktree>) => void) => {
			const resolving = new DeferredPromise<void>();
			const feature = createWorktree({ enabled: true, resolving: resolving.p });
			feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
			feature.show(agentSession('a'));
			await settle();
			supersede(feature);
			resolving.complete();
			await settle();
			return feature.moves;
		};
		assert.deepStrictEqual({
			chatThatMovesNothing: await run(feature => feature.show(localChat)),
			userMove: await run(feature => feature.userMovesTo(primary.with({ path: '/work/elsewhere' }))),
		}, { chatThatMovesNothing: [], userMove: [] });
	});

	test('follows to a worktree inside the folder, and back to the folder for a chat that works in a folder inside it', async () => {
		const nested = URI.file('/work/vscode/.worktrees/nested');
		const feature = createWorktree({ enabled: true, worktrees: [nested] });
		feature.workingDirectories.set(agentSession('nested').toString(), nested.fsPath);
		feature.workingDirectories.set(agentSession('src').toString(), URI.file('/work/vscode/src').fsPath);
		feature.show(agentSession('nested'));
		await settle();
		feature.show(agentSession('src'));
		await settle();
		const atFolder = [...feature.moves];
		feature.show(agentSession('src'));
		await settle();

		assert.deepStrictEqual({ atFolder, again: feature.moves }, {
			atFolder: ['/work/vscode/.worktrees/nested', '/work/vscode'],
			again: ['/work/vscode/.worktrees/nested', '/work/vscode'],
		});
	});

	test('a restored chat\'s working directory that becomes known as the list loads moves nothing, but a later change does', async () => {
		const feature = createWorktree({ enabled: true });
		feature.show(agentSession('restored'), 'restore');
		await settle();
		feature.workingDirectories.set(agentSession('restored').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		const hydrated = [...feature.moves];
		feature.workingDirectories.set(agentSession('restored').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();

		assert.deepStrictEqual({ hydrated, changed: feature.moves }, { hydrated: [], changed: ['/work/vscode.worktrees/created (automatic)'] });
	});

	test('a switch under way does not apply once disposed', async () => {
		const resolving = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, resolving: resolving.p });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.contribution.dispose();
		resolving.complete();
		await settle();

		assert.deepStrictEqual(feature.moves, []);
	});

	test('marks terminals only while on, and clears their marks as it turns off', async () => {
		const off = createWorktree({ enabled: false, at: worktree, terminalCwd: primary });
		off.userMovesTo(primary);
		off.userMovesTo(worktree);
		const on = createWorktree({ enabled: true, at: worktree, terminalCwd: primary });
		on.userMovesTo(primary);
		on.userMovesTo(worktree);
		const whileOn = [...on.marks];
		on.setEnabled(false);
		await settle();

		assert.deepStrictEqual({ off: off.marks, whileOn: whileOn.includes('marked'), afterOff: on.marks.at(-1) }, { off: [], whileOn: true, afterOff: 'unmarked' });
	});
});
