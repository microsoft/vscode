/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostExtensionInitializeResultMeta, IAgentHostExtensionInitializeResult } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/common/environmentService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { IOpenNewSessionOptions, ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { INewSessionComposer, INewSessionComposerService } from '../../../../chat/browser/newSessionComposerService.js';
import { LocalCanvasPocWorkspaceContribution } from '../../browser/localCanvasPocWorkspace.js';

suite('Local canvas PoC workspace recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const expected = URI.file('/canvas-demo/workspace');
	const other = URI.file('/somewhere-else');

	function initialize(enabled = true): IAgentHostExtensionInitializeResult {
		return { protocolVersion: '0.1.0', serverSeq: 0, snapshots: [], _meta: getAgentHostExtensionInitializeResultMeta(enabled, expected.toString()) };
	}

	function session(id: string, directories: readonly URI[] = [other], providerId = LOCAL_AGENT_HOST_PROVIDER_ID, sessionType = 'copilotcli', created = true) {
		const workspace: ISessionWorkspace = {
			uri: directories[0] ?? other, label: id, icon: Codicon.folder, requiresWorkspaceTrust: true, isVirtualWorkspace: false,
			folders: directories.map(root => ({ root, workingDirectory: root, name: id, description: undefined })),
		};
		const chat = new class extends mock<IChat>() {
			override readonly resource = URI.parse(`agent-host-copilotcli:/${id}`);
		}();
		return new class extends mock<IActiveSession>() {
			override readonly sessionId = id;
			override readonly providerId = providerId;
			override readonly sessionType = sessionType;
			override readonly resource = chat.resource;
			override readonly workspace = observableValue<ISessionWorkspace | undefined>('workspace', workspace);
			override readonly activeChat = constObservable<IChat>(chat);
			override readonly isCreated = constObservable(created);
			override readonly status = constObservable(created ? SessionStatus.Completed : SessionStatus.Untitled);
		}();
	}

	function setupContribution(options?: { enabled?: boolean; built?: boolean; remoteAuthority?: string; deferTrust?: boolean }) {
		const instantiation = store.add(new TestInstantiationService());
		const init = observableValue<IAgentHostExtensionInitializeResult | undefined>('initialize', initialize(options?.enabled ?? true));
		const active = observableValue<IActiveSession | undefined>('active', session('wrong'));
		const draft = observableValue<ISession | undefined>('draft', undefined);
		const hasInput = observableValue('hasInput', false);
		const composer: INewSessionComposer = { hasInput, animatePrompt: async () => true, showPromptOptions: () => true };
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const notices = new Map<string, IChatInputNotification>();
		const messages: string[] = [];
		const opens: IOpenNewSessionOptions[] = [];
		const created: ISession[] = [];
		const trust = new DeferredPromise<boolean>();
		if (!options?.deferTrust) {
			void trust.complete(true);
		}
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override readonly initializeResult = init;
		}());
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = active;
			override async openNewSession(options: IOpenNewSessionOptions | undefined, token = CancellationToken.None) {
				assert.ok(options?.folderUri);
				opens.push(options);
				const trusted = await trust.p;
				if (token.isCancellationRequested || !trusted) {
					return { session: undefined, trustDeclined: !trusted };
				}
				const target = session('demo', [options.folderUri], options.providerId, options.sessionTypeId, false);
				created.push(target);
				active.set(target, undefined);
				return { session: target, trustDeclined: false };
			}
		}());
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly newSession = draft;
		}());
		instantiation.stub(INewSessionComposerService, new class extends mock<INewSessionComposerService>() {
			override readonly activeComposer = constObservable(composer);
		}());
		instantiation.stub(IChatInputNotificationService, new class extends mock<IChatInputNotificationService>() {
			override setNotification(notification: IChatInputNotification) { notices.set(notification.id, notification); }
			override deleteNotification(id: string) { notices.delete(id); }
		}());
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override info(message: string) { messages.push(message); }
		}());
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly sentimentObs = sentiment;
			override get sentiment() { return sentiment.get(); }
		}());
		instantiation.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isBuilt = options?.built ?? false;
			override readonly remoteAuthority = options?.remoteAuthority;
		}());
		const contribution = store.add(instantiation.createInstance(LocalCanvasPocWorkspaceContribution));
		const run = async (sessionId = active.get()?.sessionId) => {
			const command = CommandsRegistry.getCommand(LocalCanvasPocWorkspaceContribution.openCommandId);
			assert.ok(command);
			await instantiation.invokeFunction(command.handler, sessionId);
		};
		return { active, draft, hasInput, init, sentiment, notices, messages, opens, created, trust, run, contribution };
	}

	test('offers a concrete, scoped recovery action and removes it in the expected workspace', () => {
		const h = setupContribution();
		const notice = h.notices.get(LocalCanvasPocWorkspaceContribution.ID);
		assert.ok(notice);
		assert.ok(typeof notice.description === 'string');
		assert.ok(notice.description.includes(expected.fsPath) && notice.description.includes(other.fsPath));
		assert.deepStrictEqual({ action: notice.actions[0].label, resources: notice.sessionResources?.map(uri => uri.toString()) }, {
			action: 'New Session in Demo Workspace', resources: [h.active.get()?.activeChat.get().resource.toString()],
		});
		h.active.set(session('correct', [expected]), undefined);
		assert.strictEqual(h.notices.size, 0);
	});

	test('does not offer recovery for another provider, another harness, missing capability, or disabled AI', () => {
		const h = setupContribution();
		const counts: number[] = [];
		h.active.set(session('remote', [other], 'remote-agent-host'), undefined);
		counts.push(h.notices.size);
		h.active.set(session('claude', [other], LOCAL_AGENT_HOST_PROVIDER_ID, 'claude'), undefined);
		counts.push(h.notices.size);
		h.init.set(initialize(false), undefined);
		h.active.set(session('wrong'), undefined);
		counts.push(h.notices.size);
		h.init.set(initialize(), undefined);
		h.sentiment.set({ hidden: true }, undefined);
		counts.push(h.notices.size);
		assert.deepStrictEqual(counts, [0, 0, 0, 0]);
	});

	test('is inert in built and remote windows', () => {
		for (const options of [{ built: true }, { remoteAuthority: 'ssh-remote+host' }]) {
			const h = setupContribution(options);
			assert.deepStrictEqual({ notices: h.notices.size, command: CommandsRegistry.getCommand(LocalCanvasPocWorkspaceContribution.openCommandId) }, { notices: 0, command: undefined });
			h.contribution.dispose();
		}
	});

	test('creates a fresh local Copilot draft, retaining the existing conversation and requiring no prompt replay', async () => {
		const h = setupContribution();
		const original = h.active.get();
		await h.run();
		assert.deepStrictEqual({
			opens: h.opens.map(options => ({ ...options, folderUri: options.folderUri?.toString() })),
			originalWorkspace: original?.workspace.get()?.folders[0].workingDirectory.toString(),
			active: h.active.get()?.sessionId,
			created: h.created.length,
			notices: h.notices.size,
		}, {
			opens: [{ folderUri: expected.toString(), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli', isolationMode: 'workspace', cancelRestore: true }],
			originalWorkspace: other.toString(), active: 'demo', created: 1, notices: 0,
		});
	});

	test('keeps a current draft with text or attachments instead of repurposing it', async () => {
		const h = setupContribution();
		h.hasInput.set(true, undefined);
		await h.run();
		assert.deepStrictEqual({ opens: h.opens.length, active: h.active.get()?.sessionId, notified: h.messages.length }, { opens: 0, active: 'wrong', notified: 1 });
	});

	test('keeps a separate pending draft, including one whose composer is not mounted', async () => {
		const h = setupContribution();
		const pending = session('pending', [other], LOCAL_AGENT_HOST_PROVIDER_ID, 'copilotcli', false);
		h.draft.set(pending, undefined);
		await h.run();
		assert.deepStrictEqual({ opens: h.opens.length, preserved: h.draft.get() === pending, notified: h.messages.length }, { opens: 0, preserved: true, notified: 1 });
	});

	test('does not create a session after the normal trust prompt is declined', async () => {
		const h = setupContribution({ deferTrust: true });
		const recovery = h.run();
		await h.trust.complete(false);
		await recovery;
		assert.deepStrictEqual({ created: h.created.length, active: h.active.get()?.sessionId, notified: h.messages.length }, { created: 0, active: 'wrong', notified: 0 });
	});

	test('typing, navigation, host restart, AI disablement, and disposal cancel pending recovery', async () => {
		for (const change of ['input', 'navigation', 'restart', 'disable', 'dispose']) {
			const h = setupContribution({ deferTrust: true });
			const recovery = h.run();
			switch (change) {
				case 'input': h.hasInput.set(true, undefined); break;
				case 'navigation': h.active.set(session('newer'), undefined); break;
				case 'restart': h.init.set(undefined, undefined); break;
				case 'disable': h.sentiment.set({ hidden: true }, undefined); break;
				case 'dispose': h.contribution.dispose(); break;
			}
			await h.trust.complete(true);
			await recovery;
			assert.strictEqual(h.created.length, 0, change);
			h.contribution.dispose();
		}
	});

	test('a stale action does not act on the newly active session', async () => {
		const h = setupContribution();
		h.active.set(session('newer'), undefined);
		await h.run('wrong');
		assert.deepStrictEqual({ opens: h.opens.length, active: h.active.get()?.sessionId, notified: h.messages.length }, { opens: 0, active: 'newer', notified: 1 });
	});

	test('a second recovery supersedes the first without creating duplicate sessions', async () => {
		const h = setupContribution({ deferTrust: true });
		const first = h.run();
		const second = h.run();
		await h.trust.complete(true);
		await first;
		await second;
		assert.deepStrictEqual({ requested: h.opens.length, created: h.created.length, active: h.active.get()?.sessionId }, { requested: 2, created: 1, active: 'demo' });
	});

	test('disposal removes the workspace notification and command', () => {
		const h = setupContribution();
		h.contribution.dispose();
		assert.deepStrictEqual({ notices: h.notices.size, command: CommandsRegistry.getCommand(LocalCanvasPocWorkspaceContribution.openCommandId) }, { notices: 0, command: undefined });
	});
});
