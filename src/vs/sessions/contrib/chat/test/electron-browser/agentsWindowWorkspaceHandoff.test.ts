/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowOpenSource, IAgentsWindowDraft } from '../../../../../platform/window/common/window.js';
import { ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISessionsWindowOpenContext, SessionsWindowOpenTelemetry } from '../../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { SelectAgentsFolderContribution } from '../../electron-browser/chat.contribution.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentsWindowWorkspaceHandoff } from '../../browser/agentsWindowWorkspaceHandoff.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';

const startWindowOpenTelemetry = Reflect.get(SelectAgentsFolderContribution.prototype, '_startWindowOpenTelemetry') as (
	source: AgentsWindowOpenSource,
	context: ISessionsWindowOpenContext,
) => SessionsWindowOpenTelemetry | undefined;

suite('Agents Window workspace handoff telemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes a typed draft without a workspace and preserves existing-session precedence', async () => {
		const draft: IAgentsWindowDraft = { inputText: 'Incoming', attachments: '[]' };
		const drafts: IAgentsWindowWorkspaceHandoff[] = [];
		const sessions: URI[] = [];
		const handleOpenIntent = Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
			this: typeof harness, folder: URI | undefined, session: URI | undefined,
			isDefault: boolean, token: CancellationToken, telemetry: undefined, draft: IAgentsWindowDraft
		) => Promise<void>;
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const harness = {
			configurationService,
			_workspaceHandoff: { selectWorkspace: async (intent: IAgentsWindowWorkspaceHandoff) => { drafts.push(intent); } },
			openExistingSession: async (resource: URI) => { sessions.push(resource); },
		};
		await handleOpenIntent.call(harness, undefined, undefined, true, CancellationToken.None, undefined, draft);
		const persisted = URI.parse('agent-host-copilot:/persisted');
		await handleOpenIntent.call(harness, URI.file('/source'), persisted, false, CancellationToken.None, undefined, draft);
		assert.deepStrictEqual({ drafts, sessions }, {
			drafts: [{ folderUri: undefined, preferDevContainer: false, isDefault: true, draft }],
			sessions: [persisted],
		});
	});

	test('preserves unresolved draft workspace intent instead of treating remote workspaces as absent', async () => {
		const configurationService = new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const calls: IAgentsWindowWorkspaceHandoff[] = [];
		const harness = {
			configurationService,
			_workspaceHandoff: { selectWorkspace: async (intent: IAgentsWindowWorkspaceHandoff) => { calls.push(intent); } },
			openExistingSession: async () => assert.fail('A draft must not open an existing session'),
		};
		const handleOpenIntent = Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
			this: typeof harness, workspace: URI | undefined, session: URI | undefined, isDefault: boolean,
			token: CancellationToken, telemetry: undefined, draft?: IAgentsWindowDraft
		) => Promise<void>;
		const hostFolder = URI.file('/host/project');
		const remoteWorkspaces = [
			URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/project' }),
			URI.from({ scheme: Schemas.vscodeRemote, authority: 'tunnel+host', path: '/project' }),
			URI.from({ scheme: Schemas.vscodeRemote, authority: `dev-container+${encodeHex(VSBuffer.fromString(hostFolder.fsPath))}@ssh-remote+host`, path: '/project' }),
			URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'remote-host', path: '/project' }),
			URI.from({ scheme: 'unavailable-workspace', path: '/project' }),
		];
		const draft = { inputText: 'Work in the source project', attachments: '[]' };
		for (const workspace of remoteWorkspaces) {
			await handleOpenIntent.call(harness, workspace, undefined, false, CancellationToken.None, undefined, draft);
		}
		const localContainer = URI.from({ scheme: Schemas.vscodeRemote, authority: `dev-container+${encodeHex(VSBuffer.fromString(hostFolder.fsPath))}`, path: '/project' });
		await handleOpenIntent.call(harness, localContainer, undefined, false, CancellationToken.None, undefined, draft);
		await handleOpenIntent.call(harness, remoteWorkspaces[0], undefined, false, CancellationToken.None, undefined);
		assert.deepStrictEqual(calls.map(intent => ({
			folder: intent.folderUri?.toString(), preferDevContainer: intent.preferDevContainer, draft: intent.draft,
		})), [
			...remoteWorkspaces.map(workspace => ({ folder: workspace.toString(), preferDevContainer: false, draft })),
			{ folder: hostFolder.toString(), preferDevContainer: true, draft },
		]);
	});

	test('later opening requests cannot change the initial opening context or handoff tracker', () => {
		const lifecycleService = disposables.add(new TestLifecycleService());
		const events: { name: string; data?: ITelemetryData }[] = [];
		const harness = {
			startWindowOpenTelemetry,
			_didHandleInitialWindowOpen: false,
			_windowOpenTelemetry: disposables.add(new MutableDisposable<SessionsWindowOpenTelemetry>()),
			_workspaceSelectionTelemetry: disposables.add(new MutableDisposable()),
			instantiationService: { createInstance: () => Disposable.None },
			storageService: disposables.add(new InMemoryStorageService()),
			telemetryService: upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }),
			sessionsManagementService: { getSessions: () => [] },
			sessionsSetUpService: { initialSignInDialogShown: false },
			_getWindowOpenViewState: () => ({ workspacePreselected: false, workspacePreselectionSource: 'none', viewKind: 'noComposer' }),
			lifecycleService,
		};
		const initialTracker = harness.startWindowOpenTelemetry(AgentsWindowOpenSource.TitleBar, { workspaceArgumentKind: 'local', hasSessionArgument: false, workspaceArgumentIsDefault: true });
		initialTracker?.recordWorkspaceHandoffState('waitingForProvider');
		const subsequentTracker = harness.startWindowOpenTelemetry(AgentsWindowOpenSource.CommandPalette, { workspaceArgumentKind: 'none', hasSessionArgument: true });
		subsequentTracker?.recordWorkspaceHandoffState('applied');
		lifecycleService.fireShutdown(ShutdownReason.CLOSE);

		const data = events.find(event => event.name === 'agents/firstTimeWindowOpen')?.data;
		assert.deepStrictEqual({
			eventNames: events.map(event => event.name),
			hasInitialTracker: initialTracker !== undefined,
			hasSubsequentTracker: subsequentTracker !== undefined,
			source: data?.source,
			argument: data?.workspaceArgumentKind,
			isDefault: data?.workspaceArgumentIsDefault,
			hasSessionArgument: data?.hasSessionArgument,
			handoff: data?.workspaceHandoffStateAtEmission,
			nonArchivedSessionListCount: data?.nonArchivedSessionListCount,
		}, {
			eventNames: ['agents/windowSessionStart', 'agents/firstTimeWindowOpen'],
			hasInitialTracker: true,
			hasSubsequentTracker: false,
			source: 'titleBar',
			argument: 'local',
			isDefault: true,
			hasSessionArgument: false,
			handoff: 'waitingForProvider',
			nonArchivedSessionListCount: 0,
		});
	});

	test('a superseded existing-session lookup cannot navigate after a newer opening', async () => {
		const found = new DeferredPromise<boolean>();
		const cancellation = disposables.add(new CancellationTokenSource());
		let opened = false;
		const harness = {
			resolveAndOpenSession: Reflect.get(SelectAgentsFolderContribution.prototype, 'resolveAndOpenSession') as (resource: URI, token: CancellationTokenSource['token']) => Promise<void>,
			waitForSessionAvailable: () => found.p,
			sessionsService: { openSession: async () => { opened = true; } },
			logService: { info: () => { }, warn: () => { } },
		};
		const opening = harness.resolveAndOpenSession(URI.file('/private/session'), cancellation.token);
		cancellation.cancel();
		await found.complete(true);
		await opening;
		assert.strictEqual(opened, false);
	});

	for (const kind of ['session', 'link'] as const) {
		for (const alreadyCancelled of [false, true]) {
			test(`disposes ${kind} lookup listeners on ${alreadyCancelled ? 'immediate' : 'pending'} cancellation`, async () => {
				const changed = disposables.add(new Emitter<void>());
				const resolved = disposables.add(new Emitter<void>());
				const cancellation = disposables.add(new CancellationTokenSource());
				const harness = {
					waitForSessionAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionAvailable') as (resource: URI, token: CancellationToken) => Promise<boolean>,
					waitForSessionLinkAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionLinkAvailable') as (resource: URI, token: CancellationToken) => Promise<ISession | undefined>,
					sessionsManagementService: { getSession: () => undefined, getSessions: () => [], onDidChangeSessions: changed.event },
					agentHostConnectionsService: { onDidChangeSessionResolution: resolved.event },
				};
				if (alreadyCancelled) {
					cancellation.cancel();
				}
				const resource = URI.parse('agent-host-copilot:/session');
				const opening = kind === 'link'
					? harness.waitForSessionLinkAvailable(resource, cancellation.token)
					: harness.waitForSessionAvailable(resource, cancellation.token);
				const listening = changed.hasListeners();
				cancellation.cancel();
				const result = await opening;
				assert.deepStrictEqual({ listening, result, listenersRemain: changed.hasListeners() || resolved.hasListeners() }, {
					listening: !alreadyCancelled, result: kind === 'link' ? undefined : false, listenersRemain: false,
				});
			});
		}
	}
});
